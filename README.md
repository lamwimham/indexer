# Web3 Indexer

生产级别的 Web3 链下索引服务，支持 REST 和 GraphQL API。

## 特性

- ✅ **可靠同步**：断点续传、错误重试、链重组检测
- ✅ **高性能**：批量获取、并发控制、增量同步
- ✅ **多 API 支持**：REST API + GraphQL API
- ✅ **可观测性**：结构化日志、同步状态监控、健康检查
- ✅ **灵活配置**：多链、多合约、自定义事件处理器
- ✅ **类型安全**：TypeScript + Prisma + Zod

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Indexer Service                        │
├─────────────────────────────────────────────────────────────┤
│  Config Manager  │  Logger (Pino)  │  Metrics/Monitor      │
├─────────────────────────────────────────────────────────────┤
│                  Block Synchronizer                         │
│  RPC Client  │  Block Fetcher  │  Reorg Handler            │
├─────────────────────────────────────────────────────────────┤
│                  Event Processor                            │
│  Log Filter  │  Decoder  │  Handlers (ERC20, Custom)       │
├─────────────────────────────────────────────────────────────┤
│                  Data Storage Layer                         │
│  Sync State  │  Events  │  Transfer Events  │  Checkpoints │
│              Database (SQLite / PostgreSQL)                 │
├─────────────────────────────────────────────────────────────┤
│                      API Layer                              │
│  REST API (Fastify)  │  GraphQL (Apollo Server)            │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置 RPC URL 和要索引的合约：

```env
# RPC 端点
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# 链 ID
CHAIN_ID=1

# 要索引的合约（JSON 数组）
CONTRACTS='[{"name":"USDT","address":"0xdAC17F958D2ee523a2206206994597C13D831ec7","startBlock":4634748}]'
```

### 3. 初始化数据库

```bash
npm run db:push
```

### 4. 启动服务

```bash
npm run dev
```

服务将在 `http://localhost:3000` 启动。

## API 文档

### REST API

#### 健康检查

```
GET /health
GET /ready
```

#### 同步状态

```
GET /api/v1/sync/status
GET /api/v1/sync/metrics
GET /api/v1/sync-states
```

#### 事件查询

```
GET /api/v1/events?chainId=1&contractAddress=0x...&eventName=Transfer&limit=100
GET /api/v1/events/count?chainId=1&contractAddress=0x...
GET /api/v1/events/names?chainId=1&contractAddress=0x...
```

#### Transfer 事件

```
GET /api/v1/transfers?chainId=1&from=0x...&to=0x...&limit=100
GET /api/v1/transfers/count?chainId=1&contractAddress=0x...
GET /api/v1/transfers/address/:address?chainId=1
```

### GraphQL API

访问 `http://localhost:3000/graphql` 使用 GraphQL Playground。

#### 示例查询

```graphql
# 查询同步状态
query {
  syncStatus {
    contractName
    lastSyncedBlock
    latestBlock
    blocksBehind
  }
}

# 查询 Transfer 事件
query {
  transfers(
    filter: { chainId: 1, contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" }
    limit: 10
  ) {
    from
    to
    value
    valueFormatted
    blockNumber
    txHash
  }
}

# 查询地址的转账历史
query {
  address(chainId: 1, address: "0x...") {
    transfers(limit: 20) {
      tokenSymbol
      from
      to
      valueFormatted
      direction
    }
  }
}

# 查询合约事件
query {
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
    }
  }
}
```

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `development` |
| `PORT` | API 端口 | `3000` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `DATABASE_URL` | 数据库连接 | `file:./dev.db` |
| `RPC_URL` | 区块链 RPC URL | - |
| `CHAIN_ID` | 链 ID | `1` |
| `START_BLOCK` | 起始区块 | `0` |
| `BATCH_SIZE` | 批量大小 | `100` |
| `CONFIRMATIONS` | 确认数 | `12` |
| `SYNC_INTERVAL` | 同步间隔(ms) | `1000` |
| `MAX_CONCURRENT_REQUESTS` | 最大并发数 | `5` |
| `CONTRACTS` | 合约配置(JSON) | `[]` |

### 合约配置

```json
[
  {
    "name": "USDT",
    "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "startBlock": 4634748
  }
]
```

## 自定义事件处理器

### 1. 创建处理器

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
    // 处理 Deposit 事件
    const { user, amount } = event.args;
    // 保存到数据库...
  }
}
```

### 2. 注册到同步器

```typescript
const myProcessor = new MyEventProcessor(db, logger);

const synchronizer = new Synchronizer(config, db, logger, async (params) => {
  await myProcessor.processLogs(params.logs, params, { db, logger });
});
```

## 生产部署

### 使用 PostgreSQL

修改 `prisma/schema.prisma`：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

设置环境变量：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/indexer"
```

### Docker 部署

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma/
RUN npx prisma generate

COPY dist ./dist/

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

### 监控指标

- 同步进度：`GET /api/v1/sync/status`
- 健康检查：`GET /health`
- 日志输出：结构化 JSON 格式

## 项目结构

```
indexer/
├── src/
│   ├── index.ts              # 入口文件
│   ├── config/               # 配置管理
│   ├── sync/                 # 同步器
│   │   ├── rpc-client.ts     # RPC 客户端
│   │   ├── block-fetcher.ts  # 区块获取
│   │   ├── reorg-handler.ts  # 链重组处理
│   │   └── synchronizer.ts   # 同步器核心
│   ├── processor/            # 事件处理器
│   │   ├── event-processor.ts
│   │   └── handlers/
│   │       └── erc20.handler.ts
│   ├── storage/              # 数据存储
│   │   ├── database.ts
│   │   └── repositories/
│   ├── api/                  # API 层
│   │   ├── server.ts         # REST API
│   │   └── graphql/          # GraphQL API
│   ├── utils/                # 工具函数
│   └── types/                # 类型定义
├── prisma/
│   └── schema.prisma         # 数据库模型
├── abis/                     # 合约 ABI 文件
├── .env.example
└── package.json
```

## License

MIT