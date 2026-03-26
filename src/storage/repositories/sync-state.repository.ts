import type { PrismaClient } from '@prisma/client';
import type { Address } from 'viem';

/**
 * 同步状态管理仓库
 */
export class SyncStateRepository {
  constructor(private db: PrismaClient) {}

  /**
   * 获取合约的同步状态
   */
  async get(chainId: number, contractAddress: Address) {
    return this.db.syncState.findUnique({
      where: {
        chainId_contractAddress: {
          chainId,
          contractAddress: contractAddress.toLowerCase(),
        },
      },
    });
  }

  /**
   * 获取所有同步状态
   */
  async getAll() {
    return this.db.syncState.findMany();
  }

  /**
   * 创建或更新同步状态
   */
  async upsert(
    chainId: number,
    contractAddress: Address,
    contractName: string,
    lastSyncedBlock: bigint,
    isSyncing: boolean = false,
    error?: string
  ) {
    return this.db.syncState.upsert({
      where: {
        chainId_contractAddress: {
          chainId,
          contractAddress: contractAddress.toLowerCase(),
        },
      },
      update: {
        lastSyncedBlock: lastSyncedBlock.toString(),
        lastSyncedAt: new Date(),
        isSyncing,
        lastError: error,
      },
      create: {
        chainId,
        contractAddress: contractAddress.toLowerCase(),
        contractName,
        lastSyncedBlock: lastSyncedBlock.toString(),
        isSyncing,
        lastError: error,
      },
    });
  }

  /**
   * 设置同步标志
   */
  async setSyncing(chainId: number, contractAddress: Address, isSyncing: boolean) {
    return this.db.syncState.update({
      where: {
        chainId_contractAddress: {
          chainId,
          contractAddress: contractAddress.toLowerCase(),
        },
      },
      data: { isSyncing },
    });
  }

  /**
   * 记录错误
   */
  async recordError(chainId: number, contractAddress: Address, error: string) {
    return this.db.syncState.update({
      where: {
        chainId_contractAddress: {
          chainId,
          contractAddress: contractAddress.toLowerCase(),
        },
      },
      data: { lastError: error, isSyncing: false },
    });
  }
}