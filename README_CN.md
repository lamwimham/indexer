# Web3 Indexer

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[English](./README.md)**

生产级 Web3 链下索引服务，支持 REST 和 GraphQL API，专为以太坊及 EVM 兼容链设计。

## ✨ 特性

- **🔄 可靠同步** - 断点续传、自动重试、链重组检测与恢复
- **⚡ 高性能** - 批量获取、并发控制、增量同步
- **🔌 双 API 支持** - REST API + GraphQL API
- **📊 可观测性** - 结构化日志、Prometheus 指标、健康检查
- **🔐 生产就绪** - JWT 认证、Rate Limiting、分布式锁
- **🛠 类型安全** - TypeScript + Prisma + Zod 全链路类型保障

## 📐 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Web3 Indexer Service                         │
├─────────────────────────────────────────────────────────────────────┤
│  Config Manager  │  Logger (Pino)  │  Metrics (Prometheus)          │
├─────────────────────────────────────────────────────────────────────┤
│                        Block Synchronizer                            │
│     RPC Client (Viem)  │  Block Fetcher  │  Reorg Handler          │
├─────────────────────────────────────────────────────────────────────┤
│                        Event Processor                               │
│     Log Filter  │  ABI Decoder  │  Handlers (ERC20, Swap, Custom) │
├─────────────────────────────────────────────────────────────────────┤
│                        Data Storage Layer                            │
│  SyncState  │  Events  │  Transfers  │  Checkpoints  │  KeyValue   │
│                    PostgreSQL / SQLite                               │
├─────────────────────────────────────────────────────────────────────┤
│                           API Layer                                  │
│        REST API (Fastify)     │     GraphQL (Apollo Server)        │
│        Auth & Rate Limiting   │     Playground (Dev Mode)          │
└─────────────────────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- PostgreSQL 15+ (生产) 或 SQLite (开发)
- Redis (可选，用于分布式锁)

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd indexer

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
```

### 配置

编辑 `.env` 文件：

```env
# 服务配置
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# 数据库
DATABASE_URL="file:./dev.db"

# 区块链 RPC
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
CHAIN_ID=1

# 同步配置
START_BLOCK=0
BATCH_SIZE=100
CONFIRMATIONS=12
SYNC_INTERVAL=1000

# 合约配置 (JSON 数组)
CONTRACTS='[{"name":"USDT","address":"0xdAC17F958D2ee523a2206206994597C13D831ec7","startBlock":4634748}]'
```

### 启动

```bash
# 初始化数据库
npm run db:push

# 开发模式
npm run dev

# 生产构建
npm run build
npm start
```

服务启动后访问：
- REST API: http://localhost:3000
- GraphQL Playground: http://localhost:3000/graphql (仅开发模式)
- 健康检查: http://localhost:3000/health

## 📖 API 文档

### REST API

#### 健康检查

```http
GET /health          # 服务健康状态
GET /ready           # 服务就绪状态
```

#### 同步状态

```http
GET /api/v1/sync/status      # 所有合约同步状态
GET /api/v1/sync/metrics     # 同步指标
GET /api/v1/sync-states      # 同步状态列表
```

#### 事件查询

```http
# 查询事件
GET /api/v1/events?chainId=1&contractAddress=0x...&eventName=Transfer&limit=100

# 事件计数
GET /api/v1/events/count?chainId=1&contractAddress=0x...

# 事件名称列表
GET /api/v1/events/names?chainId=1&contractAddress=0x...
```

#### Transfer 事件

```http
# 查询转账记录
GET /api/v1/transfers?chainId=1&from=0x...&to=0x...&limit=100

# 转账计数
GET /api/v1/transfers/count?chainId=1&contractAddress=0x...

# 地址转账历史
GET /api/v1/transfers/address/:address?chainId=1
```

### GraphQL API

访问 `http://localhost:3000/graphql` 使用 GraphQL Playground。

#### 查询示例

```graphql
# 同步状态
query SyncStatus {
  syncStatus {
    contractName
    lastSyncedBlock
    latestBlock
    blocksBehind
    isSyncing
  }
}

# Transfer 事件
query Transfers {
  transfers(
    filter: { chainId: 1, contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" }
    limit: 10
  ) {
    from
    to
    value
    valueFormatted
    tokenSymbol
    blockNumber
    txHash
    blockTimestamp
  }
}

# 地址转账历史
query AddressHistory {
  address(chainId: 1, address: "0x...") {
    transfers(limit: 20) {
      tokenSymbol
      from
      to
      valueFormatted
      direction
      blockNumber
      txHash
    }
  }
}

# 合约事件
query ContractEvents {
  contract(chainId: 1, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7") {
    name
    syncState {
      lastSyncedBlock
      isSyncing
    }
    events(eventName: "Transfer", limit: 10) {
      eventName
      args
      blockNumber
      txHash
    }
  }
}
```

## ⚙️ 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `development` |
| `PORT` | API 端口 | `3000` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `DATABASE_URL` | 数据库连接 | `file:./dev.db` |
| `RPC_URL` | 区块链 RPC URL (单链) | - |
| `CHAIN_ID` | 链 ID (单链) | `1` |
| `CHAINS` | 多链配置 (JSON) | - |
| `START_BLOCK` | 起始区块 | `0` |
| `BATCH_SIZE` | 批量大小 | `100` |
| `CONFIRMATIONS` | 确认数 | `12` |
| `SYNC_INTERVAL` | 同步间隔 (ms) | `1000` |
| `MAX_CONCURRENT_REQUESTS` | 最大并发数 | `5` |
| `CONTRACTS` | 合约配置 (JSON) | `[]` |
| `AUTH_ENABLED` | 启用 JWT 认证 | `false` |
| `JWT_SECRET` | JWT 密钥 | - |
| `RATE_LIMIT_ENABLED` | 启用限流 | `true` |
| `RATE_LIMIT_MAX` | 限流阈值 | `100` |
| `REDIS_URL` | Redis 连接 | - |

### 单链配置

使用 `RPC_URL` 和 `CHAIN_ID` 配置单链：

```env
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
CHAIN_ID=1

CONTRACTS='[{"name":"USDT","address":"0xdAC17F958D2ee523a2206206994597C13D831ec7","startBlock":4634748}]'
```

### 多链配置

使用 `CHAINS` 环境变量配置多链，合约中指定 `chainId`：

```env
CHAINS='[
  {"id":1,"name":"ethereum","rpcUrl":"https://eth-mainnet.g.alchemy.com/v2/KEY1"},
  {"id":137,"name":"polygon","rpcUrl":"https://polygon-mainnet.g.alchemy.com/v2/KEY2"},
  {"id":42161,"name":"arbitrum","rpcUrl":"https://arb-mainnet.g.alchemy.com/v2/KEY3"}
]'

CONTRACTS='[
  {"name":"USDT-Ethereum","address":"0xdAC17F958D2ee523a2206206994597C13D831ec7","chainId":1,"startBlock":4634748},
  {"name":"USDT-Polygon","address":"0xc2132D05D31c914a87C6611C10748AEb04B58e8F","chainId":137,"startBlock":25117600},
  {"name":"USDT-Arbitrum","address":"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9","chainId":42161,"startBlock":100000}
]'
```

**链配置字段：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 链 ID (1=Ethereum, 137=Polygon, 42161=Arbitrum 等) |
| `name` | ❌ | 链名称 (可选，会自动推断) |
| `rpcUrl` | ✅ | RPC 端点 URL |
| `blockTime` | ❌ | 出块时间 (ms，可选，会自动推断) |

**合约配置字段：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 合约名称 (用于标识) |
| `address` | ✅ | 合约地址 |
| `chainId` | ❌ | 链 ID (不指定则默认为第一条链) |
| `startBlock` | ✅ | 开始索引的区块号 |
| `abi` | ❌ | 合约 ABI (可选) |
| `events` | ❌ | 要索引的事件列表 (可选，默认全部) |

## 🔧 自定义事件处理器

### 创建处理器

```typescript
import { EventProcessor, createEventSignature } from './processor/index.js';
import type { Abi } from 'viem';

const MY_ABI: Abi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'Deposit',
    type: 'event',
  },
];

class MyEventProcessor extends EventProcessor {
  constructor(db: PrismaClient, logger: Logger) {
    super(logger);

    const depositEvent = MY_ABI.find(e => e.type === 'event' && e.name === 'Deposit')!;
    this.registerEvent({
      signature: createEventSignature(depositEvent),
      abi: depositEvent,
      handler: this.handleDeposit.bind(this),
    });
  }

  private async handleDeposit(event, context) {
    const { user, amount } = event.args;
    // 自定义处理逻辑...
  }
}
```

### 注册到同步器

```typescript
const myProcessor = new MyEventProcessor(db, logger);

const synchronizer = new Synchronizer(config, db, logger, async (params) => {
  await myProcessor.processLogs(params.logs, params, { db, logger });
});
```

## 🐳 Docker 部署

### 使用 Docker Compose

```bash
# 创建环境变量文件
cp .env.example .env

# 启动所有服务
docker-compose up -d

# 启动包含监控的服务
docker-compose --profile monitoring up -d
```

服务组件：
- **indexer** - 主服务 (端口 3000)
- **postgres** - PostgreSQL 数据库 (端口 5432)
- **redis** - 分布式锁 (端口 6379)
- **prometheus** - 指标收集 (端口 9090)
- **grafana** - 可视化面板 (端口 3001)

### 手动构建

```bash
docker build -t web3-indexer .
docker run -p 3000:3000 --env-file .env web3-indexer
```

## 📁 项目结构

```
indexer/
├── src/
│   ├── index.ts                 # 入口文件
│   ├── config/                  # 配置管理
│   │   ├── index.ts
│   │   └── schema.ts            # Zod 配置验证
│   ├── sync/                    # 同步器
│   │   ├── rpc-client.ts        # RPC 客户端
│   │   ├── block-fetcher.ts     # 区块获取
│   │   ├── reorg-handler.ts     # 链重组处理
│   │   └── synchronizer.ts      # 同步器核心
│   ├── processor/               # 事件处理器
│   │   ├── event-processor.ts
│   │   └── handlers/
│   │       └── erc20.handler.ts
│   ├── storage/                 # 数据存储
│   │   ├── database.ts
│   │   └── repositories/
│   ├── api/                     # API 层
│   │   ├── server.ts            # REST API
│   │   └── graphql/             # GraphQL API
│   ├── middleware/              # 中间件
│   │   ├── auth.ts              # JWT 认证
│   │   └── rate-limit.ts        # 限流
│   ├── lock/                    # 分布式锁
│   ├── monitoring/              # 监控指标
│   ├── utils/                   # 工具函数
│   └── types/                   # 类型定义
├── prisma/
│   └── schema.prisma            # 数据库模型
├── abis/                        # 合约 ABI 文件
├── monitoring/                  # 监控配置
│   ├── prometheus.yml
│   └── grafana/
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 🧪 开发

```bash
# 开发模式 (热重载)
npm run dev

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage

# 数据库管理
npm run db:studio    # 打开 Prisma Studio
npm run db:migrate   # 创建迁移
```

## 📊 监控

### Prometheus 指标

- `indexer_sync_blocks_total` - 已同步区块总数
- `indexer_sync_events_total` - 已处理事件总数
- `indexer_sync_duration_seconds` - 同步耗时
- `indexer_rpc_requests_total` - RPC 请求总数
- `indexer_rpc_errors_total` - RPC 错误总数

### Grafana 面板

启动监控服务后访问 `http://localhost:3001`，默认账号 `admin/admin`。

## 📄 License

MIT