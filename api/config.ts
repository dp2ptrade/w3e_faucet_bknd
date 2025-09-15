// Simple environment configuration for serverless deployment
export const config = {
  blockchain: {
    sepoliaRpcUrl: process.env['SEPOLIA_RPC_URL'] || 'https://sepolia.infura.io/v3/your-key',
    privateKey: process.env['PRIVATE_KEY'] || '',
    faucetContractAddress: process.env['FAUCET_CONTRACT_ADDRESS'] || '',
  },
  
  faucet: {
    ethAmount: process.env['ETH_AMOUNT'] || '0.1',
    cooldownPeriod: parseInt(process.env['COOLDOWN_PERIOD'] || '86400'), // 24 hours in seconds
  },
  
  cors: {
    origin: process.env['CORS_ORIGIN'] || '*',
  },
  
  rateLimit: {
    max: parseInt(process.env['RATE_LIMIT_MAX'] || '100'),
    timeWindow: process.env['RATE_LIMIT_WINDOW'] || '1 minute',
  }
};

// Validation function to check if required environment variables are set
export function validateEnvironment(): { isValid: boolean; missingVars: string[] } {
  const requiredVars = [
    'SEPOLIA_RPC_URL',
    'PRIVATE_KEY', 
    'FAUCET_CONTRACT_ADDRESS'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  return {
    isValid: missingVars.length === 0,
    missingVars
  };
}

// Helper function to get environment info for debugging
export function getEnvironmentInfo() {
  const envValidation = validateEnvironment();
  
  return {
    nodeEnv: process.env['NODE_ENV'] || 'development',
    hasRequiredVars: envValidation.isValid,
    missingVars: envValidation.missingVars,
    rpcUrl: process.env['SEPOLIA_RPC_URL'] ? 'Set' : 'Missing',
    privateKey: process.env['PRIVATE_KEY'] ? 'Set' : 'Missing',
    contractAddress: process.env['FAUCET_CONTRACT_ADDRESS'] ? 'Set' : 'Missing',
  };
}