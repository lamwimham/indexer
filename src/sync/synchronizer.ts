import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../utils/logger.js';
import type { IndexerConfig, ContractConfig, SyncMetrics } from '../types/index.js';
import { RpcClient, createRpcClientWrapper } from './rpc-client.js';
import { BlockFetcher } from './block-fetcher.js';
import { ReorgHandler } from './reorg-handler.js';
import {
  SyncStateRepository,
  EventRepository,
  BlockCheckpointRepository,
  TransferEventRepository,
} from '../storage/index.js';
import { sleep } from '../utils/retry.js';
import {
  updateSyncProgress,
  recordEvent,
  recordBlockSynced,
  setSyncingState,
  recordReorg,
  recordError,
} from '../monitoring/metrics.js';

/**
 * 事件处理器函数类型
 */
export type EventProcessorFn = (params: {
  chainId: number;
  contractAddress: string;
  contractName: string;
  blockNumber: bigint;
  blockTimestamp: Date;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
    transactionHash: string;
    transactionIndex: number;
    logIndex: number;
  }>;
  db: PrismaClient;
  logger: Logger;
}) => Promise<void>;

/**
 * 同步器 - 核心索引引擎
 */
export class Synchronizer {
  private config: IndexerConfig;
  private db: PrismaClient;
  private logger: Logger;
  private rpcClient: RpcClient;
  private blockFetcher: BlockFetcher;
  private reorgHandler: ReorgHandler;
  private syncStateRepo: SyncStateRepository;
  private eventRepo: EventRepository;
  private checkpointRepo: BlockCheckpointRepository;
  private transferRepo: TransferEventRepository;
  private eventProcessor?: EventProcessorFn;
  private isRunning = false;
  private metrics: Map<string, SyncMetrics> = new Map();

  constructor(
    config: IndexerConfig,
    db: PrismaClient,
    logger: Logger,
    eventProcessor?: EventProcessorFn
  ) {
    this.config = config;
    this.db = db;
    this.logger = logger.child({ component: 'synchronizer' });
    this.eventProcessor = eventProcessor;

    // 初始化RPC客户端
    const chain = config.chains[0];
    this.rpcClient = createRpcClientWrapper(
      chain.id,
      chain.rpcUrl,
      this.logger
    );

    // 初始化仓库
    this.syncStateRepo = new SyncStateRepository(db);
    this.eventRepo = new EventRepository(db);
    this.checkpointRepo = new BlockCheckpointRepository(db);
    this.transferRepo = new TransferEventRepository(db);

    // 初始化区块获取器和重组处理器
    this.blockFetcher = new BlockFetcher(
      this.rpcClient,
      this.logger,
      config.sync.maxConcurrentRequests
    );

    this.reorgHandler = new ReorgHandler(
      this.rpcClient,
      this.checkpointRepo,
      this.eventRepo,
      this.transferRepo,
      this.logger,
      config.sync.confirmations
    );
  }

  /**
   * 启动同步循环
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Synchronizer already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting synchronizer');

    // 检查RPC连接
    const isConnected = await this.rpcClient.checkConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to RPC endpoint');
    }

    // 验证链ID
    const networkChainId = await this.rpcClient.getNetworkChainId();
    const expectedChainId = this.config.chains[0].id;
    if (networkChainId !== expectedChainId) {
      throw new Error(
        `Chain ID mismatch: expected ${expectedChainId}, got ${networkChainId}`
      );
    }

    // 为每个合约启动同步循环
    const syncPromises = this.config.contracts.map((contract) =>
      this.syncContract(contract)
    );

    // 等待所有同步循环（它们会无限运行）
    await Promise.all(syncPromises);
  }

  /**
   * 停止同步
   */
  stop(): void {
    this.isRunning = false;
    this.logger.info('Stopping synchronizer');
  }

  /**
   * 同步单个合约
   */
  private async syncContract(contract: ContractConfig): Promise<void> {
    const chainId = this.config.chains[0].id;
    const log = this.logger.child({
      contract: contract.name,
      address: contract.address,
    });

    // 解析起始区块（-1表示最新区块）
    let startBlock = contract.startBlock;
    if (startBlock === -1n) {
      const latestBlock = await this.blockFetcher.getLatestBlockWithConfirmations(
        this.config.sync.confirmations
      );
      startBlock = latestBlock;
      log.info({ startBlock: startBlock.toString() }, 'Starting from latest block');
    } else {
      log.info({ startBlock: startBlock.toString() }, 'Starting contract sync');
    }

    // 获取或创建同步状态
    let syncState = await this.syncStateRepo.get(chainId, contract.address);

    if (!syncState) {
      syncState = await this.syncStateRepo.upsert(
        chainId,
        contract.address,
        contract.name,
        startBlock,
        false
      );
    }

    // 启动前检查重组
    const reorgResult = await this.reorgHandler.detectReorg(chainId);
    if (reorgResult.hasReorg && reorgResult.lastValidBlock) {
      log.warn(
        { reorgDepth: reorgResult.reorgDepth, lastValidBlock: reorgResult.lastValidBlock.toString() },
        'Reorg detected, rolling back'
      );
      recordReorg(chainId, reorgResult.reorgDepth);
      await this.reorgHandler.handleReorg(chainId, reorgResult.lastValidBlock + 1n);
      syncState = await this.syncStateRepo.get(chainId, contract.address);
      
      // 如果同步状态在重组期间被删除，则重新创建
      if (!syncState) {
        syncState = await this.syncStateRepo.upsert(
          chainId,
          contract.address,
          contract.name,
          startBlock,
          false
        );
      }
    }

    // 主同步循环
    while (this.isRunning) {
      try {
        await this.syncBatch(contract, BigInt(syncState!.lastSyncedBlock), log);
        // 刷新同步状态
        syncState = await this.syncStateRepo.get(chainId, contract.address);
      } catch (error) {
        log.error({ error }, 'Sync batch failed');
        recordError(
          chainId,
          contract.address,
          error instanceof Error ? error.constructor.name : 'UnknownError'
        );
        // 使用upsert确保记录存在后再记录错误
        if (syncState) {
          await this.syncStateRepo.recordError(
            chainId,
            contract.address,
            error instanceof Error ? error.message : 'Unknown error'
          );
        } else {
          await this.syncStateRepo.upsert(
            chainId,
            contract.address,
            contract.name,
            startBlock,
            false,
            error instanceof Error ? error.message : 'Unknown error'
          );
          syncState = await this.syncStateRepo.get(chainId, contract.address);
        }
      }

      // 等待下一次同步
      await sleep(this.config.sync.syncInterval);
    }
  }

  /**
   * 同步一批区块
   */
  private async syncBatch(
    contract: ContractConfig,
    fromBlock: bigint,
    log: Logger
  ): Promise<void> {
    const chainId = this.config.chains[0].id;

    // 获取最新的安全区块（带确认数）
    const latestBlock = await this.blockFetcher.getLatestBlockWithConfirmations(
      this.config.sync.confirmations
    );

    // 检查是否已追上链
    if (fromBlock >= latestBlock) {
      log.debug({ latestBlock: latestBlock.toString() }, 'Caught up with chain');
      return;
    }

    // 计算批次范围
    const toBlock = BigInt(
      Math.min(
        Number(fromBlock) + this.config.sync.batchSize,
        Number(latestBlock)
      )
    );

    log.debug(
      { fromBlock: fromBlock.toString(), toBlock: toBlock.toString() },
      'Syncing batch'
    );

    // 设置同步标志
    await this.syncStateRepo.setSyncing(chainId, contract.address, true);
    setSyncingState(chainId, contract.address, true);

    // 获取区块及其日志
    const blocks = await this.blockFetcher.fetchBlockRange(
      fromBlock + 1n,
      toBlock,
      [contract.address]
    );

    // 处理每个区块
    for (const { block, logs } of blocks) {
      if (!this.isRunning) break;

      // 过滤该合约的日志
      const contractLogs = logs.filter(
        (l) => l.address.toLowerCase() === contract.address.toLowerCase()
      );

      if (contractLogs.length > 0) {
        // 处理事件
        if (this.eventProcessor) {
          await this.eventProcessor({
            chainId,
            contractAddress: contract.address,
            contractName: contract.name,
            blockNumber: block.number!,
            blockTimestamp: new Date(Number(block.timestamp) * 1000),
            logs: contractLogs.map((l) => ({
              address: l.address,
              topics: [...l.topics] as string[],
              data: l.data,
              transactionHash: l.transactionHash ?? '',
              transactionIndex: l.transactionIndex ?? 0,
              logIndex: l.logIndex ?? 0,
            })),
            db: this.db,
            logger: log,
          });
        }

        // 记录已处理的事件
        for (const log of contractLogs) {
          recordEvent(chainId, contract.address, log.topics[0] ?? 'unknown');
        }

        // 保存检查点
        await this.reorgHandler.saveCheckpoint(
          chainId,
          block.number!,
          block.hash!,
          new Date(Number(block.timestamp) * 1000)
        );
      }

      // 更新同步状态
      await this.syncStateRepo.upsert(
        chainId,
        contract.address,
        contract.name,
        block.number!,
        true
      );

      // 记录已同步区块
      recordBlockSynced(chainId, contract.address, contract.name);

      // 更新指标
      this.updateMetrics(chainId, contract.address, block.number!, latestBlock);
    }

    // 清除同步标志
    await this.syncStateRepo.setSyncing(chainId, contract.address, false);
    setSyncingState(chainId, contract.address, false);

    log.info(
      {
        syncedTo: toBlock.toString(),
        latestBlock: latestBlock.toString(),
        blocksBehind: (latestBlock - toBlock).toString(),
      },
      'Batch synced'
    );
  }

  /**
   * 更新同步指标
   */
  private updateMetrics(
    chainId: number,
    contractAddress: string,
    currentBlock: bigint,
    latestBlock: bigint
  ): void {
    const key = `${chainId}-${contractAddress}`;
    const existing = this.metrics.get(key);

    this.metrics.set(key, {
      chainId,
      contractAddress: contractAddress as `0x${string}`,
      currentBlock: currentBlock.toString(),
      latestBlock: latestBlock.toString(),
      blocksBehind: (latestBlock - currentBlock).toString(),
      eventsProcessed: (existing?.eventsProcessed ?? 0) + 1,
      errors: existing?.errors ?? 0,
      lastSyncTime: new Date(),
      syncSpeed: existing?.syncSpeed ?? 0,
    });

    // 更新Prometheus指标
    const contract = this.config.contracts.find(
      (c) => c.address.toLowerCase() === contractAddress.toLowerCase()
    );
    updateSyncProgress(
      chainId,
      contractAddress,
      contract?.name ?? 'unknown',
      currentBlock,
      latestBlock
    );
  }

  /**
   * 获取当前同步指标
   */
  getMetrics(): SyncMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * 获取所有合约的同步状态
   */
  async getSyncStatus(): Promise<Array<{
    chainId: number;
    contractAddress: string;
    contractName: string;
    lastSyncedBlock: string;
    isSyncing: boolean;
    latestBlock: string;
    blocksBehind: string;
  }>> {
    const states = await this.syncStateRepo.getAll();
    const latestBlock = await this.rpcClient.getLatestBlockNumber();

    return states.map((state) => {
      const lastSyncedBlock = BigInt(state.lastSyncedBlock);
      const blocksBehind = latestBlock - lastSyncedBlock;

      return {
        chainId: state.chainId,
        contractAddress: state.contractAddress,
        contractName: state.contractName,
        lastSyncedBlock: state.lastSyncedBlock,
        isSyncing: state.isSyncing,
        latestBlock: latestBlock.toString(),
        blocksBehind: blocksBehind.toString(),
      };
    });
  }
}