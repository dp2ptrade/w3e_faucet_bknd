import { VercelRequest, VercelResponse } from '@vercel/node';
import { FastifyInstance } from 'fastify';
import { createServerlessApp } from './server';

// Import your Fastify app
let app: FastifyInstance | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!app) {
      // Create serverless-compatible Fastify app
      app = await createServerlessApp();
      await app.ready();
    }

    // Handle the request using Fastify's inject method for serverless
    const response = await app.inject({
      method: req.method as any,
      url: req.url || '/',
      headers: req.headers as any,
      payload: req.body,
    });

    // Set response headers
    Object.entries(response.headers).forEach(([key, value]) => {
      if (value !== undefined) {
        res.setHeader(key, value);
      }
    });

    // Set status code and send response
    res.status(response.statusCode).send(response.payload);
  } catch (error) {
    console.error('Error in serverless handler:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}