import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

// Simple serverless-compatible server without complex path mappings
export async function createServerlessApp(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true,
    trustProxy: true,
    bodyLimit: 1048576, // 1MB
  });

  // Register basic plugins
  const corsOrigin = process.env['CORS_ORIGIN'] || ['https://w3e-faucet-front.vercel.app', 'http://localhost:3000', '*'];
  await server.register(cors, {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

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

  // Register rate limiting with in-memory store for serverless
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    skipOnError: true,
    keyGenerator: (request) => request.ip,
  });

  // Health check endpoint
  server.get('/health', async () => {
    try {
      const { validateEnvironment, getEnvironmentInfo } = await import('./config');
      const envValidation = validateEnvironment();
      const envInfo = getEnvironmentInfo();
      
      return {
        status: envValidation.isValid ? 'ok' : 'warning',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: envInfo,
        ready: envValidation.isValid
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        error: 'Failed to load configuration'
      };
    }
  });

  // Environment info endpoint for debugging
  server.get('/env-info', async (request, reply) => {
    try {
      const { getEnvironmentInfo } = await import('./config');
      const envInfo = getEnvironmentInfo();
      
      return envInfo;
    } catch (error) {
      console.error('Environment info error:', error);
      return reply.status(500).send({ error: 'Failed to get environment info' });
    }
  });

  // ETH faucet claim endpoint
  server.post('/faucet/claim/eth', async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body?.address) {
        return reply.status(400).send({ error: 'Address is required' });
      }

      // Import services dynamically to avoid cold start issues
      const { ServerlessBlockchainService } = await import('./blockchain');
      const { ServerlessClaimDataService } = await import('./claimData');

      // Validate address format
      if (!ServerlessClaimDataService.validateAddress(body.address)) {
        return reply.status(400).send({ error: 'Invalid Ethereum address format' });
      }

      // Initialize blockchain service
      const blockchainService = new ServerlessBlockchainService();

      // Check if user can claim ETH
      const canClaim = await blockchainService.canClaimEth(body.address);
      if (!canClaim.canClaim) {
        const remainingMinutes = Math.ceil((canClaim.remainingTime || 0) / 60);
        return reply.status(429).send({ 
          error: `Cooldown active. You can claim again in ${remainingMinutes} minutes.`,
          remainingTime: canClaim.remainingTime
        });
      }

      // Execute ETH claim
      const result = await blockchainService.claimEth(body.address);
      
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      // Get ETH amount for response
      const ethAmount = await blockchainService.getEthAmount();

      // Record claim in local storage
      ServerlessClaimDataService.addClaim(body.address, {
        timestamp: Date.now(),
        tokenAddress: '0x0000000000000000000000000000000000000000', // ETH
        amount: ethAmount,
        txHash: result.txHash!,
        type: 'ETH'
      });

      return {
        success: true,
        message: 'ETH claim successful',
        address: body.address,
        amount: ethAmount,
        txHash: result.txHash,
        type: 'ETH'
      };
    } catch (error) {
      console.error('ETH claim error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Token faucet claim endpoint
  server.post('/faucet/claim/token', async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body?.address || !body?.tokenAddress) {
        return reply.status(400).send({ error: 'Address and tokenAddress are required' });
      }

      // Import services dynamically
      const { ServerlessBlockchainService } = await import('./blockchain');
      const { ServerlessClaimDataService } = await import('./claimData');

      // Validate addresses
      if (!ServerlessClaimDataService.validateAddress(body.address) || 
          !ServerlessClaimDataService.validateAddress(body.tokenAddress)) {
        return reply.status(400).send({ error: 'Invalid address format' });
      }

      // Check if token is supported
      const tokenInfo = ServerlessClaimDataService.getToken(body.tokenAddress);
      if (!tokenInfo) {
        return reply.status(400).send({ error: 'Token not supported' });
      }

      // Initialize blockchain service
      const blockchainService = new ServerlessBlockchainService();

      // Check if user can claim token
      const canClaim = await blockchainService.canClaimToken(body.address, body.tokenAddress);
      if (!canClaim.canClaim) {
        const remainingMinutes = Math.ceil((canClaim.remainingTime || 0) / 60);
        return reply.status(429).send({ 
          error: `Cooldown active for ${tokenInfo.symbol}. You can claim again in ${remainingMinutes} minutes.`,
          remainingTime: canClaim.remainingTime
        });
      }

      // Execute token claim
      const result = await blockchainService.claimToken(body.address, body.tokenAddress);
      
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      // Record claim in local storage
      ServerlessClaimDataService.addClaim(body.address, {
        timestamp: Date.now(),
        tokenAddress: body.tokenAddress,
        amount: tokenInfo.amount,
        txHash: result.txHash!,
        type: 'TOKEN'
      });

      return {
        success: true,
        message: `${tokenInfo.symbol} claim successful`,
        address: body.address,
        amount: tokenInfo.amount,
        txHash: result.txHash,
        type: 'TOKEN',
        token: {
          address: body.tokenAddress,
          symbol: tokenInfo.symbol,
          name: tokenInfo.name
        }
      };
    } catch (error) {
      console.error('Token claim error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get supported tokens endpoint
  server.get('/faucet/tokens', async (request, reply) => {
    try {
      const { ServerlessClaimDataService } = await import('./claimData');
      const tokens = ServerlessClaimDataService.getAllTokens();
      return { tokens };
    } catch (error) {
      console.error('Get tokens error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get user claim history endpoint
  server.get('/faucet/history/:address', async (request, reply) => {
    try {
      const { address } = request.params as { address: string };
      const { ServerlessClaimDataService } = await import('./claimData');

      if (!ServerlessClaimDataService.validateAddress(address)) {
        return reply.status(400).send({ error: 'Invalid address format' });
      }

      const claims = ServerlessClaimDataService.getUserClaims(address);
      const stats = ServerlessClaimDataService.getUserStats(address);

      return {
        address,
        claims: claims.map(claim => {
          const tokenInfo = claim.type === 'TOKEN' 
            ? ServerlessClaimDataService.getToken(claim.tokenAddress)
            : undefined;
          return ServerlessClaimDataService.formatClaimResponse(claim, tokenInfo);
        }),
        stats
      };
    } catch (error) {
      console.error('Get history error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get faucet statistics endpoint
  server.get('/faucet/stats', async (request, reply) => {
    try {
      const { ServerlessClaimDataService } = await import('./claimData');
      
      // Get query parameter for specific user address
      const query = request.query as { address?: string };
      const address = query.address;

      if (address) {
        // Return user-specific stats
        if (!ServerlessClaimDataService.validateAddress(address)) {
          return reply.status(400).send({ error: 'Invalid address format' });
        }

        const userStats = ServerlessClaimDataService.getUserStats(address);
        const userClaims = ServerlessClaimDataService.getUserClaims(address);
        
        // Calculate additional stats from user claims
        const ethClaims = userClaims.filter(claim => claim.type === 'ETH');
        const totalETHClaimed = ethClaims.reduce((sum, claim) => sum + parseFloat(claim.amount), 0);
        
        // Group token claims by token address
        const tokenStats: Record<string, {
          claims: number;
          totalClaimed: string;
          lastClaim?: string;
        }> = {};
        
        const tokenClaims = userClaims.filter(claim => claim.type === 'TOKEN');
        for (const claim of tokenClaims) {
          const tokenAddress = claim.tokenAddress;
          const tokenInfo = ServerlessClaimDataService.getToken(tokenAddress);
          const tokenAmount = tokenInfo ? parseFloat(tokenInfo.amount) : parseFloat(claim.amount);
          
          if (!tokenStats[tokenAddress]) {
            tokenStats[tokenAddress] = {
              claims: 0,
              totalClaimed: '0'
            };
          }
          
          tokenStats[tokenAddress]!.claims++;
          const totalClaimedAmount = tokenAmount * tokenStats[tokenAddress]!.claims;
          tokenStats[tokenAddress]!.totalClaimed = totalClaimedAmount.toString();
          
          if (!tokenStats[tokenAddress]!.lastClaim || claim.timestamp > new Date(tokenStats[tokenAddress]!.lastClaim!).getTime()) {
            tokenStats[tokenAddress]!.lastClaim = new Date(claim.timestamp).toISOString();
          }
        }

        return {
          address,
          totalClaims: userStats.totalClaims,
          ethClaims: userStats.ethClaims,
          tokenClaims: userStats.tokenClaims,
          totalETHClaimed: totalETHClaimed.toString(),
          tokenStats,
          lastClaimTime: userStats.lastClaimTime
        };
      } else {
        // Return basic global stats - simplified version since we don't have getAllClaims
        const allTokens = ServerlessClaimDataService.getAllTokens();
        
        return {
          message: 'Global statistics not available in serverless mode',
          availableTokens: allTokens.map(token => ({
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            amount: token.amount
          })),
          note: 'Use ?address=<wallet_address> to get user-specific statistics'
        };
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  return server;
}