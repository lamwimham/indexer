import { config as dotenvConfig } from 'dotenv';
import type { Logger } from '../utils/logger.js';

/**
 * 密钥提供者配置
 */
export interface SecretsConfig {
  provider: 'env' | 'aws' | 'gcp' | 'azure' | 'vault';
  region?: string;
  secretId?: string;
  vaultUrl?: string;
  vaultToken?: string;
}

/**
 * 密钥缓存
 */
interface SecretsCache {
  [key: string]: string;
}

/**
 * 生产环境部署的密钥管理器
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
   * 初始化密钥管理器
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
   * 从环境变量加载密钥
   */
  private async loadFromEnv(): Promise<void> {
    this.logger.info('Loading secrets from environment variables');
    dotenvConfig();

    // 所有环境变量已加载
    this.initialized = true;
  }

  /**
   * 从 AWS Secrets Manager 加载密钥
   */
  private async loadFromAws(): Promise<void> {
    try {
      // 动态导入以避免在不需要时打包 AWS SDK
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
      // 回退到环境变量
      await this.loadFromEnv();
    }
  }

  /**
   * 从 GCP Secret Manager 加载密钥
   */
  private async loadFromGcp(): Promise<void> {
    try {
      // 动态导入以避免在不需要时打包 GCP SDK
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
   * 从 Azure Key Vault 加载密钥
   */
  private async loadFromAzure(): Promise<void> {
    try {
      // 动态导入以避免在不需要时打包 Azure SDK
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DefaultAzureCredential } = require('@azure/identity');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SecretClient } = require('@azure/keyvault-secrets');

      const vaultUrl = this.config.vaultUrl ?? process.env.AZURE_VAULT_URL;
      if (!vaultUrl) {
        throw new Error('Azure vault URL not configured');
      }

      const client = new SecretClient(vaultUrl, new DefaultAzureCredential());

      // 列出并加载所有密钥
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
   * 从 HashiCorp Vault 加载密钥
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
   * 获取密钥值
   */
  get(key: string): string | undefined {
    // 首先检查缓存（来自密钥管理器）
    if (this.cache[key]) {
      return this.cache[key];
    }

    // 回退到环境变量
    return process.env[key];
  }

  /**
   * 获取密钥值或抛出异常
   */
  getOrThrow(key: string): string {
    const value = this.get(key);
    if (!value) {
      throw new Error(`Secret not found: ${key}`);
    }
    return value;
  }

  /**
   * 获取密钥值或使用默认值
   */
  getOrDefault(key: string, defaultValue: string): string {
    return this.get(key) ?? defaultValue;
  }

  /**
   * 检查密钥是否存在
   */
  has(key: string): boolean {
    return !!this.get(key);
  }

  /**
   * 在缓存中设置密钥（用于测试）
   */
  set(key: string, value: string): void {
    this.cache[key] = value;
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.cache = {};
  }
}

/**
 * 创建密钥管理器实例
 */
export function createSecretsManager(
  config: SecretsConfig,
  logger: Logger
): SecretsManager {
  return new SecretsManager(config, logger);
}

/**
 * 全局密钥管理器实例
 */
let globalSecretsManager: SecretsManager | null = null;

/**
 * 获取全局密钥管理器
 */
export function getSecretsManager(): SecretsManager | null {
  return globalSecretsManager;
}

/**
 * 初始化全局密钥管理器
 */
export async function initializeSecrets(
  config: SecretsConfig,
  logger: Logger
): Promise<SecretsManager> {
  globalSecretsManager = new SecretsManager(config, logger);
  await globalSecretsManager.initialize();
  return globalSecretsManager;
}