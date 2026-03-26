import client from 'prom-client';

// ===========================================
// Prometheus Registry
// ===========================================
export const register = new client.Registry();

// Add default metrics (GC, memory, etc.)
client.collectDefaultMetrics({ register });

// ===========================================
// Custom Metrics
// ===========================================

/**
 * Total blocks synced
 */
export const blocksSyncedCounter = new client.Counter({
  name: 'indexer_blocks_synced_total',
  help: 'Total number of blocks synced',
  labelNames: ['chain_id', 'contract_address', 'contract_name'],
  registers: [register],
});

/**
 * Total events processed
 */
export const eventsProcessedCounter = new client.Counter({
  name: 'indexer_events_processed_total',
  help: 'Total number of events processed',
  labelNames: ['chain_id', 'contract_address', 'event_name'],
  registers: [register],
});

/**
 * Current sync lag in blocks
 */
export const syncLagGauge = new client.Gauge({
  name: 'indexer_sync_lag_blocks',
  help: 'Number of blocks behind the latest block',
  labelNames: ['chain_id', 'contract_address', 'contract_name'],
  registers: [register],
});

/**
 * Current synced block number
 */
export const currentBlockGauge = new client.Gauge({
  name: 'indexer_current_block',
  help: 'Current synced block number',
  labelNames: ['chain_id', 'contract_address', 'contract_name'],
  registers: [register],
});

/**
 * Latest block on chain
 */
export const latestBlockGauge = new client.Gauge({
  name: 'indexer_latest_block',
  help: 'Latest block number on the chain',
  labelNames: ['chain_id'],
  registers: [register],
});

/**
 * RPC request latency
 */
export const rpcLatencyHistogram = new client.Histogram({
  name: 'indexer_rpc_latency_seconds',
  help: 'RPC request latency in seconds',
  labelNames: ['method'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * RPC request count
 */
export const rpcRequestCounter = new client.Counter({
  name: 'indexer_rpc_requests_total',
  help: 'Total number of RPC requests',
  labelNames: ['method', 'status'],
  registers: [register],
});

/**
 * Database query latency
 */
export const dbLatencyHistogram = new client.Histogram({
  name: 'indexer_db_latency_seconds',
  help: 'Database query latency in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

/**
 * Reorg events detected
 */
export const reorgCounter = new client.Counter({
  name: 'indexer_reorg_total',
  help: 'Total number of chain reorganizations detected',
  labelNames: ['chain_id'],
  registers: [register],
});

/**
 * Reorg depth
 */
export const reorgDepthGauge = new client.Gauge({
  name: 'indexer_reorg_depth_blocks',
  help: 'Depth of the last chain reorganization',
  labelNames: ['chain_id'],
  registers: [register],
});

/**
 * Sync errors
 */
export const errorCounter = new client.Counter({
  name: 'indexer_errors_total',
  help: 'Total number of sync errors',
  labelNames: ['chain_id', 'contract_address', 'error_type'],
  registers: [register],
});

/**
 * Is currently syncing
 */
export const isSyncingGauge = new client.Gauge({
  name: 'indexer_is_syncing',
  help: 'Whether the indexer is currently syncing (1 = yes, 0 = no)',
  labelNames: ['chain_id', 'contract_address'],
  registers: [register],
});

// ===========================================
// Helper Functions
// ===========================================

/**
 * Record RPC call metrics
 */
export function recordRpcCall(method: string, durationMs: number, success: boolean): void {
  rpcLatencyHistogram.observe({ method }, durationMs / 1000);
  rpcRequestCounter.inc({ method, status: success ? 'success' : 'error' });
}

/**
 * Record database operation metrics
 */
export function recordDbOperation(operation: string, durationMs: number): void {
  dbLatencyHistogram.observe({ operation }, durationMs / 1000);
}

/**
 * Update sync progress metrics
 */
export function updateSyncProgress(
  chainId: number,
  contractAddress: string,
  contractName: string,
  currentBlock: bigint,
  latestBlock: bigint
): void {
  const labels = {
    chain_id: chainId.toString(),
    contract_address: contractAddress,
    contract_name: contractName,
  };

  currentBlockGauge.set(labels, Number(currentBlock));
  syncLagGauge.set(labels, Number(latestBlock - currentBlock));
  latestBlockGauge.set({ chain_id: chainId.toString() }, Number(latestBlock));
}

/**
 * Record event processed
 */
export function recordEvent(
  chainId: number,
  contractAddress: string,
  eventName: string
): void {
  eventsProcessedCounter.inc({
    chain_id: chainId.toString(),
    contract_address: contractAddress,
    event_name: eventName,
  });
}

/**
 * Record block synced
 */
export function recordBlockSynced(
  chainId: number,
  contractAddress: string,
  contractName: string
): void {
  blocksSyncedCounter.inc({
    chain_id: chainId.toString(),
    contract_address: contractAddress,
    contract_name: contractName,
  });
}

/**
 * Record reorg event
 */
export function recordReorg(chainId: number, depth: number): void {
  reorgCounter.inc({ chain_id: chainId.toString() });
  reorgDepthGauge.set({ chain_id: chainId.toString() }, depth);
}

/**
 * Set syncing state
 */
export function setSyncingState(
  chainId: number,
  contractAddress: string,
  isSyncing: boolean
): void {
  isSyncingGauge.set(
    { chain_id: chainId.toString(), contract_address: contractAddress },
    isSyncing ? 1 : 0
  );
}

/**
 * Record error
 */
export function recordError(
  chainId: number,
  contractAddress: string,
  errorType: string
): void {
  errorCounter.inc({
    chain_id: chainId.toString(),
    contract_address: contractAddress,
    error_type: errorType,
  });
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}