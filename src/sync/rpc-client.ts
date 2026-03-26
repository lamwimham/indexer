import { createPublicClient, http, type PublicClient, type Chain } from 'viem';
import { mainnet, goerli, sepolia, polygon, arbitrum, optimism, bsc, avalanche } from 'viem/chains';
import type { Logger } from '../utils/logger.js';
import { recordRpcCall } from '../monitoring/metrics.js';

/**
 * Get viem chain by chain ID
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
    // Return a custom chain configuration
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
 * Create a viem public client
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
 * RPC client wrapper with additional utilities
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
   * Wrap RPC call with metrics recording
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
   * Get the underlying viem client
   */
  getClient(): PublicClient {
    return this.client;
  }

  /**
   * Get chain ID
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * Get latest block number
   */
  async getLatestBlockNumber(): Promise<bigint> {
    return this.withMetrics('getBlockNumber', () => this.client.getBlockNumber());
  }

  /**
   * Get block by number
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
   * Get block by hash
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
   * Get logs for a range of blocks
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
   * Get multiple blocks in batch
   */
  async getBlocks(blockNumbers: bigint[]) {
    return this.withMetrics('getBlocks', () =>
      Promise.all(blockNumbers.map((bn) => this.getBlock(bn)))
    );
  }

  /**
   * Check if connected
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
   * Get chain ID from network
   */
  async getNetworkChainId(): Promise<number> {
    return this.withMetrics('getChainId', async () =>
      Number(await this.client.getChainId())
    );
  }
}

/**
 * Create RPC client instance
 */
export function createRpcClientWrapper(
  chainId: number,
  rpcUrl: string,
  logger: Logger
): RpcClient {
  const client = createRpcClient(chainId, rpcUrl, logger);
  return new RpcClient(client, chainId, logger);
}