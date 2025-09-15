// Simple environment configuration for serverless deployment
const sepoliaRpcUrl = process.env['SEPOLIA_RPC_URL'] || 'https://sepolia.infura.io/v3/your-key';
const privateKey = process.env['PRIVATE_KEY'] || '';
const faucetContractAddress = process.env['FAUCET_CONTRACT_ADDRESS'] || '';
const ethAmount = process.env['ETH_AMOUNT'] || '0.1';
const cooldownPeriod = process.env['COOLDOWN_PERIOD'] || '86400';
const corsOrigin = process.env['CORS_ORIGIN'] || '*';
const rateLimitMax = process.env['RATE_LIMIT_MAX'] || '100';
const rateLimitWindow = process.env['RATE_LIMIT_WINDOW'] || '1 minute';

// Pre-convert string values to numbers outside object definition for Vercel compatibility
const cooldownPeriodNum = +cooldownPeriod;
const rateLimitMaxNum = +rateLimitMax;

export const config = {
  blockchain: {
    sepoliaRpcUrl,
    privateKey,
    faucetContractAddress,
  },
  
  faucet: {
    ethAmount,
    cooldownPeriod: cooldownPeriodNum, // 24 hours in seconds
  },
  
  cors: {
    origin: corsOrigin,
  },
  
  rateLimit: {
    max: rateLimitMaxNum,
    timeWindow: rateLimitWindow,
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