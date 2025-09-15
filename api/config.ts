// Simple environment configuration for serverless deployment
// Use function to handle type conversions and avoid Vercel parsing issues

function createConfig() {
  const rateLimitMax = process.env['RATE_LIMIT_MAX'] || '100';
  const rateLimitMaxNum = +rateLimitMax;
  
  return {
    blockchain: {
      sepoliaRpcUrl: process.env['SEPOLIA_RPC_URL'] || 'https://sepolia.infura.io/v3/your-key',
      privateKey: process.env['PRIVATE_KEY'] || '',
      faucetContractAddress: process.env['FAUCET_CONTRACT_ADDRESS'] || '',
    },
    
    faucet: {
      ethAmount: process.env['ETH_AMOUNT'] || '0.1',
    },
    
    cors: {
      origin: process.env['CORS_ORIGIN'] || '*',
    },
    
    rateLimit: {
      max: rateLimitMaxNum,
      timeWindow: process.env['RATE_LIMIT_WINDOW'] || '1 minute',
    }
  };
}

export const config = createConfig();

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
  const nodeEnv = process.env['NODE_ENV'] || 'development';
  
  return {
    nodeEnv,
    hasRequiredVars: envValidation.isValid,
    missingVars: envValidation.missingVars,
    rpcUrl: process.env['SEPOLIA_RPC_URL'] ? 'Set' : 'Missing',
    privateKey: process.env['PRIVATE_KEY'] ? 'Set' : 'Missing',
    contractAddress: process.env['FAUCET_CONTRACT_ADDRESS'] ? 'Set' : 'Missing',
  };
}