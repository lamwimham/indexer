import type { Abi } from 'viem';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';
import type { HandlerContext } from '../../types/index.js';
import { EventProcessor, createEventSignature } from '../event-processor.js';
import { recordEvent } from '../../monitoring/metrics.js';

/**
 * ERC20 ABI，包含 Transfer 和 Approval 事件
 */
export const ERC20_ABI: Abi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'spender', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
    name: 'Approval',
    type: 'event',
  },
];

/**
 * Transfer 事件参数
 */
export interface TransferArgs {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
}

/**
 * Approval 事件参数
 */
export interface ApprovalArgs {
  owner: `0x${string}`;
  spender: `0x${string}`;
  value: bigint;
}

/**
 * 代币元数据缓存
 */
export interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
}

/**
 * ERC20 事件处理器
 * 处理 Transfer 和 Approval 事件
 */
export class ERC20EventProcessor extends EventProcessor {
  private db: PrismaClient;
  private tokenMetadata: Map<string, TokenMetadata> = new Map();

  constructor(db: PrismaClient, logger: Logger) {
    super(logger);
    this.db = db;

    // 注册 Transfer 事件处理器
    const transferEvent = ERC20_ABI.find((e) => e.type === 'event' && e.name === 'Transfer')!;
    this.registerEvent({
      signature: createEventSignature(transferEvent),
      abi: transferEvent,
      handler: this.handleTransfer.bind(this),
    });

    // 注册 Approval 事件处理器
    const approvalEvent = ERC20_ABI.find((e) => e.type === 'event' && e.name === 'Approval')!;
    this.registerEvent({
      signature: createEventSignature(approvalEvent),
      abi: approvalEvent,
      handler: this.handleApproval.bind(this),
    });
  }

  /**
   * 设置合约的代币元数据
   */
  setTokenMetadata(address: string, metadata: TokenMetadata): void {
    this.tokenMetadata.set(address.toLowerCase(), metadata);
  }

  /**
   * 获取合约的代币元数据
   */
  getTokenMetadata(address: string): TokenMetadata {
    return this.tokenMetadata.get(address.toLowerCase()) ?? {};
  }

  /**
   * 处理 Transfer 事件
   */
  private async handleTransfer(
    event: {
      args: Record<string, unknown>;
      blockNumber: bigint;
      blockTimestamp: Date;
      transactionHash: `0x${string}`;
      logIndex: number;
      chainId: number;
      contractAddress: `0x${string}`;
      contractName: string;
    },
    context: HandlerContext
  ): Promise<void> {
    const args = event.args as unknown as TransferArgs;
    const metadata = this.getTokenMetadata(event.contractAddress);

    // 计算格式化后的数值
    const decimals = metadata.decimals ?? 18;
    const valueFormatted = Number(args.value) / Math.pow(10, decimals);

    context.logger.debug(
      {
        from: args.from,
        to: args.to,
        value: args.value.toString(),
        valueFormatted,
        contract: event.contractName,
      },
      'Processing Transfer event'
    );

    // 存储到数据库（使用 upsert 处理重复数据）
    await this.db.transferEvent.upsert({
      where: {
        chainId_txHash_logIndex: {
          chainId: event.chainId,
          txHash: event.transactionHash.toLowerCase(),
          logIndex: event.logIndex,
        },
      },
      update: {},
      create: {
        chainId: event.chainId,
        contractAddress: event.contractAddress.toLowerCase(),
        tokenName: metadata.name,
        tokenSymbol: metadata.symbol,
        from: args.from.toLowerCase(),
        to: args.to.toLowerCase(),
        value: args.value.toString(),
        valueFormatted: valueFormatted,
        decimals: decimals,
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.blockTimestamp,
        txHash: event.transactionHash.toLowerCase(),
        logIndex: event.logIndex,
      },
    });

    // 同时存储到通用事件表（使用 upsert 处理重复数据）
    await this.db.event.upsert({
      where: {
        chainId_txHash_logIndex: {
          chainId: event.chainId,
          txHash: event.transactionHash.toLowerCase(),
          logIndex: event.logIndex,
        },
      },
      update: {},
      create: {
        chainId: event.chainId,
        contractAddress: event.contractAddress.toLowerCase(),
        contractName: event.contractName,
        eventName: 'Transfer',
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.blockTimestamp,
        txHash: event.transactionHash.toLowerCase(),
        txIndex: 0,
        logIndex: event.logIndex,
        args: JSON.stringify({
          from: args.from,
          to: args.to,
          value: args.value.toString(),
        }),
        rawData: JSON.stringify({
          from: args.from,
          to: args.to,
          value: args.value.toString(),
        }),
      },
    });

    // 记录指标
    recordEvent(event.chainId, event.contractAddress, 'Transfer');
  }

  /**
   * 处理 Approval 事件
   */
  private async handleApproval(
    event: {
      args: Record<string, unknown>;
      blockNumber: bigint;
      blockTimestamp: Date;
      transactionHash: `0x${string}`;
      logIndex: number;
      chainId: number;
      contractAddress: `0x${string}`;
      contractName: string;
    },
    context: HandlerContext
  ): Promise<void> {
    const args = event.args as unknown as ApprovalArgs;
    const metadata = this.getTokenMetadata(event.contractAddress);

    // 计算格式化后的数值
    const decimals = metadata.decimals ?? 18;
    const valueFormatted = Number(args.value) / Math.pow(10, decimals);

    context.logger.debug(
      {
        owner: args.owner,
        spender: args.spender,
        value: args.value.toString(),
        contract: event.contractName,
      },
      'Processing Approval event'
    );

    // 存储到数据库（使用 upsert 处理重复数据）
    await this.db.approvalEvent.upsert({
      where: {
        chainId_txHash_logIndex: {
          chainId: event.chainId,
          txHash: event.transactionHash.toLowerCase(),
          logIndex: event.logIndex,
        },
      },
      update: {},
      create: {
        chainId: event.chainId,
        contractAddress: event.contractAddress.toLowerCase(),
        tokenName: metadata.name,
        tokenSymbol: metadata.symbol,
        owner: args.owner.toLowerCase(),
        spender: args.spender.toLowerCase(),
        value: args.value.toString(),
        valueFormatted: valueFormatted,
        decimals: decimals,
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.blockTimestamp,
        txHash: event.transactionHash.toLowerCase(),
        logIndex: event.logIndex,
      },
    });

    // 同时存储到通用事件表（使用 upsert 处理重复数据）
    await this.db.event.upsert({
      where: {
        chainId_txHash_logIndex: {
          chainId: event.chainId,
          txHash: event.transactionHash.toLowerCase(),
          logIndex: event.logIndex,
        },
      },
      update: {},
      create: {
        chainId: event.chainId,
        contractAddress: event.contractAddress.toLowerCase(),
        contractName: event.contractName,
        eventName: 'Approval',
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.blockTimestamp,
        txHash: event.transactionHash.toLowerCase(),
        txIndex: 0,
        logIndex: event.logIndex,
        args: JSON.stringify({
          owner: args.owner,
          spender: args.spender,
          value: args.value.toString(),
        }),
        rawData: JSON.stringify({
          owner: args.owner,
          spender: args.spender,
          value: args.value.toString(),
        }),
      },
    });

    // 记录指标
    recordEvent(event.chainId, event.contractAddress, 'Approval');
  }
}