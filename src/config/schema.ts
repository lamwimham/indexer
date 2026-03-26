import { z } from 'zod';

/**
 * 链配置模式，用于多链支持
 */
const chainConfigSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  rpcUrl: z.string(),
  blockTime: z.number().optional(),
});

/**
 * 环境变量模式及验证
 */
const envSchema = z.object({
  // 服务器配置
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // 数据库配置
  DATABASE_URL: z.string().default('file:./dev.db'),

  // 区块链 - 单链配置（向后兼容）
  RPC_URL: z.string().optional(),
  CHAIN_ID: z.string().transform(Number).default('1'),

  // 区块链 - 多链配置（JSON数组）
  CHAINS: z.string().optional(),

  // 同步配置
  START_BLOCK: z.string().transform(BigInt).default('0'),
  BATCH_SIZE: z.string().transform(Number).default('100'),
  CONFIRMATIONS: z.string().transform(Number).default('12'),
  SYNC_INTERVAL: z.string().transform(Number).default('1000'),
  MAX_CONCURRENT_REQUESTS: z.string().transform(Number).default('5'),

  // 合约配置（JSON字符串）
  CONTRACTS: z.string().optional(),

  // 认证配置
  AUTH_ENABLED: z.string().transform(val => val === 'true').default('false'),
  JWT_SECRET: z.string().optional(),

  // 限流配置
  RATE_LIMIT_ENABLED: z.string().transform(val => val === 'true').default('true'),
  RATE_LIMIT_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  // Redis配置（用于分布式锁）
  REDIS_URL: z.string().optional(),
});

/**
 * 合约配置模式
 */
const contractConfigSchema = z.object({
  name: z.string(),
  address: z.string().startsWith('0x'),
  chainId: z.number().optional(), // 可选：默认使用第一条链
  startBlock: z.union([
    z.number().transform(n => BigInt(n)),
    z.string().transform(s => BigInt(s)),
    z.bigint(),
  ]),
  abi: z.any().optional(),
  events: z.array(z.string()).optional(),
});

/**
 * 解析并验证环境变量
 */
export function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

/**
 * 从JSON字符串解析合约配置
 */
export function parseContractsConfig(contractsJson?: string) {
  if (!contractsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(contractsJson);
    const result = z.array(contractConfigSchema).safeParse(parsed);

    if (!result.success) {
      console.error('❌ Invalid contracts configuration:');
      console.error(result.error.flatten().fieldErrors);
      return [];
    }

    return result.data.map(c => ({
      ...c,
      startBlock: BigInt(c.startBlock),
    }));
  } catch (error) {
    console.error('❌ Failed to parse CONTRACTS JSON:', error);
    return [];
  }
}

export type Env = z.infer<typeof envSchema>;
export type ContractConfigInput = z.infer<typeof contractConfigSchema>;
export type ChainConfigInput = z.infer<typeof chainConfigSchema>;

/**
 * 从JSON字符串解析链配置
 * 向后兼容单链配置（RPC_URL + CHAIN_ID）
 */
export function parseChainsConfig(
  chainsJson?: string,
  defaultChainId?: number,
  defaultRpcUrl?: string
): ChainConfigInput[] {
  // 优先级1：多链JSON配置
  if (chainsJson) {
    try {
      const parsed = JSON.parse(chainsJson);
      const result = z.array(chainConfigSchema).safeParse(parsed);

      if (!result.success) {
        console.error('❌ Invalid chains configuration:');
        console.error(result.error.flatten().fieldErrors);
        // 回退到单链配置
      } else {
        return result.data;
      }
    } catch (error) {
      console.error('❌ Failed to parse CHAINS JSON:', error);
      // 回退到单链配置
    }
  }

  // 优先级2：单链配置（向后兼容）
  if (defaultRpcUrl) {
    return [
      {
        id: defaultChainId ?? 1,
        rpcUrl: defaultRpcUrl,
      },
    ];
  }

  // 未配置链
  console.error('❌ No chain configuration found. Please set either CHAINS or RPC_URL.');
  return [];
}