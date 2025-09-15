import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ethers } from 'ethers';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { blockchainService } from '@/services/blockchain';
import { ClaimDataService, ClaimHistoryEntry } from '@/services/claimData';

// Request schemas
interface ClaimRequest {
  Body: {
    address: string;
    tokenAddress?: string;
  };
}

interface HistoryParams {
  Params: {
    address: string;
  };
}

const dailyClaims = new Map<string, { count: number; lastClaim: number }>();

// Initialize token registry
const initializeTokenRegistry = () => {
  const tokens = {
    '0x0000000000000000000000000000000000000000': {
      symbol: 'ETH',
      name: 'Ethereum',
      amount: '0.1',
      decimals: 18,
    },
    '0xd82183033422079e6281f350566Da971c13Cb1e7': {
      symbol: 'USDT',
      name: 'Tether USD',
      amount: '100',
      decimals: 6,
    },
    '0xD4547d4d0854D57f0b10A62BfB49261Ba133c46b': {
      symbol: 'USDC',
      name: 'USD Coin',
      amount: '100',
      decimals: 6,
    },
    '0xb748db3348b98E6c2A2dE268ed25b73f78490D25': {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      amount: '100',
      decimals: 18,
    },
    '0x395Eb6F0cAf9Df14a245A30e5fd685A1a13548c7': {
      symbol: 'WETH',
      name: 'Wrapped Ethereum',
      amount: '0.1',
      decimals: 18,
    },
    '0x02632700270A2c8419BCcAcE8196b7738F80c602': {
      symbol: 'LINK',
      name: 'Chainlink',
      amount: '10',
      decimals: 18,
    },
    '0x4c55c5a8D00079d678996431b8CD01B0b3aD2b0E': {
      symbol: 'UNI',
      name: 'Uniswap',
      amount: '5',
      decimals: 18,
    },
  };
  
  Object.entries(tokens).forEach(([address, tokenInfo]) => {
    ClaimDataService.addToken(address.toLowerCase(), tokenInfo);
  });
};

// Initialize the registry
initializeTokenRegistry();

export async function faucetRoutes(server: FastifyInstance): Promise<void> {
  // Get available tokens and amounts
  server.get('/tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tokens = {
        ETH: {
          address: '0x0000000000000000000000000000000000000000',
          symbol: 'ETH',
          name: 'Ethereum',
          amount: '0.1',
          decimals: 18,
        },
        USDT: {
          address: '0xd82183033422079e6281f350566Da971c13Cb1e7',
          symbol: 'USDT',
          name: 'Tether USD',
          amount: '100',
          decimals: 6,
        },
        USDC: {
          address: '0xD4547d4d0854D57f0b10A62BfB49261Ba133c46b',
          symbol: 'USDC',
          name: 'USD Coin',
          amount: '100',
          decimals: 6,
        },
        DAI: {
          address: '0xb748db3348b98E6c2A2dE268ed25b73f78490D25',
          symbol: 'DAI',
          name: 'Dai Stablecoin',
          amount: '100',
          decimals: 18,
        },
        WETH: {
          address: '0x395Eb6F0cAf9Df14a245A30e5fd685A1a13548c7',
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
          amount: '0.1',
          decimals: 18,
        },
        LINK: {
          address: '0x02632700270A2c8419BCcAcE8196b7738F80c602',
          symbol: 'LINK',
          name: 'Chainlink',
          amount: '10',
          decimals: 18,
        },
        UNI: {
          address: '0x4c55c5a8D00079d678996431b8CD01B0b3aD2b0E',
          symbol: 'UNI',
          name: 'Uniswap',
          amount: '10',
          decimals: 18,
        },
      };
      
      return reply.send({
        tokens,
        limits: {
          dailyLimit: config.rateLimit.dailyClaimLimit,
          cooldownPeriod: config.rateLimit.window,
        },
      });
      
    } catch (error) {
      logger.error('Error fetching tokens:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch available tokens',
      });
    }
  });
  
  // Claim tokens from faucet
  server.post<ClaimRequest>('/claim', async (request: FastifyRequest<ClaimRequest>, reply: FastifyReply) => {
    try {
      const { address, tokenAddress } = request.body;
      
      // Validate Ethereum address
      if (!ethers.isAddress(address)) {
        return reply.status(400).send({
          error: 'Invalid Address',
          message: 'Please provide a valid Ethereum address',
        });
      }
      
      // Check daily claim limit
      const userKey = address.toLowerCase();
      const today = new Date().toDateString();
      const claimKey = `${userKey}:${today}`;
      
      const userClaims = dailyClaims.get(claimKey) || { count: 0, lastClaim: 0 };
      
      if (userClaims.count >= config.rateLimit.dailyClaimLimit) {
        return reply.status(429).send({
          error: 'Daily Limit Exceeded',
          message: 'You have reached the daily claim limit',
          retryAfter: 86400, // 24 hours
        });
      }
      
      // Check cooldown period
      const now = Date.now();
      if (now - userClaims.lastClaim < config.rateLimit.window) {
        const remainingTime = config.rateLimit.window - (now - userClaims.lastClaim);
        return reply.status(429).send({
          error: 'Cooldown Active',
          message: 'Please wait before claiming again',
          retryAfter: Math.ceil(remainingTime / 1000),
        });
      }
      
      // No proof of work verification required anymore
      
      // Execute real blockchain transaction
      let txHash: string;
      let tokenSymbol = 'ETH';
      let amount = '0.1';
      
      const targetAddress = tokenAddress || '0x0000000000000000000000000000000000000000';
      const tokenInfo = ClaimDataService.getToken(targetAddress.toLowerCase());
      
      if (tokenInfo) {
        tokenSymbol = tokenInfo.symbol;
        amount = tokenInfo.amount;
      } else {
        return reply.status(400).send({
          error: 'Invalid Token',
          message: 'Token not supported by this faucet',
        });
      }
      
      // Call blockchain service to execute the claim
      try {
        if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
          // Claim ETH
          txHash = await blockchainService.claimEth(address);
        } else {
          // Claim token
          txHash = await blockchainService.claimToken(address, tokenAddress);
        }
      } catch (blockchainError: unknown) {
        const errorMessage = blockchainError instanceof Error ? blockchainError.message : 'Failed to execute blockchain transaction';
        logger.error('Blockchain transaction failed:', blockchainError);
        return reply.status(400).send({
          error: 'Transaction Failed',
          message: errorMessage,
        });
      }
      
      // Update claim records
      dailyClaims.set(claimKey, {
        count: userClaims.count + 1,
        lastClaim: now,
      });
      
      // Add to history using shared service
      ClaimDataService.addClaim(address, {
        timestamp: now,
        tokenAddress: tokenAddress || '0x0000000000000000000000000000000000000000',
        amount,
        txHash,
      });
      
      logger.info(`Claim successful: ${address} received ${amount} ${tokenSymbol}`);
      
      return reply.send({
        success: true,
        txHash,
        token: {
          address: tokenAddress || '0x0000000000000000000000000000000000000000',
          symbol: tokenSymbol,
          amount,
        },
        recipient: address,
        timestamp: now,
      });
      
    } catch (error) {
      logger.error('Error processing claim:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to process claim',
      });
    }
  });
  
  // Get faucet statistics
  server.get<{ Querystring: { address?: string } }>('/stats', async (request: FastifyRequest<{ Querystring: { address?: string } }>, reply: FastifyReply) => {
    try {
      const { address } = request.query;
      
      // If address is provided, return user-specific statistics
      if (address) {
        // Validate Ethereum address
        if (!ethers.isAddress(address)) {
          return reply.status(400).send({
            error: 'Invalid Address',
            message: 'Please provide a valid Ethereum address',
          });
        }
        
        const userStats = ClaimDataService.getUserSpecificStats(address);
        
        return reply.send({
          totalClaims: userStats.totalClaims,
          cooldownHours: 24, // 24-hour cooldown period
          tokenStats: userStats.tokenStats,
          dailyLimit: config.rateLimit.dailyClaimLimit,
          cooldownPeriod: config.rateLimit.window,
          lastUpdated: Date.now(),
          userAddress: address.toLowerCase(),
          isUserSpecific: true,
        });
      }
      
      // Calculate global stats from claim history using shared service
      let totalClaims = 0;
      let totalUsers = 0;
      const tokenStats: Record<string, { 
        claims: number; 
        totalAmount: string; 
        cooldownHours: number; 
        totalClaimed: string; 
        lastClaim?: string;
        symbol?: string;
        name?: string;
        amount?: string;
      }> = {};
      const userTokens = new Map<string, Set<string>>(); // Track which tokens each user has claimed
      
      const claimHistory = ClaimDataService.getClaimHistory();
      for (const [userAddress, history] of claimHistory.entries()) {
        totalUsers++;
        totalClaims += history.length;
        
        for (const claim of history) {
          const tokenAddress = claim.tokenAddress;
          const tokenInfo = ClaimDataService.getToken(tokenAddress.toLowerCase());
          
          if (!tokenStats[tokenAddress]) {
            tokenStats[tokenAddress] = { 
              claims: 0, 
              totalAmount: '0',
              cooldownHours: 24, // 24-hour cooldown for each token
              totalClaimed: '0',
              symbol: tokenInfo?.symbol || 'UNKNOWN',
              name: tokenInfo?.name || 'Unknown Token',
              amount: tokenInfo?.amount || '0'
            };
          }
          tokenStats[tokenAddress]!.claims++;
          
          // Track unique users per token (still needed for internal calculations)
          if (!userTokens.has(userAddress)) {
            userTokens.set(userAddress, new Set());
          }
          userTokens.get(userAddress)!.add(tokenAddress);
          
          // Calculate total claimed amount based on token amount and claims
          const tokenAmount = parseFloat(tokenInfo?.amount || '0');
          const totalClaimedAmount = tokenAmount * tokenStats[tokenAddress]!.claims;
          tokenStats[tokenAddress]!.totalClaimed = totalClaimedAmount.toString();
          
          // Update last claim timestamp
          if (!tokenStats[tokenAddress]!.lastClaim || claim.timestamp > new Date(tokenStats[tokenAddress]!.lastClaim!).getTime()) {
            tokenStats[tokenAddress]!.lastClaim = new Date(claim.timestamp).toISOString();
          }
        }
      }
      
      return reply.send({
        totalClaims,
        cooldownHours: 24, // 24-hour cooldown period for all tokens
        tokenStats,
        dailyLimit: config.rateLimit.dailyClaimLimit,
        cooldownPeriod: config.rateLimit.window,
        lastUpdated: Date.now(),
        isUserSpecific: false,
      });
      
    } catch (error) {
      logger.error('Error fetching stats:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch statistics',
      });
    }
  });
  
  // Get claim history for a specific address
  server.get<HistoryParams>('/history/:address', async (request: FastifyRequest<HistoryParams>, reply: FastifyReply) => {
    try {
      const { address } = request.params;
      
      if (!ethers.isAddress(address)) {
        return reply.status(400).send({
          error: 'Invalid Address',
          message: 'Please provide a valid Ethereum address',
        });
      }
      
      const history = ClaimDataService.getUserClaims(address);
      
      return reply.send({
        address,
        claims: history.sort((a, b) => b.timestamp - a.timestamp), // Most recent first
        totalClaims: history.length,
      });
      
    } catch (error) {
      logger.error('Error fetching claim history:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch claim history',
      });
    }
  });
}