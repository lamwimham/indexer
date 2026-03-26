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
 * Event processor function type
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
 * Synchronizer - Core indexing engine
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

    // Initialize RPC client
    const chain = config.chains[0];
    this.rpcClient = createRpcClientWrapper(
      chain.id,
      chain.rpcUrl,
      this.logger
    );

    // Initialize repositories
    this.syncStateRepo = new SyncStateRepository(db);
    this.eventRepo = new EventRepository(db);
    this.checkpointRepo = new BlockCheckpointRepository(db);
    this.transferRepo = new TransferEventRepository(db);

    // Initialize fetcher and reorg handler
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
   * Start the synchronization loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Synchronizer already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting synchronizer');

    // Check RPC connection
    const isConnected = await this.rpcClient.checkConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to RPC endpoint');
    }

    // Verify chain ID
    const networkChainId = await this.rpcClient.getNetworkChainId();
    const expectedChainId = this.config.chains[0].id;
    if (networkChainId !== expectedChainId) {
      throw new Error(
        `Chain ID mismatch: expected ${expectedChainId}, got ${networkChainId}`
      );
    }

    // Start sync loop for each contract
    const syncPromises = this.config.contracts.map((contract) =>
      this.syncContract(contract)
    );

    // Wait for all sync loops (they run indefinitely)
    await Promise.all(syncPromises);
  }

  /**
   * Stop the synchronization
   */
  stop(): void {
    this.isRunning = false;
    this.logger.info('Stopping synchronizer');
  }

  /**
   * Sync a single contract
   */
  private async syncContract(contract: ContractConfig): Promise<void> {
    const chainId = this.config.chains[0].id;
    const log = this.logger.child({
      contract: contract.name,
      address: contract.address,
    });

    // Resolve start block (-1 means latest block)
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

    // Get or create sync state
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

    // Check for reorg before starting
    const reorgResult = await this.reorgHandler.detectReorg(chainId);
    if (reorgResult.hasReorg && reorgResult.lastValidBlock) {
      log.warn(
        { reorgDepth: reorgResult.reorgDepth, lastValidBlock: reorgResult.lastValidBlock.toString() },
        'Reorg detected, rolling back'
      );
      recordReorg(chainId, reorgResult.reorgDepth);
      await this.reorgHandler.handleReorg(chainId, reorgResult.lastValidBlock + 1n);
      syncState = await this.syncStateRepo.get(chainId, contract.address);
      
      // If syncState was deleted during reorg, recreate it
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

    // Main sync loop
    while (this.isRunning) {
      try {
        await this.syncBatch(contract, BigInt(syncState!.lastSyncedBlock), log);
        // Refresh sync state after successful batch
        syncState = await this.syncStateRepo.get(chainId, contract.address);
      } catch (error) {
        log.error({ error }, 'Sync batch failed');
        recordError(
          chainId,
          contract.address,
          error instanceof Error ? error.constructor.name : 'UnknownError'
        );
        // Use upsert to ensure record exists before recording error
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

      // Wait before next sync
      await sleep(this.config.sync.syncInterval);
    }
  }

  /**
   * Sync a batch of blocks
   */
  private async syncBatch(
    contract: ContractConfig,
    fromBlock: bigint,
    log: Logger
  ): Promise<void> {
    const chainId = this.config.chains[0].id;

    // Get the latest safe block (with confirmations)
    const latestBlock = await this.blockFetcher.getLatestBlockWithConfirmations(
      this.config.sync.confirmations
    );

    // Check if we're caught up
    if (fromBlock >= latestBlock) {
      log.debug({ latestBlock: latestBlock.toString() }, 'Caught up with chain');
      return;
    }

    // Calculate batch range
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

    // Set syncing flag
    await this.syncStateRepo.setSyncing(chainId, contract.address, true);
    setSyncingState(chainId, contract.address, true);

    // Fetch blocks with logs
    const blocks = await this.blockFetcher.fetchBlockRange(
      fromBlock + 1n,
      toBlock,
      [contract.address]
    );

    // Process each block
    for (const { block, logs } of blocks) {
      if (!this.isRunning) break;

      // Filter logs for this contract
      const contractLogs = logs.filter(
        (l) => l.address.toLowerCase() === contract.address.toLowerCase()
      );

      if (contractLogs.length > 0) {
        // Process events
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

        // Record events processed
        for (const log of contractLogs) {
          recordEvent(chainId, contract.address, log.topics[0] ?? 'unknown');
        }

        // Save checkpoint
        await this.reorgHandler.saveCheckpoint(
          chainId,
          block.number!,
          block.hash!,
          new Date(Number(block.timestamp) * 1000)
        );
      }

      // Update sync state
      await this.syncStateRepo.upsert(
        chainId,
        contract.address,
        contract.name,
        block.number!,
        true
      );

      // Record block synced
      recordBlockSynced(chainId, contract.address, contract.name);

      // Update metrics
      this.updateMetrics(chainId, contract.address, block.number!, latestBlock);
    }

    // Clear syncing flag
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
   * Update sync metrics
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

    // Update Prometheus metrics
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
   * Get current sync metrics
   */
  getMetrics(): SyncMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get sync status for all contracts
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