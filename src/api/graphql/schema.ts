/**
 * GraphQL Schema definitions
 */
export const typeDefs = `#graphql` + `
  # ============================================
  # Scalars
  # ============================================

  scalar DateTime
  scalar JSON

  # ============================================
  # Types
  # ============================================

  """
  Sync status for a contract
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
  Sync metrics
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
  Generic indexed event
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
  ERC20 Transfer event
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
  ERC20 Approval event
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
  Sync state stored in database
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
  Contract with its events
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
  Address with its transfer history
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
  # Enums
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
  # Inputs
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
  # Queries
  # ============================================

  type Query {
    """
    Get sync status for all contracts
    """
    syncStatus: [SyncStatus!]!

    """
    Get sync metrics
    """
    syncMetrics: [SyncMetrics!]!

    """
    Get all sync states
    """
    syncStates: [SyncState!]!

    """
    Get a specific contract by address
    """
    contract(chainId: Int!, address: String!): Contract

    """
    Get all contracts
    """
    contracts(chainId: Int): [Contract!]!

    """
    Query events with filters
    """
    events(
      filter: EventFilter
      limit: Int = 100
      offset: Int = 0
      orderBy: EventOrderBy = blockNumber
      orderDirection: OrderDirection = desc
    ): [Event!]!

    """
    Count events with filters
    """
    eventCount(filter: EventFilter): Int!

    """
    Query transfer events with filters
    """
    transfers(
      filter: TransferFilter
      limit: Int = 100
      offset: Int = 0
      orderBy: EventOrderBy = blockNumber
      orderDirection: OrderDirection = desc
    ): [TransferEvent!]!

    """
    Count transfer events with filters
    """
    transferCount(filter: TransferFilter): Int!

    """
    Get address with transfer history
    """
    address(chainId: Int!, address: String!): Address!
  }
`;