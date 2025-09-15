import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ethers } from 'ethers';
import crypto from 'crypto';
import { generateToken, isAdmin } from '@/middleware/auth';
import { logger } from '@/utils/logger';

// Request schemas
interface NonceRequest {
  Body: {
    address: string;
  };
}

interface VerifyRequest {
  Body: {
    address: string;
    signature: string;
    nonce: string;
  };
}

// Store nonces temporarily (in production, use Redis)
const nonces = new Map<string, { nonce: string; timestamp: number }>();

// Clean up expired nonces every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [address, data] of nonces.entries()) {
    if (now - data.timestamp > 300000) { // 5 minutes
      nonces.delete(address);
    }
  }
}, 300000);

export async function authRoutes(server: FastifyInstance): Promise<void> {
  // Get nonce for wallet authentication
  server.post<NonceRequest>('/nonce', async (request: FastifyRequest<NonceRequest>, reply: FastifyReply) => {
    try {
      const { address } = request.body;
      
      // Validate Ethereum address
      if (!ethers.isAddress(address)) {
        return reply.status(400).send({
          error: 'Invalid Address',
          message: 'Please provide a valid Ethereum address',
        });
      }
      
      // Generate random nonce
      const nonce = crypto.randomBytes(32).toString('hex');
      const timestamp = Date.now();
      
      // Store nonce with timestamp
      nonces.set(address.toLowerCase(), { nonce, timestamp });
      
      logger.info(`Generated nonce for address: ${address}`);
      
      return reply.send({
        nonce,
        message: `Please sign this message to authenticate with the faucet: ${nonce}`,
      });
      
    } catch (error) {
      logger.error('Error generating nonce:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to generate nonce',
      });
    }
  });
  
  // Verify wallet signature and issue JWT token
  server.post<VerifyRequest>('/verify', async (request: FastifyRequest<VerifyRequest>, reply: FastifyReply) => {
    try {
      const { address, signature, nonce } = request.body;
      
      // Validate inputs
      if (!ethers.isAddress(address)) {
        return reply.status(400).send({
          error: 'Invalid Address',
          message: 'Please provide a valid Ethereum address',
        });
      }
      
      if (!signature || !nonce) {
        return reply.status(400).send({
          error: 'Missing Data',
          message: 'Signature and nonce are required',
        });
      }
      
      // Check if nonce exists and is valid
      const storedData = nonces.get(address.toLowerCase());
      if (!storedData || storedData.nonce !== nonce) {
        return reply.status(400).send({
          error: 'Invalid Nonce',
          message: 'Nonce not found or expired',
        });
      }
      
      // Check if nonce is expired (5 minutes)
      if (Date.now() - storedData.timestamp > 300000) {
        nonces.delete(address.toLowerCase());
        return reply.status(400).send({
          error: 'Expired Nonce',
          message: 'Nonce has expired, please request a new one',
        });
      }
      
      // Verify signature
      const message = `Please sign this message to authenticate with the faucet: ${nonce}`;
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        return reply.status(400).send({
          error: 'Invalid Signature',
          message: 'Signature verification failed',
        });
      }
      
      // Remove used nonce
      nonces.delete(address.toLowerCase());
      
      // Check if user is admin
      const userIsAdmin = isAdmin(address);
      
      // Generate JWT token
      const token = generateToken(address, userIsAdmin);
      
      logger.info(`Authenticated user: ${address} (admin: ${userIsAdmin})`);
      
      return reply.send({
        token,
        address,
        isAdmin: userIsAdmin,
        expiresIn: '24h',
      });
      
    } catch (error) {
      logger.error('Error verifying signature:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to verify signature',
      });
    }
  });
  
  // Get current user info (requires authentication)
  server.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }
    
    return reply.send({
      address: request.user.address,
      isAdmin: request.user.isAdmin,
    });
  });
}