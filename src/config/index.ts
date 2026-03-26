import { config as dotenvConfig } from 'dotenv';
import { parseEnv, parseContractsConfig } from './schema.js';
import type { IndexerConfig, ChainConfig, ContractConfig } from '../types/index.js';

// Load .env file
dotenvConfig();

/**
 * Load and validate configuration
 */
export function loadConfig(): IndexerConfig {
  const env = parseEnv();
  const contracts = parseContractsConfig(env.CONTRACTS);

  // Default chain configuration
  const chains: ChainConfig[] = [
    {
      id: env.CHAIN_ID,
      name: getChainName(env.CHAIN_ID),
      rpcUrl: env.RPC_URL,
      blockTime: getChainBlockTime(env.CHAIN_ID),
    },
  ];

  // If no contracts specified via env, use default example
  const contractConfigs: ContractConfig[] = contracts.length > 0
    ? contracts.map(c => ({
        name: c.name,
        address: c.address as `0x${string}`,
        startBlock: c.startBlock,
        abi: c.abi,
        events: c.events,
      }))
    : [];

  return {
    server: {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
    },
    database: {
      url: env.DATABASE_URL,
    },
    chains,
    contracts: contractConfigs,
    sync: {
      startBlock: env.START_BLOCK,
      batchSize: env.BATCH_SIZE,
      confirmations: env.CONFIRMATIONS,
      syncInterval: env.SYNC_INTERVAL,
      maxConcurrentRequests: env.MAX_CONCURRENT_REQUESTS,
    },
  };
}

/**
 * Get chain name by chain ID
 */
function getChainName(chainId: number): string {
  const chainNames: Record<number, string> = {
    1: 'ethereum',
    5: 'goerli',
    11155111: 'sepolia',
    137: 'polygon',
    42161: 'arbitrum',
    10: 'optimism',
    56: 'bsc',
    43114: 'avalanche',
  };
  return chainNames[chainId] || `chain-${chainId}`;
}

/**
 * Get average block time by chain ID (in milliseconds)
 */
function getChainBlockTime(chainId: number): number {
  const blockTimes: Record<number, number> = {
    1: 12000,      // Ethereum: ~12s
    5: 12000,      // Goerli: ~12s
    11155111: 12000, // Sepolia: ~12s
    137: 2000,     // Polygon: ~2s
    42161: 250,    // Arbitrum: ~0.25s
    10: 2000,      // Optimism: ~2s
    56: 3000,      // BSC: ~3s
    43114: 2000,   // Avalanche: ~2s
  };
  return blockTimes[chainId] || 12000;
}

/**
 * Get RPC URL for a chain
 */
export function getRpcUrl(config: IndexerConfig, chainId: number): string {
  const chain = config.chains.find(c => c.id === chainId);
  if (!chain) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }
  return chain.rpcUrl;
}

/**
 * Get contracts for a specific chain
 */
export function getContractsForChain(
  config: IndexerConfig,
  chainId: number
): ContractConfig[] {
  return config.contracts.filter(c => c.chainId === undefined || c.chainId === chainId);
}