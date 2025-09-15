import { FastifyInstance } from 'fastify';
import { logger } from './logger';

export function gracefulShutdown(server: FastifyInstance): void {
  const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;
  
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Close the server
        await server.close();
        logger.info('Server closed successfully');
        
        // Exit the process
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });
  });
}