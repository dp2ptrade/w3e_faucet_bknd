import { IncomingMessage, ServerResponse } from 'http';
import { FastifyInstance } from 'fastify';

// Import your Fastify app
let app: FastifyInstance | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!app) {
      // Dynamically import your server to avoid issues with serverless
      const { createServer } = await import('../src/server');
      app = await createServer();
      await app.ready();
    }

    // Handle the request - app is guaranteed to be non-null here due to the check above
    if (app && app.server) {
      app.server.emit('request', req, res);
    } else {
      // Fallback error response if app server is not available
      res.statusCode = 500;
      res.end('Server not available');
    }
  } catch (error) {
    console.error('Error in serverless handler:', error);
    res.statusCode = 500;
    res.end('Internal server error');
  }
}