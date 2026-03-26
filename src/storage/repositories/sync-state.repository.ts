import type { PrismaClient } from '@prisma/client';
import type { Address } from 'viem';

/**
 * Repository for sync state management
 */
export class SyncStateRepository {
  constructor(private db: PrismaClient) {}

  /**
   * Get sync state for a contract
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
   * Get all sync states
   */
  async getAll() {
    return this.db.syncState.findMany();
  }

  /**
   * Create or update sync state
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
   * Set syncing flag
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
   * Record error
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