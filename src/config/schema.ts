import { z } from 'zod';

/**
 * Chain configuration schema for multi-chain support
 */
const chainConfigSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  rpcUrl: z.string(),
  blockTime: z.number().optional(),
});

/**
 * Environment variable schema with validation
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DATABASE_URL: z.string().default('file:./dev.db'),

  // Blockchain - Single chain (backward compatible)
  RPC_URL: z.string().optional(),
  CHAIN_ID: z.string().transform(Number).default('1'),

  // Blockchain - Multi-chain (JSON array)
  CHAINS: z.string().optional(),

  // Sync
  START_BLOCK: z.string().transform(BigInt).default('0'),
  BATCH_SIZE: z.string().transform(Number).default('100'),
  CONFIRMATIONS: z.string().transform(Number).default('12'),
  SYNC_INTERVAL: z.string().transform(Number).default('1000'),
  MAX_CONCURRENT_REQUESTS: z.string().transform(Number).default('5'),

  // Contracts (JSON string)
  CONTRACTS: z.string().optional(),

  // Authentication
  AUTH_ENABLED: z.string().transform(val => val === 'true').default('false'),
  JWT_SECRET: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_ENABLED: z.string().transform(val => val === 'true').default('true'),
  RATE_LIMIT_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  // Redis (for distributed locking)
  REDIS_URL: z.string().optional(),
});

/**
 * Contract configuration schema
 */
const contractConfigSchema = z.object({
  name: z.string(),
  address: z.string().startsWith('0x'),
  chainId: z.number().optional(), // Optional: defaults to first chain
  startBlock: z.union([
    z.number().transform(n => BigInt(n)),
    z.string().transform(s => BigInt(s)),
    z.bigint(),
  ]),
  abi: z.any().optional(),
  events: z.array(z.string()).optional(),
});

/**
 * Parse and validate environment variables
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
 * Parse contracts configuration from JSON string
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
 * Parse chains configuration from JSON string
 * Falls back to single chain configuration (RPC_URL + CHAIN_ID) for backward compatibility
 */
export function parseChainsConfig(
  chainsJson?: string,
  defaultChainId?: number,
  defaultRpcUrl?: string
): ChainConfigInput[] {
  // Priority 1: Multi-chain JSON config
  if (chainsJson) {
    try {
      const parsed = JSON.parse(chainsJson);
      const result = z.array(chainConfigSchema).safeParse(parsed);

      if (!result.success) {
        console.error('❌ Invalid chains configuration:');
        console.error(result.error.flatten().fieldErrors);
        // Fall through to single chain fallback
      } else {
        return result.data;
      }
    } catch (error) {
      console.error('❌ Failed to parse CHAINS JSON:', error);
      // Fall through to single chain fallback
    }
  }

  // Priority 2: Single chain fallback (backward compatible)
  if (defaultRpcUrl) {
    return [
      {
        id: defaultChainId ?? 1,
        rpcUrl: defaultRpcUrl,
      },
    ];
  }

  // No chain configured
  console.error('❌ No chain configuration found. Please set either CHAINS or RPC_URL.');
  return [];
}