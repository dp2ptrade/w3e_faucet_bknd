import { config } from '@/config/environment';
import { createServer } from '@/server';
import { logger } from '@/utils/logger';
import { gracefulShutdown } from '@/utils/gracefulShutdown';

async function start() {
  try {
    const server = await createServer();
    
    // Start the server
    await server.listen({
      port: config.port,
      host: '0.0.0.0'
    });
    
    logger.info(`🚀 Server running on port ${config.port}`);
    logger.info(`📊 Environment: ${config.nodeEnv}`);
    logger.info(`🔗 API Version: ${config.apiVersion}`);
    
    // Setup graceful shutdown
    gracefulShutdown(server);
    
  } catch (error) {
    logger.error('❌ Error starting server:');
    console.error(error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

start();