interface ClaimHistoryEntry {
  timestamp: number;
  tokenAddress: string;
  amount: string;
  txHash: string;
  type: 'ETH' | 'TOKEN';
}

// In-memory storage for serverless (note: this resets on each cold start)
// For production, consider using a database or external storage
const claimHistory = new Map<string, ClaimHistoryEntry[]>();

// Token registry with common testnet tokens
const tokenRegistry = new Map<string, { symbol: string; name: string; amount: string; decimals: number }>();

export class ServerlessClaimDataService {
  static initializeDefaultTokens(): void {
    // Common Sepolia testnet tokens
    const defaultTokens = [
      {
        address: '0x779877A7B0D9E8603169DdbD7836e478b4624789', // LINK on Sepolia
        symbol: 'LINK',
        name: 'Chainlink Token',
        amount: '10',
        decimals: 18
      },
      {
        address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI on Sepolia
        symbol: 'UNI',
        name: 'Uniswap Token',
        amount: '5',
        decimals: 18
      },
      {
        address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH on Sepolia
        symbol: 'WETH',
        name: 'Wrapped Ether',
        amount: '0.1',
        decimals: 18
      }
    ];

    defaultTokens.forEach(token => {
      tokenRegistry.set(token.address.toLowerCase(), {
        symbol: token.symbol,
        name: token.name,
        amount: token.amount,
        decimals: token.decimals
      });
    });
  }

  static addClaim(userAddress: string, claim: ClaimHistoryEntry): void {
    const userKey = userAddress.toLowerCase();
    if (!claimHistory.has(userKey)) {
      claimHistory.set(userKey, []);
    }
    claimHistory.get(userKey)!.push(claim);
  }

  static getUserClaims(userAddress: string): ClaimHistoryEntry[] {
    const userKey = userAddress.toLowerCase();
    return claimHistory.get(userKey) || [];
  }

  static getRecentClaims(userAddress: string, hours: number = 24): ClaimHistoryEntry[] {
    const userClaims = this.getUserClaims(userAddress);
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    return userClaims.filter(claim => claim.timestamp > cutoffTime);
  }

  static hasRecentEthClaim(userAddress: string, hours: number = 24): boolean {
    const recentClaims = this.getRecentClaims(userAddress, hours);
    return recentClaims.some(claim => claim.type === 'ETH');
  }

  static hasRecentTokenClaim(userAddress: string, tokenAddress: string, hours: number = 24): boolean {
    const recentClaims = this.getRecentClaims(userAddress, hours);
    return recentClaims.some(claim => 
      claim.type === 'TOKEN' && 
      claim.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
    );
  }

  static getToken(address: string): { symbol: string; name: string; amount: string; decimals: number } | undefined {
    return tokenRegistry.get(address.toLowerCase());
  }

  static getAllTokens(): Array<{ address: string; symbol: string; name: string; amount: string; decimals: number }> {
    return Array.from(tokenRegistry.entries()).map(([address, info]) => ({
      address,
      ...info
    }));
  }

  static getUserStats(userAddress: string): {
    totalClaims: number;
    ethClaims: number;
    tokenClaims: number;
    lastClaimTime?: number;
  } {
    const userClaims = this.getUserClaims(userAddress);
    const ethClaims = userClaims.filter(claim => claim.type === 'ETH').length;
    const tokenClaims = userClaims.filter(claim => claim.type === 'TOKEN').length;
    const lastClaimTime = userClaims.length > 0 
      ? Math.max(...userClaims.map(claim => claim.timestamp))
      : undefined;

    return {
      totalClaims: userClaims.length,
      ethClaims,
      tokenClaims,
      lastClaimTime
    };
  }

  static validateAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  static formatClaimResponse(claim: ClaimHistoryEntry, tokenInfo?: { symbol: string; name: string }) {
    return {
      timestamp: claim.timestamp,
      type: claim.type,
      amount: claim.amount,
      txHash: claim.txHash,
      token: claim.type === 'TOKEN' ? {
        address: claim.tokenAddress,
        symbol: tokenInfo?.symbol || 'UNKNOWN',
        name: tokenInfo?.name || 'Unknown Token'
      } : undefined
    };
  }
}

// Initialize default tokens
ServerlessClaimDataService.initializeDefaultTokens();

export { ClaimHistoryEntry };