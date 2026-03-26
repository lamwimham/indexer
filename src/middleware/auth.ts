import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import type { Logger } from '../utils/logger.js';

/**
 * 认证配置
 */
export interface AuthConfig {
  enabled: boolean;
  jwtSecret: string;
  excludePaths: string[];
}

/**
 * JWT 载荷结构
 */
export interface JwtPayload {
  sub: string;
  role: 'admin' | 'reader' | 'writer';
  iat: number;
  exp: number;
}

/**
 * 注册 JWT 认证插件
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

  // 注册 JWT 插件
  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // 为受保护的路由添加认证钩子
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // 跳过排除的路径
    if (isExcludedPath(request.url, config.excludePaths)) {
      return;
    }

    // 跳过健康检查和指标端点
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
 * 检查路径是否被排除在认证之外
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
 * 生成 JWT 令牌（用于测试/管理目的）
 */
export function generateToken(
  fastify: FastifyInstance,
  payload: { sub: string; role: 'admin' | 'reader' | 'writer' },
  expiresIn: string = '1h'
): string {
  return fastify.jwt.sign(payload, { expiresIn });
}

/**
 * 基于角色的访问控制中间件
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
 * 仅管理员中间件
 */
export const requireAdmin = requireRole('admin');

/**
 * 写入者及以上权限中间件
 */
export const requireWriter = requireRole('admin', 'writer');