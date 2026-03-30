import type { Abi } from 'viem';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';
import type { HandlerContext } from '../../types/index.js';
import { EventProcessor, createEventSignature } from '../event-processor.js';
import { recordEvent } from '../../monitoring/metrics.js';

/**
 * Uniswap V3 Pool ABI，包含 Swap、Mint、Burn、Collect 事件
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
 * Swap 事件参数
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
 * Mint 事件参数
 */
export interface MintArgs {
  sender: `0x${string}`;
  owner: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  amount: bigint;
  amount0: bigint;
  amount1: bigint;
}

/**
 * Burn 事件参数
 */
export interface BurnArgs {
  owner: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  amount: bigint;
  amount0: bigint;
  amount1: bigint;
}

/**
 * Collect 事件参数
 */
export interface CollectArgs {
  owner: `0x${string}`;
  recipient: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  amount0: bigint;
  amount1: bigint;
}

/**
 * Uniswap V3 Pool 事件处理器
 * 处理 Swap, Mint, Burn, Collect 事件
 */
export class UniswapV3EventProcessor extends EventProcessor {
  private db: PrismaClient;

  constructor(db: PrismaClient, logger: Logger) {
    super(logger);
    this.db = db;

    // 注册 Swap 事件处理器
    const swapEvent = UNISWAP_V3_POOL_ABI.find((e) => e.type === 'event' && e.name === 'Swap')!;
    this.registerEvent({
      signature: createEventSignature(swapEvent),
      abi: swapEvent,
      handler: this.handleSwap.bind(this),
    });

    // 注册 Mint 事件处理器
    const mintEvent = UNISWAP_V3_POOL_ABI.find((e) => e.type === 'event' && e.name === 'Mint')!;
    this.registerEvent({
      signature: createEventSignature(mintEvent),
      abi: mintEvent,
      handler: this.handleMint.bind(this),
    });

    // 注册 Burn 事件处理器
    const burnEvent = UNISWAP_V3_POOL_ABI.find((e) => e.type === 'event' && e.name === 'Burn')!;
    this.registerEvent({
      signature: createEventSignature(burnEvent),
      abi: burnEvent,
      handler: this.handleBurn.bind(this),
    });

    // 注册 Collect 事件处理器
    const collectEvent = UNISWAP_V3_POOL_ABI.find((e) => e.type === 'event' && e.name === 'Collect')!;
    this.registerEvent({
      signature: createEventSignature(collectEvent),
      abi: collectEvent,
      handler: this.handleCollect.bind(this),
    });
  }

  /**
   * 处理 Swap 事件
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

    context.logger.debug(
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

    // 存储到 swapEvent 表
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

    // 同时存储到通用事件表
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

    // 记录指标
    recordEvent(event.chainId, event.contractAddress, 'Swap');
  }

  /**
   * 处理 Mint 事件
   */
  private async handleMint(
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
    const args = event.args as unknown as MintArgs;

    context.logger.debug(
      {
        sender: args.sender,
        owner: args.owner,
        tickLower: args.tickLower,
        tickUpper: args.tickUpper,
        amount: args.amount.toString(),
        contract: event.contractName,
      },
      'Processing Mint event'
    );

    // 存储到通用事件表
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
        eventName: 'Mint',
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.blockTimestamp,
        txHash: event.transactionHash.toLowerCase(),
        txIndex: 0,
        logIndex: event.logIndex,
        args: JSON.stringify({
          sender: args.sender,
          owner: args.owner,
          tickLower: args.tickLower,
          tickUpper: args.tickUpper,
          amount: args.amount.toString(),
          amount0: args.amount0.toString(),
          amount1: args.amount1.toString(),
        }),
        rawData: JSON.stringify({
          sender: args.sender,
          owner: args.owner,
          tickLower: args.tickLower,
          tickUpper: args.tickUpper,
          amount: args.amount.toString(),
          amount0: args.amount0.toString(),
          amount1: args.amount1.toString(),
        }),
      },
    });

    // 记录指标
    recordEvent(event.chainId, event.contractAddress, 'Mint');
  }

  /**
   * 处理 Burn 事件
   */
  private async handleBurn(
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
    const args = event.args as unknown as BurnArgs;

    context.logger.debug(
      {
        owner: args.owner,
        tickLower: args.tickLower,
        tickUpper: args.tickUpper,
        amount: args.amount.toString(),
        contract: event.contractName,
      },
      'Processing Burn event'
    );

    // 存储到通用事件表
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
        eventName: 'Burn',
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.blockTimestamp,
        txHash: event.transactionHash.toLowerCase(),
        txIndex: 0,
        logIndex: event.logIndex,
        args: JSON.stringify({
          owner: args.owner,
          tickLower: args.tickLower,
          tickUpper: args.tickUpper,
          amount: args.amount.toString(),
          amount0: args.amount0.toString(),
          amount1: args.amount1.toString(),
        }),
        rawData: JSON.stringify({
          owner: args.owner,
          tickLower: args.tickLower,
          tickUpper: args.tickUpper,
          amount: args.amount.toString(),
          amount0: args.amount0.toString(),
          amount1: args.amount1.toString(),
        }),
      },
    });

    // 记录指标
    recordEvent(event.chainId, event.contractAddress, 'Burn');
  }

  /**
   * 处理 Collect 事件
   */
  private async handleCollect(
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
    const args = event.args as unknown as CollectArgs;

    context.logger.debug(
      {
        owner: args.owner,
        recipient: args.recipient,
        tickLower: args.tickLower,
        tickUpper: args.tickUpper,
        amount0: args.amount0.toString(),
        amount1: args.amount1.toString(),
        contract: event.contractName,
      },
      'Processing Collect event'
    );

    // 存储到通用事件表
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
        eventName: 'Collect',
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: event.blockTimestamp,
        txHash: event.transactionHash.toLowerCase(),
        txIndex: 0,
        logIndex: event.logIndex,
        args: JSON.stringify({
          owner: args.owner,
          recipient: args.recipient,
          tickLower: args.tickLower,
          tickUpper: args.tickUpper,
          amount0: args.amount0.toString(),
          amount1: args.amount1.toString(),
        }),
        rawData: JSON.stringify({
          owner: args.owner,
          recipient: args.recipient,
          tickLower: args.tickLower,
          tickUpper: args.tickUpper,
          amount0: args.amount0.toString(),
          amount1: args.amount1.toString(),
        }),
      },
    });

    // 记录指标
    recordEvent(event.chainId, event.contractAddress, 'Collect');
  }
}