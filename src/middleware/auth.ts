import { FastifyRequest, FastifyReply } from 'fastify';
import jwt, { SignOptions } from 'jsonwebtoken';
import * as ms from 'ms';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

// Define user interface
interface User {
  address: string;
  isAdmin: boolean;
  iat?: number;
  exp?: number;
}

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

// Public routes that don't require authentication
const publicRoutes = [
  '/health',
  '/api/v1/auth/nonce',
  '/api/v1/auth/verify',
  '/api/v1/faucet/claim',
  '/api/v1/faucet/tokens',
  '/api/v1/faucet/stats',
  '/api/v1/pow/challenge',
];

// Admin routes that require admin privileges
const adminRoutes = [
  '/api/v1/admin',
];

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { url } = request;
  
  // Skip authentication for public routes
  if (publicRoutes.some(route => url.startsWith(route))) {
    return;
  }
  
  // Extract token from Authorization header
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header',
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret) as User;
    request.user = decoded;
    
    // Check admin privileges for admin routes
    if (adminRoutes.some(route => url.startsWith(route))) {
      if (!decoded.isAdmin) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Admin privileges required',
        });
      }
    }
    
    logger.debug(`Authenticated user: ${decoded.address}`);
    
  } catch (error) {
    logger.warn(`Authentication failed: ${error}`);
    
    if (error instanceof jwt.TokenExpiredError) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Token expired',
      });
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }
    
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
    });
  }
}

// Helper function to generate JWT token
export function generateToken(address: string, isAdmin: boolean = false): string {
  const options: SignOptions = { expiresIn: config.jwt.expiresIn as ms.StringValue };
  return jwt.sign(
    { address, isAdmin },
    config.jwt.secret as string,
    options
  );
}

// Helper function to verify if user is admin
export function isAdmin(address: string): boolean {
  return address.toLowerCase() === config.faucet.adminAddress.toLowerCase();
}