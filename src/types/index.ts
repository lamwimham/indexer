import type { Address, Log } from 'viem';

/**
 * 索引器合约配置
 */
export interface ContractConfig {
  /** 合约的可读名称 */
  name: string;
  /** 合约地址 */
  address: Address;
  /** 开始索引的区块号 */
  startBlock: bigint;
  /** 合约部署的链ID */
  chainId?: number;
  /** 合约ABI（可从文件加载） */
  abi?: unknown[];
  /** 要索引的事件（如未指定，则索引所有事件） */
  events?: string[];
}

/**
 * 链配置
 */
export interface ChainConfig {
  /** 链ID */
  id: number;
  /** 链名称 */
  name: string;
  /** RPC URL */
  rpcUrl: string;
  /** 区块时间（毫秒），用于估算同步进度 */
  blockTime?: number;
}

/**
 * 同步配置
 */
export interface SyncConfig {
  /** 起始区块号 */
  startBlock: bigint;
  /** 每批次获取的区块数量 */
  batchSize: number;
  /** 认定区块为最终确认所需的确认数 */
  confirmations: number;
  /** 同步周期间隔（毫秒） */
  syncInterval: number;
  /** 最大并发RPC请求数 */
  maxConcurrentRequests: number;
}

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  /** 数据库连接URL */
  url: string;
}

/**
 * 服务器配置
 */
export interface ServerConfig {
  /** 服务器端口 */
  port: number;
  /** Node环境 */
  nodeEnv: 'development' | 'production' | 'test';
  /** 日志级别 */
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

/**
 * 完整的索引器配置
 */
export interface IndexerConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  chains: ChainConfig[];
  contracts: ContractConfig[];
  sync: SyncConfig;
}

/**
 * 存储在数据库中的同步状态
 */
export interface SyncState {
  id: string;
  chainId: number;
  contractAddress: Address;
  contractName: string;
  lastSyncedBlock: string;
  lastSyncedTimestamp: Date;
  isSyncing: boolean;
  error?: string;
}

/**
 * 已索引的事件数据
 */
export interface IndexedEvent {
  id: string;
  chainId: number;
  contractAddress: Address;
  contractName: string;
  eventName: string;
  blockNumber: string;
  blockTimestamp: Date;
  transactionHash: Address;
  transactionIndex: number;
  logIndex: number;
  args: Record<string, unknown>;
  rawData: string;
  createdAt: Date;
}

/**
 * 事件处理函数类型
 */
export type EventHandler<TArgs = Record<string, unknown>> = (
  event: {
    args: TArgs;
    blockNumber: bigint;
    blockTimestamp: Date;
    transactionHash: Address;
    logIndex: number;
    chainId: number;
    contractAddress: Address;
    contractName: string;
  },
  context: HandlerContext
) => Promise<void> | void;

/**
 * 处理器上下文，提供数据库访问
 */
export interface HandlerContext {
  /** 用于数据库操作的Prisma客户端 */
  db: import('@prisma/client').PrismaClient;
  /** 日志实例 */
  logger: import('pino').Logger;
}

/**
 * 区块重组事件数据
 */
export interface ReorgEvent {
  chainId: number;
  fromBlock: bigint;
  toBlock: bigint;
  removedLogs: Log[];
}

/**
 * 监控指标
 */
export interface SyncMetrics {
  chainId: number;
  contractAddress: Address;
  currentBlock: string;
  latestBlock: string;
  blocksBehind: string;
  eventsProcessed: number;
  errors: number;
  lastSyncTime: Date;
  syncSpeed: number; // 每秒处理的区块数
}