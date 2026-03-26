import type { PrismaClient } from '@prisma/client';
import type { Address } from 'viem';

/**
 * Repository for ERC20 Transfer events
 */
export class TransferEventRepository {
  constructor(private db: PrismaClient) {}

  /**
   * Insert a batch of transfer events
   */
  async insertBatch(events: Array<{
    chainId: number;
    contractAddress: Address;
    tokenName?: string;
    tokenSymbol?: string;
    from: Address;
    to: Address;
    value: bigint;
    valueFormatted?: number;
    decimals?: number;
    blockNumber: bigint;
    blockTimestamp: Date;
    txHash: Address;
    logIndex: number;
  }>) {
    if (events.length === 0) return;

    return this.db.transferEvent.createMany({
      data: events.map((e) => ({
        chainId: e.chainId,
        contractAddress: e.contractAddress.toLowerCase(),
        tokenName: e.tokenName ?? null,
        tokenSymbol: e.tokenSymbol ?? null,
        from: e.from.toLowerCase(),
        to: e.to.toLowerCase(),
        value: e.value.toString(),
        valueFormatted: e.valueFormatted ?? null,
        decimals: e.decimals ?? null,
        blockNumber: e.blockNumber.toString(),
        blockTimestamp: e.blockTimestamp,
        txHash: e.txHash.toLowerCase(),
        logIndex: e.logIndex,
      })),
    });
  }

  /**
   * Query transfers with filters
   */
  async query(filters: {
    chainId?: number;
    contractAddress?: Address;
    from?: Address;
    to?: Address;
    fromBlock?: bigint;
    toBlock?: bigint;
    limit?: number;
    offset?: number;
    orderBy?: 'blockNumber' | 'blockTimestamp' | 'value';
    orderDirection?: 'asc' | 'desc';
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { removed: false };

    if (filters.chainId !== undefined) {
      where.chainId = filters.chainId;
    }
    if (filters.contractAddress) {
      where.contractAddress = filters.contractAddress.toLowerCase();
    }
    if (filters.from) {
      where.from = filters.from.toLowerCase();
    }
    if (filters.to) {
      where.to = filters.to.toLowerCase();
    }
    if (filters.fromBlock !== undefined || filters.toBlock !== undefined) {
      where.blockNumber = {};
      if (filters.fromBlock !== undefined) {
        where.blockNumber.gte = filters.fromBlock.toString();
      }
      if (filters.toBlock !== undefined) {
        where.blockNumber.lte = filters.toBlock.toString();
      }
    }

    return this.db.transferEvent.findMany({
      where,
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
      orderBy: {
        [filters.orderBy ?? 'blockNumber']: filters.orderDirection ?? 'desc',
      },
    });
  }

  /**
   * Get transfer count with filters
   */
  async count(filters: {
    chainId?: number;
    contractAddress?: Address;
    from?: Address;
    to?: Address;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { removed: false };

    if (filters.chainId !== undefined) {
      where.chainId = filters.chainId;
    }
    if (filters.contractAddress) {
      where.contractAddress = filters.contractAddress.toLowerCase();
    }
    if (filters.from) {
      where.from = filters.from.toLowerCase();
    }
    if (filters.to) {
      where.to = filters.to.toLowerCase();
    }

    return this.db.transferEvent.count({ where });
  }

  /**
   * Get balance changes for an address
   */
  async getBalanceChanges(
    chainId: number,
    address: Address,
    contractAddress?: Address
  ) {
    const addr = address.toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      chainId,
      removed: false,
      OR: [{ from: addr }, { to: addr }],
    };

    if (contractAddress) {
      where.contractAddress = contractAddress.toLowerCase();
    }

    return this.db.transferEvent.findMany({
      where,
      orderBy: { blockNumber: 'asc' },
    });
  }

  /**
   * Mark events as removed (for reorg)
   */
  async markAsRemoved(chainId: number, fromBlock: bigint, toBlock: bigint) {
    return this.db.transferEvent.updateMany({
      where: {
        chainId,
        blockNumber: { gte: fromBlock.toString(), lte: toBlock.toString() },
      },
      data: { removed: true },
    });
  }

  /**
   * Delete events in block range
   */
  async deleteByBlockRange(chainId: number, fromBlock: bigint, toBlock: bigint) {
    return this.db.transferEvent.deleteMany({
      where: {
        chainId,
        blockNumber: { gte: fromBlock.toString(), lte: toBlock.toString() },
      },
    });
  }
}