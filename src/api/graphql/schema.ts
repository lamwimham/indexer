/**
 * GraphQL Schema 定义
 */
export const typeDefs = `#graphql` + `
  # ============================================
  # 标量
  # ============================================

  scalar DateTime
  scalar JSON

  # ============================================
  # 类型
  # ============================================

  """
  合约的同步状态
  """
  type SyncStatus {
    chainId: Int!
    contractAddress: String!
    contractName: String!
    lastSyncedBlock: String!
    isSyncing: Boolean!
    latestBlock: String!
    blocksBehind: String!
  }

  """
  同步指标
  """
  type SyncMetrics {
    chainId: Int!
    contractAddress: String!
    currentBlock: String!
    latestBlock: String!
    blocksBehind: String!
    eventsProcessed: Int!
    errors: Int!
    lastSyncTime: DateTime!
  }

  """
  通用索引事件
  """
  type Event {
    id: ID!
    chainId: Int!
    contractAddress: String!
    contractName: String!
    eventName: String!
    blockNumber: String!
    blockTimestamp: DateTime!
    txHash: String!
    txIndex: Int!
    logIndex: Int!
    args: JSON!
    removed: Boolean!
    createdAt: DateTime!
  }

  """
  ERC20 Transfer 事件
  """
  type TransferEvent {
    id: ID!
    chainId: Int!
    contractAddress: String!
    tokenName: String
    tokenSymbol: String
    from: String!
    to: String!
    value: String!
    valueFormatted: Float
    decimals: Int
    blockNumber: String!
    blockTimestamp: DateTime!
    txHash: String!
    logIndex: Int!
    removed: Boolean!
    createdAt: DateTime!
  }

  """
  ERC20 Approval 事件
  """
  type ApprovalEvent {
    id: ID!
    chainId: Int!
    contractAddress: String!
    tokenName: String
    tokenSymbol: String
    owner: String!
    spender: String!
    value: String!
    valueFormatted: Float
    decimals: Int
    blockNumber: String!
    blockTimestamp: DateTime!
    txHash: String!
    logIndex: Int!
    removed: Boolean!
    createdAt: DateTime!
  }

  """
  存储在数据库中的同步状态
  """
  type SyncState {
    id: ID!
    chainId: Int!
    contractAddress: String!
    contractName: String!
    lastSyncedBlock: String!
    lastSyncedAt: DateTime!
    isSyncing: Boolean!
    lastError: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  """
  合约及其事件
  """
  type Contract {
    address: String!
    name: String!
    chainId: Int!
    syncState: SyncState
    events(
      eventName: String
      fromBlock: String
      toBlock: String
      limit: Int = 100
      offset: Int = 0
      orderBy: EventOrderBy = blockNumber
      orderDirection: OrderDirection = desc
    ): [Event!]!
    transfers(
      from: String
      to: String
      fromBlock: String
      toBlock: String
      limit: Int = 100
      offset: Int = 0
    ): [TransferEvent!]!
    approvals(
      owner: String
      spender: String
      fromBlock: String
      toBlock: String
      limit: Int = 100
      offset: Int = 0
    ): [ApprovalEvent!]!
    eventCount(eventName: String): Int!
    transferCount(from: String, to: String): Int!
  }

  """
  地址及其转账历史
  """
  type Address {
    address: String!
    chainId: Int!
    transfers(
      contractAddress: String
      direction: TransferDirection
      limit: Int = 100
    ): [TransferEvent!]!
    transferCount(contractAddress: String): Int!
  }

  # ============================================
  # 枚举
  # ============================================

  enum EventOrderBy {
    blockNumber
    blockTimestamp
  }

  enum OrderDirection {
    asc
    desc
  }

  enum TransferDirection {
    in
    out
    all
  }

  # ============================================
  # 输入类型
  # ============================================

  input EventFilter {
    chainId: Int
    contractAddress: String
    eventName: String
    fromBlock: String
    toBlock: String
  }

  input TransferFilter {
    chainId: Int
    contractAddress: String
    from: String
    to: String
    fromBlock: String
    toBlock: String
  }

  # ============================================
  # 查询
  # ============================================

  type Query {
    """
    获取所有合约的同步状态
    """
    syncStatus: [SyncStatus!]!

    """
    获取同步指标
    """
    syncMetrics: [SyncMetrics!]!

    """
    获取所有同步状态
    """
    syncStates: [SyncState!]!

    """
    根据地址获取特定合约
    """
    contract(chainId: Int!, address: String!): Contract

    """
    获取所有合约
    """
    contracts(chainId: Int): [Contract!]!

    """
    根据条件查询事件
    """
    events(
      filter: EventFilter
      limit: Int = 100
      offset: Int = 0
      orderBy: EventOrderBy = blockNumber
      orderDirection: OrderDirection = desc
    ): [Event!]!

    """
    根据条件统计事件数量
    """
    eventCount(filter: EventFilter): Int!

    """
    根据条件查询转账事件
    """
    transfers(
      filter: TransferFilter
      limit: Int = 100
      offset: Int = 0
      orderBy: EventOrderBy = blockNumber
      orderDirection: OrderDirection = desc
    ): [TransferEvent!]!

    """
    根据条件统计转账事件数量
    """
    transferCount(filter: TransferFilter): Int!

    """
    获取地址及其转账历史
    """
    address(chainId: Int!, address: String!): Address!
  }
`;