import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_VERSION: z.string().default('v1'),
  

  
  // Redis Configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0').transform(Number),
  
  // Blockchain Configuration
  SEPOLIA_RPC_URL: z.string().min(1, 'Sepolia RPC URL is required'),
  PRIVATE_KEY: z.string().min(1, 'Private key is required'),
  FAUCET_CONTRACT_ADDRESS: z.string().min(1, 'Faucet contract address is required'),
  
  // Rate Limiting Configuration
  RATE_LIMIT_MAX: z.string().default('10').transform(Number),
  RATE_LIMIT_WINDOW: z.string().default('900000').transform(Number), // 15 minutes
  DAILY_CLAIM_LIMIT: z.string().default('1').transform(Number),
  IP_RATE_LIMIT_MAX: z.string().default('50').transform(Number),
  IP_RATE_LIMIT_WINDOW: z.string().default('3600000').transform(Number), // 1 hour
  
 
  // JWT Configuration
  JWT_SECRET: z.string().min(1, 'JWT secret is required'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  
  // CORS Configuration
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FILE: z.string().default('logs/app.log'),
  

  // WebSocket Configuration
  WS_ENABLED: z.string().default('true').transform(val => val === 'true'),
  WS_PORT: z.string().default('3002').transform(Number),
  
  // Queue Configuration
  QUEUE_REDIS_URL: z.string().default('redis://localhost:6379'),
  QUEUE_CONCURRENCY: z.string().default('5').transform(Number),
  
  // Security Configuration
  HELMET_ENABLED: z.string().default('true').transform(val => val === 'true'),
  TRUST_PROXY: z.string().default('false').transform(val => val === 'true'),
  
  // Cache Configuration
  CACHE_TTL: z.string().default('300').transform(Number), // 5 minutes
  CACHE_MAX_SIZE: z.string().default('1000').transform(Number),
  
  // Faucet Configuration
  ETH_AMOUNT: z.string().default('0.1'),
  TOKEN_AMOUNTS: z.string().default('{"USDT":1000,"USDC":1000,"DAI":1000,"WETH":0.1,"LINK":10,"UNI":5}'),
  ADMIN_ADDRESS: z.string().min(1, 'Admin address is required'),
  
  // Health Check Configuration
  HEALTH_CHECK_ENABLED: z.string().default('true').transform(val => val === 'true'),
  HEALTH_CHECK_INTERVAL: z.string().default('30000').transform(Number),
  
  // Analytics Configuration
  ANALYTICS_ENABLED: z.string().default('false').transform(val => val === 'true'),
  ANALYTICS_API_KEY: z.string().optional(),
});

// Validate and parse environment variables
const env = envSchema.parse(process.env);

// Export configuration object
export const config = {
  // Server
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  apiVersion: env.API_VERSION,
  

  
  // Redis
  redis: {
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  },
  
  // Blockchain
  blockchain: {
    sepoliaRpcUrl: env.SEPOLIA_RPC_URL,
    privateKey: env.PRIVATE_KEY,
    faucetContractAddress: env.FAUCET_CONTRACT_ADDRESS,
  },
  
  // Rate Limiting
  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    window: env.RATE_LIMIT_WINDOW,
    dailyClaimLimit: env.DAILY_CLAIM_LIMIT,
    ipMax: env.IP_RATE_LIMIT_MAX,
    ipWindow: env.IP_RATE_LIMIT_WINDOW,
  },
  
  
  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  
  // CORS
  cors: {
    origin: env.CORS_ORIGIN,
  },
  
  // Logging
  logging: {
    level: env.LOG_LEVEL,
    file: env.LOG_FILE,
  },
  
 
  // WebSocket
  websocket: {
    enabled: env.WS_ENABLED,
    port: env.WS_PORT,
  },
  
  // Queue
  queue: {
    redisUrl: env.QUEUE_REDIS_URL,
    concurrency: env.QUEUE_CONCURRENCY,
  },
  
  // Security
  security: {
    helmetEnabled: env.HELMET_ENABLED,
    trustProxy: env.TRUST_PROXY,
  },
  
  // Cache
  cache: {
    ttl: env.CACHE_TTL,
    maxSize: env.CACHE_MAX_SIZE,
  },
  
  // Faucet
  faucet: {
    ethAmount: env.ETH_AMOUNT,
    tokenAmounts: JSON.parse(env.TOKEN_AMOUNTS),
    adminAddress: env.ADMIN_ADDRESS,
  },
  
  // Health Check
  healthCheck: {
    enabled: env.HEALTH_CHECK_ENABLED,
    interval: env.HEALTH_CHECK_INTERVAL,
  },
  
  // Analytics
  analytics: {
    enabled: env.ANALYTICS_ENABLED,
    apiKey: env.ANALYTICS_API_KEY,
  },
} as const;

export type Config = typeof config;