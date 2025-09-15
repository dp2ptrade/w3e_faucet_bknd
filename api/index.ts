import { IncomingMessage, ServerResponse } from 'http';
import { FastifyInstance } from 'fastify';

// Import your Fastify app
let app: FastifyInstance | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!app) {
    // Dynamically import your server to avoid issues with serverless
    const { createServer } = await import('../dist/server');
    app = await createServer();
    await app.ready();
  }

  // Handle the request
  if (app && app.server) {
    app.server.emit('request', req, res);
  }
}