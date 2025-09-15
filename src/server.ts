import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import redis from '@fastify/redis';
import websocket from '@fastify/websocket';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { registerRoutes } from '@/routes';
import { errorHandler } from '@/middleware/errorHandler';
import { authMiddleware } from '@/middleware/auth';

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true,
    trustProxy: config.security.trustProxy,
    bodyLimit: 1048576, // 1MB
  });

  // Register plugins
  await server.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  });

  if (config.security.helmetEnabled) {
    await server.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    });
  }

  // Register Redis (optional for development)
  let redisAvailable = false;
  if (config.nodeEnv === 'production') {
    try {
      const redisUrl = new URL(config.redis.url);
      await server.register(redis, {
        host: redisUrl.hostname,
        port: redisUrl.port ? +redisUrl.port : 6379,
        password: config.redis.password || '',
        db: config.redis.db,
      });
      redisAvailable = true;
      logger.info('✅ Redis connected successfully');
    } catch (error) {
      logger.warn('⚠️  Redis not available, using in-memory rate limiting');
    }
  } else {
    logger.info('🔧 Development mode: Skipping Redis, using in-memory rate limiting');
  }

  // Register rate limiting
  const rateLimitConfig = {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) => {
      return request.ip;
    },
    ...(redisAvailable && { redis: server.redis }),
  };

  await server.register(rateLimit, rateLimitConfig);

  // Register WebSocket if enabled
  if (config.websocket.enabled) {
    await server.register(websocket);
  }

  // Register middleware
  server.addHook('preHandler', authMiddleware);
  server.setErrorHandler(errorHandler);

  // Health check endpoint
  server.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: config.apiVersion,
    };
  });

  // Register API routes
  await registerRoutes(server);

  return server;
}