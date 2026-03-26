import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import type { Logger } from '../utils/logger.js';

/**
 * Authentication configuration
 */
export interface AuthConfig {
  enabled: boolean;
  jwtSecret: string;
  excludePaths: string[];
}

/**
 * JWT payload structure
 */
export interface JwtPayload {
  sub: string;
  role: 'admin' | 'reader' | 'writer';
  iat: number;
  exp: number;
}

/**
 * Register JWT authentication plugin
 */
export async function registerAuth(
  fastify: FastifyInstance,
  config: AuthConfig,
  logger: Logger
): Promise<void> {
  if (!config.enabled) {
    logger.info('Authentication disabled');
    return;
  }

  // Register JWT plugin
  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // Add authentication hook for protected routes
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip excluded paths
    if (isExcludedPath(request.url, config.excludePaths)) {
      return;
    }

    // Skip health and metrics endpoints
    if (request.url.startsWith('/health') || 
        request.url.startsWith('/ready') || 
        request.url === '/metrics' ||
        request.url === '/graphql') {
      return;
    }

    try {
      await request.jwtVerify();
      logger.trace({ user: request.user, url: request.url }, 'Request authenticated');
    } catch (err) {
      logger.warn({ url: request.url }, 'Authentication failed');
      reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Valid JWT token required',
      });
    }
  });

  logger.info('JWT authentication enabled');
}

/**
 * Check if path is excluded from authentication
 */
function isExcludedPath(url: string, excludePaths: string[]): boolean {
  const path = url.split('?')[0];
  return excludePaths.some(excluded => {
    if (excluded.endsWith('*')) {
      return path.startsWith(excluded.slice(0, -1));
    }
    return path === excluded;
  });
}

/**
 * Generate JWT token (for testing/admin purposes)
 */
export function generateToken(
  fastify: FastifyInstance,
  payload: { sub: string; role: 'admin' | 'reader' | 'writer' },
  expiresIn: string = '1h'
): string {
  return fastify.jwt.sign(payload, { expiresIn });
}

/**
 * Role-based access control middleware
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtPayload | undefined;
    
    if (!user) {
      reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    if (!roles.includes(user.role)) {
      reply.code(403).send({
        success: false,
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
      return;
    }
  };
}

/**
 * Admin-only middleware
 */
export const requireAdmin = requireRole('admin');

/**
 * Writer-or-above middleware
 */
export const requireWriter = requireRole('admin', 'writer');