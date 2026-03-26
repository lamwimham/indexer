import { createPublicClient, http, type PublicClient, type Chain } from 'viem';
import { mainnet, goerli, sepolia, polygon, arbitrum, optimism, bsc, avalanche } from 'viem/chains';
import type { Logger } from '../utils/logger.js';
import { recordRpcCall } from '../monitoring/metrics.js';

/**
 * 根据链ID获取viem链配置
 */
export function getChain(chainId: number): Chain {
  const chains: Record<number, Chain> = {
    1: mainnet,
    5: goerli,
    11155111: sepolia,
    137: polygon,
    42161: arbitrum,
    10: optimism,
    56: bsc,
    43114: avalanche,
  };

  const chain = chains[chainId];
  if (!chain) {
    // 返回自定义链配置
    return {
      id: chainId,
      name: `Chain ${chainId}`,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [] } },
    };
  }

  return chain;
}

/**
 * 创建viem公共客户端
 */
export function createRpcClient(
  chainId: number,
  rpcUrl: string,
  logger?: Logger
): PublicClient {
  const chain = getChain(chainId);

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, {
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 1000,
      onFetchRequest: (request) => {
        logger?.trace({ url: request.url }, 'RPC request');
      },
      onFetchResponse: (response) => {
        logger?.trace({ status: response.status }, 'RPC response');
      },
    }),
    batch: {
      multicall: {
        batchSize: 100,
        wait: 50,
      },
    },
  });

  return client;
}

/**
 * RPC客户端包装器，提供额外的工具方法
 */
export class RpcClient {
  private client: PublicClient;
  private chainId: number;
  private logger: Logger;

  constructor(client: PublicClient, chainId: number, logger: Logger) {
    this.client = client;
    this.chainId = chainId;
    this.logger = logger;
  }

  /**
   * 包装RPC调用并记录指标
   */
  private async withMetrics<T>(
    method: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      recordRpcCall(method, Date.now() - start, true);
      return result;
    } catch (error) {
      recordRpcCall(method, Date.now() - start, false);
      throw error;
    }
  }

  /**
   * 获取底层的viem客户端
   */
  getClient(): PublicClient {
    return this.client;
  }

  /**
   * 获取链ID
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * 获取最新区块号
   */
  async getLatestBlockNumber(): Promise<bigint> {
    return this.withMetrics('getBlockNumber', () => this.client.getBlockNumber());
  }

  /**
   * 根据区块号获取区块
   */
  async getBlock(blockNumber: bigint) {
    return this.withMetrics('getBlock', () =>
      this.client.getBlock({
        blockNumber,
        includeTransactions: false,
      })
    );
  }

  /**
   * 根据区块哈希获取区块
   */
  async getBlockByHash(blockHash: `0x${string}`) {
    return this.withMetrics('getBlock', () =>
      this.client.getBlock({
        blockHash,
        includeTransactions: false,
      })
    );
  }

  /**
   * 获取区块范围内的日志
   */
  async getLogs(params: {
    address?: `0x${string}` | `0x${string}`[];
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    return this.withMetrics('getLogs', () =>
      this.client.getLogs({
        address: params.address,
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
      })
    );
  }

  /**
   * 批量获取多个区块
   */
  async getBlocks(blockNumbers: bigint[]) {
    return this.withMetrics('getBlocks', () =>
      Promise.all(blockNumbers.map((bn) => this.getBlock(bn)))
    );
  }

  /**
   * 检查是否已连接
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.withMetrics('getBlockNumber', () => this.client.getBlockNumber());
      return true;
    } catch (error) {
      this.logger.error({ error }, 'RPC connection check failed');
      return false;
    }
  }

  /**
   * 从网络获取链ID
   */
  async getNetworkChainId(): Promise<number> {
    return this.withMetrics('getChainId', async () =>
      Number(await this.client.getChainId())
    );
  }
}

/**
 * 创建RPC客户端实例
 */
export function createRpcClientWrapper(
  chainId: number,
  rpcUrl: string,
  logger: Logger
): RpcClient {
  const client = createRpcClient(chainId, rpcUrl, logger);
  return new RpcClient(client, chainId, logger);
}