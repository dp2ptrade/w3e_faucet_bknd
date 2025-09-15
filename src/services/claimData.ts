interface ClaimHistoryEntry {
  timestamp: number;
  tokenAddress: string;
  amount: string;
  txHash: string;
}

// Shared claim history data store
const claimHistory = new Map<string, ClaimHistoryEntry[]>();

// Shared token registry
const tokenRegistry = new Map<string, { symbol: string; name: string; amount: string; decimals: number }>();

export class ClaimDataService {
  static getClaimHistory(): Map<string, ClaimHistoryEntry[]> {
    return claimHistory;
  }

  static getTokenRegistry(): Map<string, { symbol: string; name: string; amount: string; decimals: number }> {
    return tokenRegistry;
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

  static addToken(address: string, tokenInfo: { symbol: string; name: string; amount: string; decimals: number }): void {
    tokenRegistry.set(address, tokenInfo);
  }

  static getToken(address: string): { symbol: string; name: string; amount: string; decimals: number } | undefined {
    return tokenRegistry.get(address);
  }

  static getAllTokens(): Array<{ address: string; symbol: string; name: string; amount: string; decimals: number }> {
    return Array.from(tokenRegistry.entries()).map(([address, info]) => ({
      address,
      ...info
    }));
  }

  static getUserSpecificStats(userAddress: string): {
    totalClaims: number;
    tokenStats: Record<string, {
      claims: number;
      totalAmount: string;
      totalClaimed: string;
      lastClaim?: string;
      symbol?: string;
      name?: string;
      amount?: string;
    }>;
  } {
    const userKey = userAddress.toLowerCase();
    const userClaims = claimHistory.get(userKey) || [];
    
    const tokenStats: Record<string, {
      claims: number;
      totalAmount: string;
      totalClaimed: string;
      lastClaim?: string;
      symbol?: string;
      name?: string;
      amount?: string;
    }> = {};
    
    for (const claim of userClaims) {
      const tokenAddress = claim.tokenAddress;
      const tokenInfo = tokenRegistry.get(tokenAddress.toLowerCase());
      
      if (!tokenStats[tokenAddress]) {
        tokenStats[tokenAddress] = {
          claims: 0,
          totalAmount: '0',
          totalClaimed: '0',
          symbol: tokenInfo?.symbol || 'UNKNOWN',
          name: tokenInfo?.name || 'Unknown Token',
          amount: tokenInfo?.amount || '0'
        };
      }
      
      tokenStats[tokenAddress]!.claims++;
      
      // Calculate total claimed amount based on token amount and claims
      const tokenAmount = parseFloat(tokenInfo?.amount || '0');
      const totalClaimedAmount = tokenAmount * tokenStats[tokenAddress]!.claims;
      tokenStats[tokenAddress]!.totalClaimed = totalClaimedAmount.toString();
      
      // Update last claim timestamp
      if (!tokenStats[tokenAddress]!.lastClaim || claim.timestamp > new Date(tokenStats[tokenAddress]!.lastClaim!).getTime()) {
        tokenStats[tokenAddress]!.lastClaim = new Date(claim.timestamp).toISOString();
      }
    }
    
    return {
      totalClaims: userClaims.length,
      tokenStats
    };
  }

  static initializeDefaultTokens(): void {
    // Initialize with default ETH token
    tokenRegistry.set('0x0000000000000000000000000000000000000000', {
      symbol: 'ETH',
      name: 'Ethereum',
      amount: '0.01',
      decimals: 18
    });
  }
}

// Initialize default tokens
ClaimDataService.initializeDefaultTokens();

export { ClaimHistoryEntry };