import client from 'prom-client';

// ===========================================
// Prometheus 注册表
// ===========================================
export const register = new client.Registry();

// 添加默认指标（GC、内存等）
client.collectDefaultMetrics({ register });

// ===========================================
// 自定义指标
// ===========================================

/**
 * 已同步区块总数
 */
export const blocksSyncedCounter = new client.Counter({
  name: 'indexer_blocks_synced_total',
  help: 'Total number of blocks synced',
  labelNames: ['chain_id', 'contract_address', 'contract_name'],
  registers: [register],
});

/**
 * 已处理事件总数
 */
export const eventsProcessedCounter = new client.Counter({
  name: 'indexer_events_processed_total',
  help: 'Total number of events processed',
  labelNames: ['chain_id', 'contract_address', 'event_name'],
  registers: [register],
});

/**
 * 当前同步延迟区块数
 */
export const syncLagGauge = new client.Gauge({
  name: 'indexer_sync_lag_blocks',
  help: 'Number of blocks behind the latest block',
  labelNames: ['chain_id', 'contract_address', 'contract_name'],
  registers: [register],
});

/**
 * 当前已同步区块号
 */
export const currentBlockGauge = new client.Gauge({
  name: 'indexer_current_block',
  help: 'Current synced block number',
  labelNames: ['chain_id', 'contract_address', 'contract_name'],
  registers: [register],
});

/**
 * 链上最新区块号
 */
export const latestBlockGauge = new client.Gauge({
  name: 'indexer_latest_block',
  help: 'Latest block number on the chain',
  labelNames: ['chain_id'],
  registers: [register],
});

/**
 * RPC 请求延迟
 */
export const rpcLatencyHistogram = new client.Histogram({
  name: 'indexer_rpc_latency_seconds',
  help: 'RPC request latency in seconds',
  labelNames: ['method'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * RPC 请求计数
 */
export const rpcRequestCounter = new client.Counter({
  name: 'indexer_rpc_requests_total',
  help: 'Total number of RPC requests',
  labelNames: ['method', 'status'],
  registers: [register],
});

/**
 * 数据库查询延迟
 */
export const dbLatencyHistogram = new client.Histogram({
  name: 'indexer_db_latency_seconds',
  help: 'Database query latency in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

/**
 * 检测到的重组事件数
 */
export const reorgCounter = new client.Counter({
  name: 'indexer_reorg_total',
  help: 'Total number of chain reorganizations detected',
  labelNames: ['chain_id'],
  registers: [register],
});

/**
 * 重组深度
 */
export const reorgDepthGauge = new client.Gauge({
  name: 'indexer_reorg_depth_blocks',
  help: 'Depth of the last chain reorganization',
  labelNames: ['chain_id'],
  registers: [register],
});

/**
 * 同步错误数
 */
export const errorCounter = new client.Counter({
  name: 'indexer_errors_total',
  help: 'Total number of sync errors',
  labelNames: ['chain_id', 'contract_address', 'error_type'],
  registers: [register],
});

/**
 * 是否正在同步
 */
export const isSyncingGauge = new client.Gauge({
  name: 'indexer_is_syncing',
  help: 'Whether the indexer is currently syncing (1 = yes, 0 = no)',
  labelNames: ['chain_id', 'contract_address'],
  registers: [register],
});

// ===========================================
// 辅助函数
// ===========================================

/**
 * 记录 RPC 调用指标
 */
export function recordRpcCall(method: string, durationMs: number, success: boolean): void {
  rpcLatencyHistogram.observe({ method }, durationMs / 1000);
  rpcRequestCounter.inc({ method, status: success ? 'success' : 'error' });
}

/**
 * 记录数据库操作指标
 */
export function recordDbOperation(operation: string, durationMs: number): void {
  dbLatencyHistogram.observe({ operation }, durationMs / 1000);
}

/**
 * 更新同步进度指标
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
 * 记录已处理事件
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
 * 记录已同步区块
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
 * 记录重组事件
 */
export function recordReorg(chainId: number, depth: number): void {
  reorgCounter.inc({ chain_id: chainId.toString() });
  reorgDepthGauge.set({ chain_id: chainId.toString() }, depth);
}

/**
 * 设置同步状态
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
 * 记录错误
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
 * 获取 Prometheus 格式的指标
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}