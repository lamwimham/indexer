-- PostgreSQL Migration
-- Run this for production PostgreSQL deployments

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "lastSyncedBlock" BIGINT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSyncing" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "txIndex" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "args" TEXT NOT NULL,
    "rawData" TEXT NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockCheckpoint" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferEvent" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "tokenName" TEXT,
    "tokenSymbol" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "valueFormatted" DOUBLE PRECISION,
    "decimals" INTEGER,
    "blockNumber" BIGINT NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalEvent" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "tokenName" TEXT,
    "tokenSymbol" TEXT,
    "owner" TEXT NOT NULL,
    "spender" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "valueFormatted" DOUBLE PRECISION,
    "decimals" INTEGER,
    "blockNumber" BIGINT NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwapEvent" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "poolName" TEXT,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount0" TEXT NOT NULL,
    "amount1" TEXT NOT NULL,
    "sqrtPriceX96" TEXT NOT NULL,
    "liquidity" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwapEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyValue" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_chainId_contractAddress_key" ON "SyncState"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "SyncState_chainId_idx" ON "SyncState"("chainId");

-- CreateIndex
CREATE INDEX "SyncState_lastSyncedBlock_idx" ON "SyncState"("lastSyncedBlock");

-- CreateIndex
CREATE UNIQUE INDEX "Event_chainId_txHash_logIndex_key" ON "Event"("chainId", "txHash", "logIndex");

-- CreateIndex
CREATE INDEX "Event_chainId_contractAddress_idx" ON "Event"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "Event_chainId_eventName_idx" ON "Event"("chainId", "eventName");

-- CreateIndex
CREATE INDEX "Event_blockNumber_idx" ON "Event"("blockNumber");

-- CreateIndex
CREATE INDEX "Event_blockTimestamp_idx" ON "Event"("blockTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "BlockCheckpoint_chainId_blockNumber_key" ON "BlockCheckpoint"("chainId", "blockNumber");

-- CreateIndex
CREATE INDEX "BlockCheckpoint_chainId_idx" ON "BlockCheckpoint"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferEvent_chainId_txHash_logIndex_key" ON "TransferEvent"("chainId", "txHash", "logIndex");

-- CreateIndex
CREATE INDEX "TransferEvent_chainId_contractAddress_idx" ON "TransferEvent"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "TransferEvent_from_idx" ON "TransferEvent"("from");

-- CreateIndex
CREATE INDEX "TransferEvent_to_idx" ON "TransferEvent"("to");

-- CreateIndex
CREATE INDEX "TransferEvent_blockNumber_idx" ON "TransferEvent"("blockNumber");

-- CreateIndex
CREATE INDEX "TransferEvent_blockTimestamp_idx" ON "TransferEvent"("blockTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalEvent_chainId_txHash_logIndex_key" ON "ApprovalEvent"("chainId", "txHash", "logIndex");

-- CreateIndex
CREATE INDEX "ApprovalEvent_chainId_contractAddress_idx" ON "ApprovalEvent"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "ApprovalEvent_owner_idx" ON "ApprovalEvent"("owner");

-- CreateIndex
CREATE INDEX "ApprovalEvent_spender_idx" ON "ApprovalEvent"("spender");

-- CreateIndex
CREATE INDEX "ApprovalEvent_blockNumber_idx" ON "ApprovalEvent"("blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SwapEvent_chainId_txHash_logIndex_key" ON "SwapEvent"("chainId", "txHash", "logIndex");

-- CreateIndex
CREATE INDEX "SwapEvent_chainId_contractAddress_idx" ON "SwapEvent"("chainId", "contractAddress");

-- CreateIndex
CREATE INDEX "SwapEvent_sender_idx" ON "SwapEvent"("sender");

-- CreateIndex
CREATE INDEX "SwapEvent_recipient_idx" ON "SwapEvent"("recipient");

-- CreateIndex
CREATE INDEX "SwapEvent_blockNumber_idx" ON "SwapEvent"("blockNumber");

-- CreateIndex
CREATE INDEX "SwapEvent_blockTimestamp_idx" ON "SwapEvent"("blockTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "KeyValue_key_key" ON "KeyValue"("key");

-- CreateIndex
CREATE INDEX "KeyValue_key_idx" ON "KeyValue"("key");