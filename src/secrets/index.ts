import { config as dotenvConfig } from 'dotenv';
import type { Logger } from '../utils/logger.js';

/**
 * Secrets provider configuration
 */
export interface SecretsConfig {
  provider: 'env' | 'aws' | 'gcp' | 'azure' | 'vault';
  region?: string;
  secretId?: string;
  vaultUrl?: string;
  vaultToken?: string;
}

/**
 * Secrets cache
 */
interface SecretsCache {
  [key: string]: string;
}

/**
 * Secrets manager for production deployments
 */
export class SecretsManager {
  private config: SecretsConfig;
  private logger: Logger;
  private cache: SecretsCache = {};
  private initialized = false;

  constructor(config: SecretsConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'secrets-manager' });
  }

  /**
   * Initialize the secrets manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    switch (this.config.provider) {
      case 'env':
        await this.loadFromEnv();
        break;
      case 'aws':
        await this.loadFromAws();
        break;
      case 'gcp':
        await this.loadFromGcp();
        break;
      case 'azure':
        await this.loadFromAzure();
        break;
      case 'vault':
        await this.loadFromVault();
        break;
      default:
        this.logger.warn({ provider: this.config.provider }, 'Unknown secrets provider, falling back to env');
        await this.loadFromEnv();
    }

    this.initialized = true;
  }

  /**
   * Load secrets from environment variables
   */
  private async loadFromEnv(): Promise<void> {
    this.logger.info('Loading secrets from environment variables');
    dotenvConfig();
    
    // All env vars are already loaded
    this.initialized = true;
  }

  /**
   * Load secrets from AWS Secrets Manager
   */
  private async loadFromAws(): Promise<void> {
    try {
      // Dynamic import to avoid bundling AWS SDK when not needed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

      const client = new SecretsManagerClient({
        region: this.config.region ?? process.env.AWS_REGION ?? 'us-east-1',
      });

      const command = new GetSecretValueCommand({
        SecretId: this.config.secretId ?? process.env.AWS_SECRET_ID,
      });

      const response = await client.send(command);

      if (response.SecretString) {
        const secrets = JSON.parse(response.SecretString);
        Object.assign(this.cache, secrets);
        this.logger.info('Loaded secrets from AWS Secrets Manager');
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to load secrets from AWS Secrets Manager');
      // Fall back to environment variables
      await this.loadFromEnv();
    }
  }

  /**
   * Load secrets from GCP Secret Manager
   */
  private async loadFromGcp(): Promise<void> {
    try {
      // Dynamic import to avoid bundling GCP SDK when not needed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

      const client = new SecretManagerServiceClient();
      const name = this.config.secretId ?? process.env.GCP_SECRET_NAME;

      if (!name) {
        throw new Error('GCP secret name not configured');
      }

      const [version] = await client.accessSecretVersion({ name });
      const payload = version.payload?.data?.toString();

      if (payload) {
        const secrets = JSON.parse(payload);
        Object.assign(this.cache, secrets);
        this.logger.info('Loaded secrets from GCP Secret Manager');
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to load secrets from GCP Secret Manager');
      await this.loadFromEnv();
    }
  }

  /**
   * Load secrets from Azure Key Vault
   */
  private async loadFromAzure(): Promise<void> {
    try {
      // Dynamic import to avoid bundling Azure SDK when not needed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DefaultAzureCredential } = require('@azure/identity');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SecretClient } = require('@azure/keyvault-secrets');

      const vaultUrl = this.config.vaultUrl ?? process.env.AZURE_VAULT_URL;
      if (!vaultUrl) {
        throw new Error('Azure vault URL not configured');
      }

      const client = new SecretClient(vaultUrl, new DefaultAzureCredential());
      
      // List and load all secrets
      for await (const secretProperties of client.listPropertiesOfSecrets()) {
        const secret = await client.getSecret(secretProperties.name);
        if (secret.value) {
          this.cache[secretProperties.name] = secret.value;
        }
      }

      this.logger.info('Loaded secrets from Azure Key Vault');
    } catch (error) {
      this.logger.error({ error }, 'Failed to load secrets from Azure Key Vault');
      await this.loadFromEnv();
    }
  }

  /**
   * Load secrets from HashiCorp Vault
   */
  private async loadFromVault(): Promise<void> {
    try {
      const vaultUrl = this.config.vaultUrl ?? process.env.VAULT_ADDR;
      const vaultToken = this.config.vaultToken ?? process.env.VAULT_TOKEN;
      const secretPath = process.env.VAULT_SECRET_PATH ?? 'secret/data/indexer';

      if (!vaultUrl || !vaultToken) {
        throw new Error('Vault URL or token not configured');
      }

      const response = await fetch(`${vaultUrl}/v1/${secretPath}`, {
        headers: {
          'X-Vault-Token': vaultToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Vault request failed: ${response.statusText}`);
      }

      const data = await response.json() as { data?: { data?: Record<string, string> } };
      const secrets = data?.data?.data ?? {};
      Object.assign(this.cache, secrets);
      this.logger.info('Loaded secrets from HashiCorp Vault');
    } catch (error) {
      this.logger.error({ error }, 'Failed to load secrets from HashiCorp Vault');
      await this.loadFromEnv();
    }
  }

  /**
   * Get a secret value
   */
  get(key: string): string | undefined {
    // First check cache (from secrets manager)
    if (this.cache[key]) {
      return this.cache[key];
    }

    // Fall back to environment variable
    return process.env[key];
  }

  /**
   * Get a secret value or throw
   */
  getOrThrow(key: string): string {
    const value = this.get(key);
    if (!value) {
      throw new Error(`Secret not found: ${key}`);
    }
    return value;
  }

  /**
   * Get a secret value with default
   */
  getOrDefault(key: string, defaultValue: string): string {
    return this.get(key) ?? defaultValue;
  }

  /**
   * Check if a secret exists
   */
  has(key: string): boolean {
    return !!this.get(key);
  }

  /**
   * Set a secret in cache (for testing)
   */
  set(key: string, value: string): void {
    this.cache[key] = value;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache = {};
  }
}

/**
 * Create a secrets manager instance
 */
export function createSecretsManager(
  config: SecretsConfig,
  logger: Logger
): SecretsManager {
  return new SecretsManager(config, logger);
}

/**
 * Global secrets manager instance
 */
let globalSecretsManager: SecretsManager | null = null;

/**
 * Get the global secrets manager
 */
export function getSecretsManager(): SecretsManager | null {
  return globalSecretsManager;
}

/**
 * Initialize the global secrets manager
 */
export async function initializeSecrets(
  config: SecretsConfig,
  logger: Logger
): Promise<SecretsManager> {
  globalSecretsManager = new SecretsManager(config, logger);
  await globalSecretsManager.initialize();
  return globalSecretsManager;
}