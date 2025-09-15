import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { faucetRoutes } from './faucet';
import { adminRoutes } from './admin';
import { config } from '@/config/environment';

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  const apiPrefix = `/api/${config.apiVersion}`;

  // Register route modules
  await server.register(authRoutes, { prefix: `${apiPrefix}/auth` });
  await server.register(faucetRoutes, { prefix: `${apiPrefix}/faucet` });
  await server.register(adminRoutes, { prefix: `${apiPrefix}/admin` });

  // API documentation endpoint
  server.get(`${apiPrefix}/docs`, async () => {
    return {
      name: 'Faucet DApp API',
      version: config.apiVersion,
      description: 'Professional faucet DApp backend API',
      endpoints: {
        auth: {
          'POST /auth/nonce': 'Get nonce for wallet authentication',
          'POST /auth/verify': 'Verify wallet signature and get JWT token',
        },
        faucet: {
          'GET /faucet/tokens': 'Get available tokens and amounts',
          'POST /faucet/claim': 'Claim tokens from faucet',
          'GET /faucet/stats': 'Get faucet statistics',
          'GET /faucet/history/:address': 'Get claim history for address',
        },
        pow: {
          'GET /pow/challenge': 'Get proof-of-work challenge',
          'POST /pow/verify': 'Verify proof-of-work solution',
        },
        admin: {
          'GET /admin/stats': 'Get admin statistics',
          'POST /admin/tokens/add': 'Add new token to faucet',
          'DELETE /admin/tokens/:address': 'Remove token from faucet',
          'POST /admin/pause': 'Pause faucet operations',
          'POST /admin/unpause': 'Resume faucet operations',
        },
      },
    };
  });
}