import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ethers } from 'ethers';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { blockchainService } from '@/services/blockchain';
import { ClaimDataService } from '@/services/claimData';

// Request schemas
interface AddTokenRequest {
  Body: {
    address: string;
    symbol: string;
    name: string;
    amount: string;
    decimals?: number;
  };
}

interface RemoveTokenParams {
  Params: {
    address: string;
  };
}

interface PauseRequest {
  Body: {
    reason?: string;
  };
}

interface UpdateTokenRequest {
  Params: {
    id: string;
  };
  Body: {
    name?: string;
    symbol?: string;
    amount?: string;
    decimals?: number;
    cooldownPeriod?: number;
  };
}

interface UpdateTokenStatusRequest {
  Params: {
    id: string;
  };
  Body: {
    isActive: boolean;
  };
}

interface BulkDeleteTokensRequest {
  Body: {
    addresses: string[];
  };
}

interface UpdateUserStatusRequest {
  Params: {
    id: string;
  };
  Body: {
    status: string;
  };
}

interface UpdateUserAdminRequest {
  Params: {
    id: string;
  };
  Body: {
    isAdmin: boolean;
  };
}

interface ClaimsQueryParams {
  Querystring: {
    range?: 'today' | 'week' | 'month' | 'all';
  };
}

interface ClaimHistoryEntry {
  timestamp: number;
  tokenAddress: string;
  amount: string;
  txHash: string;
}

interface Claim {
  id: string;
  userAddress: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  amount: string;
  transactionHash: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}



// Mock admin state
const adminState = {
  isPaused: false,
  pauseReason: '',
  pausedAt: 0,
  pausedBy: '',
};

const tokenRegistry = new Map<string, {
  symbol: string;
  name: string;
  amount: string;
  decimals: number;
  addedAt: number;
  addedBy: string;
}>();

// Claims data is now managed by ClaimDataService

// Helper function to get date range filter
const getDateRangeFilter = (range: string = 'all'): number => {
  const now = Date.now();
  switch (range) {
    case 'today':
      return now - (24 * 60 * 60 * 1000);
    case 'week':
      return now - (7 * 24 * 60 * 60 * 1000);
    case 'month':
      return now - (30 * 24 * 60 * 60 * 1000);
    default:
      return 0;
  }
};

export async function adminRoutes(server: FastifyInstance): Promise<void> {
  // Middleware to ensure admin access
  server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !request.user.isAdmin) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin privileges required',
      });
    }
  });
  
  // Get admin statistics and overview
  server.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Mock statistics
      const stats = {
        faucet: {
          status: adminState.isPaused ? 'paused' : 'active',
          pauseReason: adminState.pauseReason,
          pausedAt: adminState.pausedAt,
          pausedBy: adminState.pausedBy,
        },
        tokens: {
          total: tokenRegistry.size + 1, // +1 for ETH
          registered: Array.from(tokenRegistry.entries()).map(([address, data]) => ({
            address,
            ...data,
          })),
        },
        claims: {
          today: 0, // Mock data
          thisWeek: 0,
          thisMonth: 0,
          total: 0,
        },
        users: {
          total: 0, // Mock data
          active: 0,
          banned: 0,
        },
        system: {
          uptime: process.uptime(),
          version: config.apiVersion,
          nodeEnv: config.nodeEnv,
        },
      };
      
      return reply.send(stats);
      
    } catch (error) {
      logger.error('Error fetching admin stats:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch statistics',
      });
    }
  });
  
  // Get all tokens
  server.get('/tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Convert tokenRegistry to array format expected by frontend
      const tokens = Array.from(tokenRegistry.entries()).map(([address, data]) => ({
        id: address, // Use address as ID
        address,
        symbol: data.symbol,
        name: data.name,
        amount: data.amount,
        decimals: data.decimals,
        isActive: true, // Default to active for now
        cooldownPeriod: 24, // Default cooldown
        addedAt: data.addedAt,
        addedBy: data.addedBy,
      }));
      
      // Add ETH as default token if not already present
      const ethExists = tokens.some(token => token.address === '0x0000000000000000000000000000000000000000');
      if (!ethExists) {
        tokens.unshift({
          id: '0x0000000000000000000000000000000000000000',
          address: '0x0000000000000000000000000000000000000000',
          symbol: 'ETH',
          name: 'Ethereum',
          amount: '0.1',
          decimals: 18,
          isActive: true,
          cooldownPeriod: 24,
          addedAt: Date.now(),
          addedBy: 'system',
        });
      }
      
      return reply.send({
        success: true,
        tokens,
        total: tokens.length,
      });
      
    } catch (error) {
      logger.error('Error fetching tokens:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch tokens',
      });
    }
  });
  
  // Add new token to faucet
  server.post<AddTokenRequest>('/tokens/add', async (request: FastifyRequest<AddTokenRequest>, reply: FastifyReply) => {
    try {
      const { address, symbol, name, amount, decimals = 18 } = request.body;
      
      // Validate inputs
      if (!ethers.isAddress(address)) {
        return reply.status(400).send({
          error: 'Invalid Address',
          message: 'Please provide a valid token contract address',
        });
      }
      
      if (!symbol || !name || !amount) {
        return reply.status(400).send({
          error: 'Missing Data',
          message: 'Symbol, name, and amount are required',
        });
      }
      
      // Check if token already exists
      if (tokenRegistry.has(address.toLowerCase())) {
        return reply.status(409).send({
          error: 'Token Exists',
          message: 'Token is already registered in the faucet',
        });
      }
      
      // Validate amount is a valid number
      if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return reply.status(400).send({
          error: 'Invalid Amount',
          message: 'Amount must be a positive number',
        });
      }
      
      // Add token to registry
      tokenRegistry.set(address.toLowerCase(), {
        symbol: symbol.toUpperCase(),
        name,
        amount,
        decimals,
        addedAt: Date.now(),
        addedBy: request.user!.address,
      });
      
      logger.info(`Token added by admin ${request.user!.address}: ${symbol} (${address})`);
      
      return reply.send({
        success: true,
        token: {
          address,
          symbol: symbol.toUpperCase(),
          name,
          amount,
          decimals,
        },
        addedBy: request.user!.address,
        addedAt: Date.now(),
      });
      
    } catch (error) {
      logger.error('Error adding token:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to add token',
      });
    }
  });
  
  // Update token
  server.put<UpdateTokenRequest>('/tokens/:id', async (request: FastifyRequest<UpdateTokenRequest>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { name, symbol, amount, decimals, cooldownPeriod } = request.body;
      
      const tokenData = tokenRegistry.get(id.toLowerCase());
      if (!tokenData) {
        return reply.status(404).send({
          error: 'Token Not Found',
          message: 'Token is not registered in the faucet',
        });
      }
      
      // Update token data
      tokenRegistry.set(id.toLowerCase(), {
        ...tokenData,
        name: name || tokenData.name,
        symbol: symbol || tokenData.symbol,
        amount: amount || tokenData.amount,
        decimals: decimals || tokenData.decimals,
      });
      
      logger.info(`Token updated by admin ${request.user!.address}: ${symbol} (${id})`);
      
      return reply.send({
        success: true,
        token: {
          id,
          address: id,
          name,
          symbol,
          amount,
          decimals,
          cooldownPeriod,
        },
      });
      
    } catch (error) {
      logger.error('Error updating token:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update token',
      });
    }
  });
  
  // Update token status
  server.patch<UpdateTokenStatusRequest>('/tokens/:id/status', async (request: FastifyRequest<UpdateTokenStatusRequest>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { isActive } = request.body;
      
      const tokenData = tokenRegistry.get(id.toLowerCase());
      if (!tokenData) {
        return reply.status(404).send({
          error: 'Token Not Found',
          message: 'Token is not registered in the faucet',
        });
      }
      
      logger.info(`Token status updated by admin ${request.user!.address}: ${tokenData.symbol} (${id}) - ${isActive ? 'activated' : 'deactivated'}`);
      
      return reply.send({
        success: true,
        token: {
          id,
          address: id,
          isActive,
        },
      });
      
    } catch (error) {
      logger.error('Error updating token status:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update token status',
      });
    }
  });
  
  // Remove token from faucet
  server.delete<RemoveTokenParams>('/tokens/:address', async (request: FastifyRequest<RemoveTokenParams>, reply: FastifyReply) => {
    try {
      const { address } = request.params;
      
      if (!ethers.isAddress(address)) {
        return reply.status(400).send({
          error: 'Invalid Address',
          message: 'Please provide a valid token contract address',
        });
      }
      
      const tokenKey = address.toLowerCase();
      const tokenData = tokenRegistry.get(tokenKey);
      
      if (!tokenData) {
        return reply.status(404).send({
          error: 'Token Not Found',
          message: 'Token is not registered in the faucet',
        });
      }
      
      // Remove token from registry
      tokenRegistry.delete(tokenKey);
      
      logger.info(`Token removed by admin ${request.user!.address}: ${tokenData.symbol} (${address})`);
      
      return reply.send({
        success: true,
        removedToken: {
          address,
          ...tokenData,
        },
        removedBy: request.user!.address,
        removedAt: Date.now(),
      });
      
    } catch (error) {
      logger.error('Error removing token:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to remove token',
      });
    }
  });
  
  // Bulk delete tokens
  server.delete<BulkDeleteTokensRequest>('/tokens', async (request: FastifyRequest<BulkDeleteTokensRequest>, reply: FastifyReply) => {
    try {
      const { addresses } = request.body;
      
      if (!addresses || !Array.isArray(addresses)) {
        return reply.status(400).send({
          error: 'Invalid Request',
          message: 'Please provide an array of token addresses',
        });
      }
      
      const removedTokens: Array<{ address: string; symbol: string; name: string; amount: string; decimals: number; addedAt: number; addedBy: string }> = [];
      const errors: Array<{ address: string; error: string }> = [];
      
      for (const address of addresses) {
        if (!ethers.isAddress(address)) {
          errors.push({ address, error: 'Invalid address format' });
          continue;
        }
        
        const tokenKey = address.toLowerCase();
        const tokenData = tokenRegistry.get(tokenKey);
        
        if (!tokenData) {
          errors.push({ address, error: 'Token not found' });
          continue;
        }
        
        tokenRegistry.delete(tokenKey);
        removedTokens.push({ address, ...tokenData });
      }
      
      logger.info(`Bulk token removal by admin ${request.user!.address}: ${removedTokens.length} tokens removed`);
      
      return reply.send({
        success: true,
        removedTokens,
        errors,
        removedBy: request.user!.address,
        removedAt: Date.now(),
      });
      
    } catch (error) {
      logger.error('Error bulk removing tokens:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to bulk remove tokens',
      });
    }
  });
  
  // Pause faucet operations
  server.post<PauseRequest>('/pause', async (request: FastifyRequest<PauseRequest>, reply: FastifyReply) => {
    try {
      const { reason = 'Maintenance' } = request.body;
      
      if (adminState.isPaused) {
        return reply.status(400).send({
          error: 'Already Paused',
          message: 'Faucet is already paused',
        });
      }
      
      // Pause the faucet
      adminState.isPaused = true;
      adminState.pauseReason = reason;
      adminState.pausedAt = Date.now();
      adminState.pausedBy = request.user!.address;
      
      logger.warn(`Faucet paused by admin ${request.user!.address}: ${reason}`);
      
      return reply.send({
        success: true,
        status: 'paused',
        reason,
        pausedBy: request.user!.address,
        pausedAt: adminState.pausedAt,
      });
      
    } catch (error) {
      logger.error('Error pausing faucet:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to pause faucet',
      });
    }
  });
  
  // Resume faucet operations
  server.post('/unpause', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!adminState.isPaused) {
        return reply.status(400).send({
          error: 'Not Paused',
          message: 'Faucet is not currently paused',
        });
      }
      
      // Resume the faucet
      const pauseDuration = Date.now() - adminState.pausedAt;
      adminState.isPaused = false;
      adminState.pauseReason = '';
      adminState.pausedAt = 0;
      adminState.pausedBy = '';
      
      logger.info(`Faucet resumed by admin ${request.user!.address} (paused for ${pauseDuration}ms)`);
      
      return reply.send({
        success: true,
        status: 'active',
        resumedBy: request.user!.address,
        resumedAt: Date.now(),
        pauseDuration,
      });
      
    } catch (error) {
      logger.error('Error resuming faucet:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to resume faucet',
      });
    }
  });
  
  // Get system configuration
  server.get('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({
        config: {
          // Rate limiting
          rateLimitEnabled: true,
          rateLimitWindowMs: config.rateLimit.window,
          rateLimitMaxRequests: config.rateLimit.ipMax,
          
          // Cooldown settings
          defaultCooldownHours: 24,
          minCooldownHours: 1,
          maxCooldownHours: 168, // 7 days
          
          // Security settings
          requireWalletConnection: true,
          enableCaptcha: false,
          maxClaimsPerUser: config.rateLimit.dailyClaimLimit,
          
          // System settings
          maintenanceMode: adminState.isPaused,
          maintenanceMessage: adminState.pauseReason || 'System maintenance in progress',
          enableLogging: true,
          logLevel: 'info',
          
          // Blockchain settings
           networkName: 'Sepolia Testnet',
           rpcUrl: config.blockchain.sepoliaRpcUrl || 'https://sepolia.infura.io/v3/...',
           chainId: 11155111,
           blockConfirmations: 1,
           gasLimit: '21000',
           gasPriceMultiplier: 1.1,
          

        }
      });
      
    } catch (error) {
      logger.error('Error fetching config:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch configuration',
      });
    }
  });
  
  // Update system configuration
  server.put('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const configUpdate = request.body as any;
      
      // In a real implementation, you would validate and save the config
      // For now, we'll just acknowledge the update
      logger.info(`System configuration updated by admin ${request.user!.address}`);
      
      return reply.send({
        success: true,
        message: 'Configuration updated successfully',
        updatedBy: request.user!.address,
        updatedAt: new Date().toISOString(),
      });
      
    } catch (error) {
      logger.error('Error updating config:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update configuration',
      });
    }
  });
  
  // Test connection endpoint
  server.post('/test-connection', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type } = request.body as { type: 'rpc' };
      
      if (type === 'rpc') {
          // Test RPC connection
          try {
            // Test blockchain service by checking if we can get ETH amount from contract
            const ethAmount = await blockchainService.getEthAmount();
            
            return reply.send({
              success: true,
              message: 'RPC connection successful',
              ethAmount,
              timestamp: new Date().toISOString(),
            });
          } catch (rpcError) {
            return reply.status(500).send({
              error: 'RPC Connection Failed',
              message: rpcError instanceof Error ? rpcError.message : 'Unknown RPC error',
            });
          }
        }
      
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid connection type',
      });
      
    } catch (error) {
      logger.error('Error testing connection:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to test connection',
      });
    }
  });
  
  // Mock data for users and notifications
  const mockUsers = [
    {
      id: '1',
      address: config.faucet.adminAddress,
      isAdmin: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      claimsCount: 0,
      status: 'active',
    },
  ];
  

  
  // User management endpoints
  server.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({
        success: true,
        users: mockUsers,
        total: mockUsers.length,
      });
    } catch (error) {
      logger.error('Error fetching users:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch users',
      });
    }
  });
  
  server.patch<UpdateUserStatusRequest>('/users/:id/status', async (request: FastifyRequest<UpdateUserStatusRequest>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { status } = request.body;
      
      logger.info(`User status updated by admin ${request.user!.address}: ${id} - ${status}`);
      
      return reply.send({
        success: true,
        user: { id, status },
      });
    } catch (error) {
      logger.error('Error updating user status:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update user status',
      });
    }
  });
  
  server.patch<UpdateUserAdminRequest>('/users/:id/admin', async (request: FastifyRequest<UpdateUserAdminRequest>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { isAdmin } = request.body;
      
      logger.info(`User admin status updated by admin ${request.user!.address}: ${id} - ${isAdmin ? 'granted' : 'revoked'}`);
      
      return reply.send({
        success: true,
        user: { id, isAdmin },
      });
    } catch (error) {
      logger.error('Error updating user admin status:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update user admin status',
      });
    }
  });
  
  // Contract balance endpoint
  server.get('/contract-balance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Initialize provider
      const provider = new ethers.JsonRpcProvider(config.blockchain.sepoliaRpcUrl);
      
      // Get contract address from config
      const contractAddress = config.blockchain.faucetContractAddress;
      
      // Fetch ETH balance
      const ethBalance = await provider.getBalance(contractAddress);
      
      // Fetch supported tokens from faucet contract
      const faucetContract = new ethers.Contract(
        contractAddress,
        [
          'function getSupportedTokens() view returns (address[])'
        ],
        provider
      );
      
      if (!faucetContract['getSupportedTokens']) {
        throw new Error('Faucet contract does not have getSupportedTokens function');
      }
      const supportedTokenAddresses = await faucetContract['getSupportedTokens']();
      
      // Fetch token balances for supported tokens with retry logic
      const tokenBalances = [];
      
      // Helper function to fetch token data with retry
      const fetchTokenWithRetry = async (tokenAddress: string, maxRetries = 3): Promise<{
        symbol: string;
        name: string;
        balance: string;
        decimals: number;
        address: string;
        usdValue?: number;
      } | null> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            // Create ERC20 contract instance
            const tokenContract = new ethers.Contract(
              tokenAddress,
              [
                'function balanceOf(address) view returns (uint256)',
                'function decimals() view returns (uint8)',
                'function symbol() view returns (string)',
                'function name() view returns (string)'
              ],
              provider
            );
            
            if (!tokenContract['balanceOf']) {
              throw new Error(`Token contract at ${tokenAddress} does not have balanceOf function`);
            }
            
            if (!tokenContract['decimals'] || !tokenContract['symbol'] || !tokenContract['name']) {
              throw new Error(`Token contract at ${tokenAddress} is missing required functions`);
            }
            
            // Add timeout to prevent hanging requests
            const timeout = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout')), 10000)
            );
            
            const tokenDataPromise = Promise.all([
              tokenContract['balanceOf'](contractAddress),
              tokenContract['decimals'](),
              tokenContract['symbol'](),
              tokenContract['name']()
            ]);
            
            const [balance, decimals, symbol, name] = await Promise.race([
              tokenDataPromise,
              timeout
            ]) as [bigint, number, string, string];
            
            return {
              symbol: symbol,
              name: name,
              balance: balance.toString(),
              decimals: Number(decimals),
              address: tokenAddress
              // Note: USD value would require price API integration
            };
          } catch (tokenError) {
            logger.warn(`Attempt ${attempt}/${maxRetries} failed for token ${tokenAddress}:`, {
              error: tokenError instanceof Error ? tokenError.message : String(tokenError),
              address: tokenAddress
            });
            
            if (attempt === maxRetries) {
              throw tokenError;
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
        
        // If all retries failed, return null
        return null;
      };
      
      // Process tokens with limited concurrency to avoid overwhelming the RPC
      const BATCH_SIZE = 3;
      for (let i = 0; i < supportedTokenAddresses.length; i += BATCH_SIZE) {
        const batch = supportedTokenAddresses.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (tokenAddress: string) => {
          try {
            const tokenData = await fetchTokenWithRetry(tokenAddress);
            return tokenData;
          } catch (tokenError) {
            logger.error(`Failed to fetch token data for ${tokenAddress} after all retries:`, {
              error: tokenError instanceof Error ? tokenError.message : String(tokenError),
              stack: tokenError instanceof Error ? tokenError.stack : undefined,
              address: tokenAddress
            });
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        tokenBalances.push(...batchResults.filter(result => result !== null));
      }
      
      const response = {
        eth: {
          balance: ethBalance.toString(),
          // Note: USD value would require price API integration
          usdValue: undefined
        },
        tokens: tokenBalances,
        lastUpdated: new Date().toISOString()
      };
      
      return reply.send(response);
      
    } catch (error) {
      logger.error('Error fetching contract balance:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch contract balance',
      });
    }
  });

  // Get claims data with filtering
  server.get<ClaimsQueryParams>('/claims', async (request: FastifyRequest<ClaimsQueryParams>, reply: FastifyReply) => {
    try {
      const { range = 'all' } = request.query;
      const dateFilter = getDateRangeFilter(range);
      
      const allClaims: Claim[] = [];
      
      // Convert claim history to claims format
      const claimHistory = ClaimDataService.getClaimHistory();
      for (const [userAddress, userClaims] of claimHistory.entries()) {
        for (const claim of userClaims) {
          if (claim.timestamp >= dateFilter) {
            // Get token info from registry or use defaults
            const tokenInfo = Array.from(tokenRegistry.values()).find(t => 
              t.symbol === 'ETH' || claim.tokenAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000'
            );
            
            allClaims.push({
              id: `${userAddress}-${claim.timestamp}`,
              userAddress,
              tokenAddress: claim.tokenAddress,
              tokenName: tokenInfo?.name || (claim.tokenAddress === '0x0000000000000000000000000000000000000000' ? 'Ethereum' : 'Unknown Token'),
              tokenSymbol: tokenInfo?.symbol || (claim.tokenAddress === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'UNK'),
              amount: claim.amount,
              transactionHash: claim.txHash,
              status: 'completed' as const,
              createdAt: new Date(claim.timestamp).toISOString(),
              completedAt: new Date(claim.timestamp).toISOString()
            });
          }
        }
      }
      
      // Sort by timestamp (newest first)
      allClaims.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      return reply.send({
        claims: allClaims,
        totalClaims: allClaims.length,
        range
      });
      
    } catch (error) {
      logger.error('Error fetching claims:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch claims data',
      });
    }
  });

  // Get claims statistics
  server.get<ClaimsQueryParams>('/claims/stats', async (request: FastifyRequest<ClaimsQueryParams>, reply: FastifyReply) => {
    try {
      const { range = 'all' } = request.query;
      const dateFilter = getDateRangeFilter(range);
      
      let totalClaims = 0;
      let uniqueUsers = new Set<string>();
      let totalValueDistributed = 0;
      const tokenStats = new Map<string, { claims: number; amount: number; users: Set<string> }>();
      
      // Calculate statistics from claim history
      const claimHistory = ClaimDataService.getClaimHistory();
      for (const [userAddress, userClaims] of claimHistory.entries()) {
        for (const claim of userClaims) {
          if (claim.timestamp >= dateFilter) {
            totalClaims++;
            uniqueUsers.add(userAddress);
            
            const amount = parseFloat(claim.amount) || 0;
            totalValueDistributed += amount;
            
            // Track token-specific stats
            const tokenKey = claim.tokenAddress;
            if (!tokenStats.has(tokenKey)) {
              tokenStats.set(tokenKey, { claims: 0, amount: 0, users: new Set() });
            }
            const tokenStat = tokenStats.get(tokenKey)!;
            tokenStat.claims++;
            tokenStat.amount += amount;
            tokenStat.users.add(userAddress);
          }
        }
      }
      
      // Convert token stats to array format
      const tokenStatsArray = Array.from(tokenStats.entries()).map(([tokenAddress, stats]) => {
        const tokenInfo = Array.from(tokenRegistry.values()).find(t => 
          t.symbol === 'ETH' || tokenAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000'
        );
        
        return {
          tokenAddress,
          tokenName: tokenInfo?.name || (tokenAddress === '0x0000000000000000000000000000000000000000' ? 'Ethereum' : 'Unknown Token'),
          tokenSymbol: tokenInfo?.symbol || (tokenAddress === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'UNK'),
          totalClaims: stats.claims,
          totalAmount: stats.amount.toString(),
          uniqueUsers: stats.users.size
        };
      });
      
      const stats = {
        totalClaims,
        successfulClaims: totalClaims, // All claims in history are successful
        failedClaims: 0,
        pendingClaims: 0,
        totalValueDistributed: totalValueDistributed.toString(),
        uniqueUsers: uniqueUsers.size,
        averageClaimAmount: totalClaims > 0 ? (totalValueDistributed / totalClaims).toString() : '0',
        claimsToday: 0, // Would need separate calculation
        claimsThisWeek: 0, // Would need separate calculation
        claimsThisMonth: 0 // Would need separate calculation
      };
      
      return reply.send({
        stats,
        tokenStats: tokenStatsArray,
        range
      });
      
    } catch (error) {
      logger.error('Error fetching claims stats:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch claims statistics',
      });
    }
  });

  // Export claims data as CSV
  server.get<ClaimsQueryParams>('/claims/export', async (request: FastifyRequest<ClaimsQueryParams>, reply: FastifyReply) => {
    try {
      const { range = 'all' } = request.query;
      const dateFilter = getDateRangeFilter(range);
      
      const allClaims: Claim[] = [];
      
      // Convert claim history to claims format
      const claimHistory = ClaimDataService.getClaimHistory();
      for (const [userAddress, userClaims] of claimHistory.entries()) {
        for (const claim of userClaims) {
          if (claim.timestamp >= dateFilter) {
            const tokenInfo = Array.from(tokenRegistry.values()).find(t => 
              t.symbol === 'ETH' || claim.tokenAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000'
            );
            
            allClaims.push({
              id: `${userAddress}-${claim.timestamp}`,
              userAddress,
              tokenAddress: claim.tokenAddress,
              tokenName: tokenInfo?.name || (claim.tokenAddress === '0x0000000000000000000000000000000000000000' ? 'Ethereum' : 'Unknown Token'),
              tokenSymbol: tokenInfo?.symbol || (claim.tokenAddress === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'UNK'),
              amount: claim.amount,
              transactionHash: claim.txHash,
              status: 'completed' as const,
              createdAt: new Date(claim.timestamp).toISOString(),
              completedAt: new Date(claim.timestamp).toISOString()
            });
          }
        }
      }
      
      // Sort by timestamp (newest first)
      allClaims.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Generate CSV content
      const csvHeaders = 'User Address,Token Name,Token Symbol,Amount,Transaction Hash,Status,Created At,Completed At\n';
      const csvRows = allClaims.map(claim => 
        `"${claim.userAddress}","${claim.tokenName}","${claim.tokenSymbol}","${claim.amount}","${claim.transactionHash}","${claim.status}","${claim.createdAt}","${claim.completedAt || ''}"`
      ).join('\n');
      
      const csvContent = csvHeaders + csvRows;
      
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="claims-${range}-${new Date().toISOString().split('T')[0]}.csv"`);
      
      return reply.send(csvContent);
      
    } catch (error) {
      logger.error('Error exporting claims:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to export claims data',
      });
    }
  });


}