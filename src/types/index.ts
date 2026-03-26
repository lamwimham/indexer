import type { Address, Log } from 'viem';

/**
 * Contract configuration for indexing
 */
export interface ContractConfig {
  /** Human-readable name for the contract */
  name: string;
  /** Contract address */
  address: Address;
  /** Block number to start indexing from */
  startBlock: bigint;
  /** Chain ID this contract is deployed on */
  chainId?: number;
  /** Contract ABI (can be loaded from file) */
  abi?: unknown[];
  /** Events to index (if not specified, all events are indexed) */
  events?: string[];
}

/**
 * Chain configuration
 */
export interface ChainConfig {
  /** Chain ID */
  id: number;
  /** Chain name */
  name: string;
  /** RPC URL */
  rpcUrl: string;
  /** Block time in milliseconds (for estimating sync progress) */
  blockTime?: number;
}

/**
 * Sync configuration
 */
export interface SyncConfig {
  /** Starting block number */
  startBlock: bigint;
  /** Number of blocks to fetch per batch */
  batchSize: number;
  /** Number of confirmations before considering a block final */
  confirmations: number;
  /** Interval between sync cycles in milliseconds */
  syncInterval: number;
  /** Maximum concurrent RPC requests */
  maxConcurrentRequests: number;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  /** Database connection URL */
  url: string;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  /** Server port */
  port: number;
  /** Node environment */
  nodeEnv: 'development' | 'production' | 'test';
  /** Log level */
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

/**
 * Full indexer configuration
 */
export interface IndexerConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  chains: ChainConfig[];
  contracts: ContractConfig[];
  sync: SyncConfig;
}

/**
 * Sync state stored in database
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
 * Indexed event data
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
 * Event handler function type
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
 * Handler context with database access
 */
export interface HandlerContext {
  /** Prisma client for database operations */
  db: import('@prisma/client').PrismaClient;
  /** Logger instance */
  logger: import('pino').Logger;
}

/**
 * Reorg event data
 */
export interface ReorgEvent {
  chainId: number;
  fromBlock: bigint;
  toBlock: bigint;
  removedLogs: Log[];
}

/**
 * Metrics for monitoring
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
  syncSpeed: number; // blocks per second
}