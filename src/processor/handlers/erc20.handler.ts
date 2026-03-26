import type { Abi } from 'viem';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';
import type { HandlerContext } from '../../types/index.js';
import { EventProcessor, createEventSignature } from '../event-processor.js';

/**
 * ERC20 ABI for Transfer and Approval events
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
 * Uniswap V3 Pool ABI for Swap, Mint, Burn, Collect events
 */
export const UNISWAP_V3_POOL_ABI: Abi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: true, name: 'recipient', type: 'address' },
      { indexed: false, name: 'amount0', type: 'int256' },
      { indexed: false, name: 'amount1', type: 'int256' },
      { indexed: false, name: 'sqrtPriceX96', type: 'uint256' },
      { indexed: false, name: 'liquidity', type: 'uint128' },
      { indexed: false, name: 'tick', type: 'int24' },
    ],
    name: 'Swap',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: 'sender', type: 'address' },
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'tickLower', type: 'int24' },
      { indexed: true, name: 'tickUpper', type: 'int24' },
      { indexed: false, name: 'amount', type: 'uint128' },
      { indexed: false, name: 'amount0', type: 'uint256' },
      { indexed: false, name: 'amount1', type: 'uint256' },
    ],
    name: 'Mint',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'tickLower', type: 'int24' },
      { indexed: true, name: 'tickUpper', type: 'int24' },
      { indexed: false, name: 'amount', type: 'uint128' },
      { indexed: false, name: 'amount0', type: 'uint256' },
      { indexed: false, name: 'amount1', type: 'uint256' },
    ],
    name: 'Burn',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: false, name: 'recipient', type: 'address' },
      { indexed: true, name: 'tickLower', type: 'int24' },
      { indexed: true, name: 'tickUpper', type: 'int24' },
      { indexed: false, name: 'amount0', type: 'uint256' },
      { indexed: false, name: 'amount1', type: 'uint256' },
    ],
    name: 'Collect',
    type: 'event',
  },
];

/**
 * Transfer event args
 */
export interface TransferArgs {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
}

/**
 * Approval event args
 */
export interface ApprovalArgs {
  owner: `0x${string}`;
  spender: `0x${string}`;
  value: bigint;
}

/**
 * Swap event args (Uniswap V3)
 */
export interface SwapArgs {
  sender: `0x${string}`;
  recipient: `0x${string}`;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
}

/**
 * Token metadata cache
 */
interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
}

/**
 * ERC20 event processor with token metadata support
 */
export class ERC20EventProcessor extends EventProcessor {
  private db: PrismaClient;
  private tokenMetadata: Map<string, TokenMetadata> = new Map();

  constructor(db: PrismaClient, logger: Logger) {
    super(logger);
    this.db = db;

    // Register Transfer event handler
    const transferEvent = ERC20_ABI.find((e) => e.type === 'event' && e.name === 'Transfer')!;
    this.registerEvent({
      signature: createEventSignature(transferEvent),
      abi: transferEvent,
      handler: this.handleTransfer.bind(this),
    });

    // Register Approval event handler
    const approvalEvent = ERC20_ABI.find((e) => e.type === 'event' && e.name === 'Approval')!;
    this.registerEvent({
      signature: createEventSignature(approvalEvent),
      abi: approvalEvent,
      handler: this.handleApproval.bind(this),
    });

    // Register Swap event handler (Uniswap V3)
    const swapEvent = UNISWAP_V3_POOL_ABI.find((e) => e.type === 'event' && e.name === 'Swap')!;
    this.registerEvent({
      signature: createEventSignature(swapEvent),
      abi: swapEvent,
      handler: this.handleSwap.bind(this),
    });
  }

  /**
   * Set token metadata for a contract
   */
  setTokenMetadata(address: string, metadata: TokenMetadata): void {
    this.tokenMetadata.set(address.toLowerCase(), metadata);
  }

  /**
   * Get token metadata for a contract
   */
  getTokenMetadata(address: string): TokenMetadata {
    return this.tokenMetadata.get(address.toLowerCase()) ?? {};
  }

  /**
   * Handle Transfer event
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

    // Calculate formatted value
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

    // Store in database (use upsert to handle duplicates)
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

    // Also store in generic events table (use upsert to handle duplicates)
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
  }

  /**
   * Handle Approval event
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

    // Calculate formatted value
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

    // Store in database (use upsert to handle duplicates)
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

    // Also store in generic events table (use upsert to handle duplicates)
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
  }

  /**
   * Handle Swap event (Uniswap V3)
   */
  private async handleSwap(
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
    const args = event.args as unknown as SwapArgs;

    context.logger.info(
      {
        sender: args.sender,
        recipient: args.recipient,
        amount0: args.amount0.toString(),
        amount1: args.amount1.toString(),
        tick: args.tick,
        contract: event.contractName,
      },
      'Processing Swap event'
    );

    // Store in database (use upsert to handle duplicates)
    await this.db.swapEvent.upsert({
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
        poolName: event.contractName,
        sender: args.sender.toLowerCase(),
        recipient: args.recipient.toLowerCase(),
        amount0: args.amount0.toString(),
        amount1: args.amount1.toString(),
        sqrtPriceX96: args.sqrtPriceX96.toString(),
        liquidity: args.liquidity.toString(),
        tick: args.tick,
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.blockTimestamp,
        txHash: event.transactionHash.toLowerCase(),
        logIndex: event.logIndex,
      },
    });

    // Also store in generic events table (use upsert to handle duplicates)
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
        eventName: 'Swap',
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.blockTimestamp,
        txHash: event.transactionHash.toLowerCase(),
        txIndex: 0,
        logIndex: event.logIndex,
        args: JSON.stringify({
          sender: args.sender,
          recipient: args.recipient,
          amount0: args.amount0.toString(),
          amount1: args.amount1.toString(),
          sqrtPriceX96: args.sqrtPriceX96.toString(),
          liquidity: args.liquidity.toString(),
          tick: args.tick,
        }),
        rawData: JSON.stringify({
          sender: args.sender,
          recipient: args.recipient,
          amount0: args.amount0.toString(),
          amount1: args.amount1.toString(),
          sqrtPriceX96: args.sqrtPriceX96.toString(),
          liquidity: args.liquidity.toString(),
          tick: args.tick,
        }),
      },
    });
  }
}