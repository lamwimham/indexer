import { config as dotenvConfig } from 'dotenv';
import { parseEnv, parseContractsConfig, parseChainsConfig } from './schema.js';
import type { IndexerConfig, ChainConfig, ContractConfig } from '../types/index.js';

// 加载 .env 文件
dotenvConfig();

/**
 * 加载并验证配置
 */
export function loadConfig(): IndexerConfig {
  const env = parseEnv();
  const contracts = parseContractsConfig(env.CONTRACTS);

  // 解析链配置（支持多链）
  const chainConfigs = parseChainsConfig(env.CHAINS, env.CHAIN_ID, env.RPC_URL);

  if (chainConfigs.length === 0) {
    console.error('❌ No valid chain configuration found. Exiting.');
    process.exit(1);
  }

  // 构建链配置，包含名称和区块时间
  const chains: ChainConfig[] = chainConfigs.map(c => ({
    id: c.id,
    name: c.name ?? getChainName(c.id),
    rpcUrl: c.rpcUrl,
    blockTime: c.blockTime ?? getChainBlockTime(c.id),
  }));

  // 构建合约配置
  const defaultChainId = chains[0].id;
  const contractConfigs: ContractConfig[] = contracts.map(c => ({
    name: c.name,
    address: c.address as `0x${string}`,
    chainId: c.chainId ?? defaultChainId, // 如未指定，默认使用第一条链
    startBlock: c.startBlock,
    abi: c.abi,
    events: c.events,
  }));

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
 * 根据链ID获取链名称
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
 * 根据链ID获取平均区块时间（毫秒）
 */
function getChainBlockTime(chainId: number): number {
  const blockTimes: Record<number, number> = {
    1: 12000,      // Ethereum: 约12秒
    5: 12000,      // Goerli: 约12秒
    11155111: 12000, // Sepolia: 约12秒
    137: 2000,     // Polygon: 约2秒
    42161: 250,    // Arbitrum: 约0.25秒
    10: 2000,      // Optimism: 约2秒
    56: 3000,      // BSC: 约3秒
    43114: 2000,   // Avalanche: 约2秒
  };
  return blockTimes[chainId] || 12000;
}

/**
 * 获取指定链的RPC URL
 */
export function getRpcUrl(config: IndexerConfig, chainId: number): string {
  const chain = config.chains.find(c => c.id === chainId);
  if (!chain) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }
  return chain.rpcUrl;
}

/**
 * 获取指定链的合约配置
 */
export function getContractsForChain(
  config: IndexerConfig,
  chainId: number
): ContractConfig[] {
  return config.contracts.filter(c => c.chainId === undefined || c.chainId === chainId);
}