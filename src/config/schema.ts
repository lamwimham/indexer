import { z } from 'zod';

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

  // Blockchain
  RPC_URL: z.string(),
  CHAIN_ID: z.string().transform(Number).default('1'),

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