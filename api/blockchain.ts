import { ethers } from 'ethers';

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

export class ServerlessBlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private faucetContract: ethers.Contract;

  constructor() {
    // Initialize provider with Sepolia network
    const rpcUrl = process.env['SEPOLIA_RPC_URL'] || 'https://sepolia.infura.io/v3/your-key';
    this.provider = new ethers.JsonRpcProvider(rpcUrl, 'sepolia');
    
    // Initialize wallet
    const privateKey = process.env['PRIVATE_KEY'] || '';
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    
    // Initialize contract
    const contractAddress = process.env['FAUCET_CONTRACT_ADDRESS'] || '';
    this.faucetContract = new ethers.Contract(contractAddress, FAUCET_ABI, this.wallet);
  }

  async claimEth(recipientAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate address
      if (!ethers.isAddress(recipientAddress)) {
        return { success: false, error: 'Invalid recipient address' };
      }

      // Check if user is blacklisted
      const isBlacklisted = await this.faucetContract['blacklisted']!(recipientAddress);
      if (isBlacklisted) {
        return { success: false, error: 'Address is blacklisted' };
      }

      // Check cooldown
      const canClaim = await this.canClaimEth(recipientAddress);
      if (!canClaim.canClaim) {
        return { 
          success: false, 
          error: `Cooldown active. Try again in ${Math.ceil((canClaim.remainingTime || 0) / 60)} minutes` 
        };
      }

      // Execute claim
      const tx = await this.faucetContract['claimEthFor']!(recipientAddress);
      await tx.wait();

      return { success: true, txHash: tx.hash };
    } catch (error: any) {
      console.error('ETH claim error:', error);
      return { success: false, error: error.message || 'Transaction failed' };
    }
  }

  async claimToken(recipientAddress: string, tokenAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Validate addresses
      if (!ethers.isAddress(recipientAddress) || !ethers.isAddress(tokenAddress)) {
        return { success: false, error: 'Invalid address provided' };
      }

      // Check if user is blacklisted
      const isBlacklisted = await this.faucetContract['blacklisted']!(recipientAddress);
      if (isBlacklisted) {
        return { success: false, error: 'Address is blacklisted' };
      }

      // Check if token is supported
      const tokenInfo = await this.faucetContract['supportedTokens']!(tokenAddress);
      if (!tokenInfo.active) {
        return { success: false, error: 'Token not supported' };
      }

      // Check cooldown
      const canClaim = await this.canClaimToken(recipientAddress, tokenAddress);
      if (!canClaim.canClaim) {
        return { 
          success: false, 
          error: `Cooldown active. Try again in ${Math.ceil((canClaim.remainingTime || 0) / 60)} minutes` 
        };
      }

      // Execute claim
      const tx = await this.faucetContract['claimTokenFor']!(tokenAddress, recipientAddress);
      await tx.wait();

      return { success: true, txHash: tx.hash };
    } catch (error: any) {
      console.error('Token claim error:', error);
      return { success: false, error: error.message || 'Transaction failed' };
    }
  }

  async canClaimEth(address: string): Promise<{ canClaim: boolean; remainingTime?: number }> {
    try {
      const lastClaimTime = await this.faucetContract['lastEthClaimTime']!(address);
      const cooldownPeriod = 24 * 60 * 60; // 24 hours in seconds
      const currentTime = Math.floor(Date.now() / 1000);
      const timeSinceLastClaim = currentTime - Number(lastClaimTime);

      if (timeSinceLastClaim >= cooldownPeriod) {
        return { canClaim: true };
      } else {
        const remainingTime = cooldownPeriod - timeSinceLastClaim;
        return { canClaim: false, remainingTime };
      }
    } catch (error) {
      console.error('Error checking ETH claim eligibility:', error);
      return { canClaim: false };
    }
  }

  async canClaimToken(address: string, tokenAddress: string): Promise<{ canClaim: boolean; remainingTime?: number }> {
    try {
      const lastClaimTime = await this.faucetContract['lastClaimTime']!(address, tokenAddress);
      const tokenInfo = await this.faucetContract['supportedTokens']!(tokenAddress);
      const cooldownPeriod = Number(tokenInfo.cooldown);
      const currentTime = Math.floor(Date.now() / 1000);
      const timeSinceLastClaim = currentTime - Number(lastClaimTime);

      if (timeSinceLastClaim >= cooldownPeriod) {
        return { canClaim: true };
      } else {
        const remainingTime = cooldownPeriod - timeSinceLastClaim;
        return { canClaim: false, remainingTime };
      }
    } catch (error) {
      console.error('Error checking token claim eligibility:', error);
      return { canClaim: false };
    }
  }

  async getEthAmount(): Promise<string> {
    try {
      const amount = await this.faucetContract['ethAmount']!();
      return ethers.formatEther(amount);
    } catch (error) {
      console.error('Error getting ETH amount:', error);
      return '0.1'; // Default fallback
    }
  }

  async getTokenInfo(tokenAddress: string): Promise<{ amount: string; cooldown: number; active: boolean }> {
    try {
      const tokenInfo = await this.faucetContract['supportedTokens']!(tokenAddress);
      return {
        amount: ethers.formatUnits(tokenInfo.amount, 18), // Assuming 18 decimals
        cooldown: Number(tokenInfo.cooldown),
        active: tokenInfo.active
      };
    } catch (error) {
      console.error('Error getting token info:', error);
      return { amount: '0', cooldown: 0, active: false };
    }
  }
}