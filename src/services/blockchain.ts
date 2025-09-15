import { ethers } from 'ethers';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

// Faucet contract ABI (simplified for the main functions)
const FAUCET_ABI = [
  'function claimEth() external',
  'function claimEthFor(address recipient) external',
  'function claimToken(address token) external',
  'function claimTokenFor(address token, address recipient) external',
  'function ethAmount() external view returns (uint256)',
  'function supportedTokens(address) external view returns (uint256 amount, uint256 cooldown, bool active)',
  'function lastEthClaimTime(address) external view returns (uint256)',
  'function lastClaimTime(address, address) external view returns (uint256)',
  'function blacklisted(address) external view returns (bool)',
  'event EthClaimed(address indexed user, uint256 amount, uint256 timestamp)',
  'event TokenClaimed(address indexed user, address indexed token, uint256 amount, uint256 timestamp)'
];

export class BlockchainService {
  private provider!: ethers.JsonRpcProvider;
  private wallet!: ethers.Wallet;
  private faucetContract!: ethers.Contract;

  constructor() {
    this.initializeService();
  }

  private initializeService() {
    try {
      // Initialize provider with Sepolia network
      this.provider = new ethers.JsonRpcProvider(config.blockchain.sepoliaRpcUrl, 'sepolia');
      
      // Set polling interval
      this.provider.pollingInterval = 4000;
      
      // Initialize wallet
      this.wallet = new ethers.Wallet(config.blockchain.privateKey, this.provider);
      
      // Initialize contract
      this.faucetContract = new ethers.Contract(
        config.blockchain.faucetContractAddress,
        FAUCET_ABI,
        this.wallet
      );
      
      logger.info('✅ Blockchain service initialized');
      logger.info(`📍 Faucet contract: ${config.blockchain.faucetContractAddress}`);
      logger.info(`🔗 RPC URL: ${config.blockchain.sepoliaRpcUrl}`);
    } catch (error: unknown) {
      logger.error('❌ Failed to initialize blockchain service:', error);
      throw error;
    }
  }

  /**
   * Solve proof of work challenge for a user address
   */
  // Removed proof of work solving functions - no longer required

  /**
   * Claim ETH from the faucet
   */
  async claimEth(recipientAddress: string): Promise<string> {
    try {
      logger.info(`🔄 Claiming ETH for ${recipientAddress}`);
      
      // Check if recipient is blacklisted
      if (!this.faucetContract) {
        throw new Error('Faucet contract not initialized');
      }
      const isBlacklisted = await this.faucetContract!['blacklisted']!(recipientAddress) as boolean;
      if (isBlacklisted) {
        throw new Error('Address is blacklisted');
      }
      
      // Check cooldown for the recipient address
      const lastClaimTime = await this.faucetContract!['lastEthClaimTime']!(recipientAddress) as bigint;
      const now = Math.floor(Date.now() / 1000);
      const cooldownPeriod = 24 * 60 * 60; // 24 hours in seconds
      
      if (lastClaimTime.toString() !== '0' && (now - Number(lastClaimTime)) < cooldownPeriod) {
        const remainingTime = cooldownPeriod - (now - Number(lastClaimTime));
        throw new Error(`Cooldown active. Please wait ${Math.ceil(remainingTime / 3600)} hours`);
      }
      
      // No proof of work required anymore
      
      // Execute the transaction with better error handling
      try {
        // First estimate gas
        if (!this.faucetContract['claimEthFor']) {
          throw new Error('claimEthFor function not available');
        }
        const gasEstimate = await this.faucetContract['claimEthFor'].estimateGas(recipientAddress);
        logger.info(`⛽ Estimated gas: ${gasEstimate.toString()}`);
        
        // Execute transaction - this will send ETH directly to the recipient
        if (!this.faucetContract['claimEthFor']) {
          throw new Error('claimEthFor function not available');
        }
        const tx = await this.faucetContract['claimEthFor'](recipientAddress, {
          gasLimit: gasEstimate * 120n / 100n, // Add 20% buffer
          gasPrice: ethers.parseUnits('20', 'gwei')
        }) as ethers.ContractTransactionResponse;
        
        logger.info(`📤 Transaction sent: ${tx.hash}`);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        if (!receipt) {
          throw new Error('Transaction failed to confirm');
        }
        logger.info(`✅ ETH claim confirmed: ${receipt.hash}`);
        
        return receipt.hash;
      } catch (gasError: unknown) {
        const errorMessage = gasError instanceof Error ? gasError.message : 'Unknown gas error';
        logger.error(`⛽ Gas estimation failed: ${errorMessage}`);
        if (gasError && typeof gasError === 'object' && 'reason' in gasError) {
          logger.error(`📋 Revert reason: ${gasError.reason}`);
        }
        if (gasError && typeof gasError === 'object' && 'data' in gasError) {
          logger.error(`📊 Error data: ${gasError.data}`);
        }
        throw new Error(`Gas estimation failed: ${errorMessage}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ ETH claim failed:', error);
      throw new Error(`ETH claim failed: ${errorMessage}`);
    }
  }

  /**
   * Claim tokens from the faucet
   */
  async claimToken(recipientAddress: string, tokenAddress: string): Promise<string> {
    try {
      logger.info(`🔄 Claiming token ${tokenAddress} for ${recipientAddress}`);
      
      // Check if user is blacklisted
      if (!this.faucetContract) {
        throw new Error('Faucet contract not initialized');
      }
      const isBlacklisted = await this.faucetContract!['blacklisted']!(recipientAddress) as boolean;
      if (isBlacklisted) {
        throw new Error('Address is blacklisted');
      }
      
      // Check if token is supported
      const tokenInfo = await this.faucetContract!['supportedTokens']!(tokenAddress) as [bigint, bigint, boolean];
      if (!tokenInfo[2]) {
        throw new Error('Token not supported');
      }
      
      // Check cooldown
      const lastClaimTime = await this.faucetContract!['lastClaimTime']!(recipientAddress, tokenAddress) as bigint;
      const now = Math.floor(Date.now() / 1000);
      const cooldownPeriod = Number(tokenInfo[1]);
      
      if (lastClaimTime.toString() !== '0' && (now - Number(lastClaimTime)) < cooldownPeriod) {
        const remainingTime = cooldownPeriod - (now - Number(lastClaimTime));
        throw new Error(`Cooldown active. Please wait ${Math.ceil(remainingTime / 3600)} hours`);
      }
      
      // No proof of work required anymore
      
      // Execute transaction
      if (!this.faucetContract['claimTokenFor']) {
        throw new Error('claimTokenFor function not available');
      }
      const tx = await this.faucetContract['claimTokenFor'](tokenAddress, recipientAddress) as ethers.ContractTransactionResponse;
      logger.info(`📤 Transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error('Transaction failed to confirm');
      }
      logger.info(`✅ Token claim confirmed: ${receipt.hash}`);
      
      return receipt.hash;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Token claim failed:', error);
      throw new Error(`Token claim failed: ${errorMessage}`);
    }
  }

  /**
   * Get ETH amount from contract
   */
  async getEthAmount(): Promise<string> {
    try {
      if (!this.faucetContract) {
        throw new Error('Faucet contract not initialized');
      }
      const amount = await this.faucetContract!['ethAmount']!() as bigint;
      return ethers.formatEther(amount);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to get ETH amount:', error);
      throw new Error(`Failed to get ETH amount: ${errorMessage}`);
    }
  }

  /**
   * Get token info from contract
   */
  async getTokenInfo(tokenAddress: string): Promise<{ amount: string; cooldown: number; active: boolean }> {
    try {
      if (!this.faucetContract) {
        throw new Error('Faucet contract not initialized');
      }
      const tokenInfo = await this.faucetContract!['supportedTokens']!(tokenAddress) as [bigint, bigint, boolean];
      return {
        amount: tokenInfo[0].toString(),
        cooldown: Number(tokenInfo[1]),
        active: tokenInfo[2]
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to get token info:', error);
      throw new Error(`Failed to get token info: ${errorMessage}`);
    }
  }

  /**
   * Check if address can claim ETH
   */
  async canClaimEth(address: string): Promise<{ canClaim: boolean; remainingTime?: number }> {
    try {
      if (!this.faucetContract) {
        throw new Error('Faucet contract not initialized');
      }
      const isBlacklisted = await this.faucetContract!['blacklisted']!(address) as boolean;
      if (isBlacklisted) {
        return { canClaim: false };
      }
      
      const lastClaimTime = await this.faucetContract!['lastEthClaimTime']!(address) as bigint;
      const now = Math.floor(Date.now() / 1000);
      const cooldownPeriod = 24 * 60 * 60; // 24 hours
      
      if (lastClaimTime.toString() === '0') {
        return { canClaim: true };
      }
      
      const timeSinceLastClaim = now - Number(lastClaimTime);
      if (timeSinceLastClaim >= cooldownPeriod) {
        return { canClaim: true };
      }
      
      return {
        canClaim: false,
        remainingTime: cooldownPeriod - timeSinceLastClaim
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to check ETH claim eligibility:', error);
      throw new Error(`Failed to check ETH claim eligibility: ${errorMessage}`);
    }
  }

  /**
   * Check if address can claim token
   */
  async canClaimToken(address: string, tokenAddress: string): Promise<{ canClaim: boolean; remainingTime?: number }> {
    try {
      if (!this.faucetContract) {
        throw new Error('Faucet contract not initialized');
      }
      const isBlacklisted = await this.faucetContract!['blacklisted']!(address) as boolean;
      if (isBlacklisted) {
        return { canClaim: false };
      }
      
      const tokenInfo = await this.faucetContract!['supportedTokens']!(tokenAddress) as [bigint, bigint, boolean];
      if (!tokenInfo[2]) {
        return { canClaim: false };
      }
      
      const lastClaimTime = await this.faucetContract!['lastClaimTime']!(address, tokenAddress) as bigint;
      const now = Math.floor(Date.now() / 1000);
      const cooldownPeriod = Number(tokenInfo[1]);
      
      if (lastClaimTime.toString() === '0') {
        return { canClaim: true };
      }
      
      const timeSinceLastClaim = now - Number(lastClaimTime);
      if (timeSinceLastClaim >= cooldownPeriod) {
        return { canClaim: true };
      }
      
      return {
        canClaim: false,
        remainingTime: cooldownPeriod - timeSinceLastClaim
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to check token claim eligibility:', error);
      throw new Error(`Failed to check token claim eligibility: ${errorMessage}`);
    }
  }
}

// Export singleton instance
export const blockchainService = new BlockchainService();