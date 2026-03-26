# ===========================================
# Web3 Indexer - Production Dockerfile
# ===========================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup -g 1001 -S indexer && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G indexer -g indexer indexer

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY docker-entrypoint.sh ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Switch to non-root user
USER indexer

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["./docker-entrypoint.sh"]