import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '@/utils/logger';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Log the error
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
      ip: request.ip,
    },
  }, 'Request error occurred');

  // Handle validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.validation,
      statusCode: 400,
    });
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: 'Rate Limit Exceeded',
      message: 'Too many requests, please try again later',
      statusCode: 429,
      retryAfter: (error as FastifyError & { headers?: Record<string, string> }).headers?.['retry-after'] || 60,
    });
  }

  // Handle authentication errors
  if (error.statusCode === 401) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
      statusCode: 401,
    });
  }

  // Handle forbidden errors
  if (error.statusCode === 403) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Access denied',
      statusCode: 403,
    });
  }

  // Handle not found errors
  if (error.statusCode === 404) {
    return reply.status(404).send({
      error: 'Not Found',
      message: 'Resource not found',
      statusCode: 404,
    });
  }

  // Handle blockchain/contract errors
  if (error.message.includes('revert') || error.message.includes('gas')) {
    return reply.status(400).send({
      error: 'Blockchain Error',
      message: 'Transaction failed on blockchain',
      details: error.message,
      statusCode: 400,
    });
  }

  // Default error response
  const statusCode = error.statusCode || 500;
  const isDevelopment = process.env['NODE_ENV'] === 'development';

  return reply.status(statusCode).send({
    error: 'Internal Server Error',
    message: isDevelopment ? error.message : 'An unexpected error occurred',
    statusCode,
    ...(isDevelopment && { stack: error.stack }),
  });
}