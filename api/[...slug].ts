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
    // For catch-all routes, reconstruct the path from slug parameters
    const { slug } = req.query;
    let path = '/';
    
    if (slug && Array.isArray(slug)) {
      path = '/' + slug.join('/');
    } else if (slug && typeof slug === 'string') {
      path = '/' + slug;
    }
    
    // Add query parameters if they exist (excluding the slug parameter)
    const queryParams = new URLSearchParams();
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== 'slug' && value) {
        if (Array.isArray(value)) {
          value.forEach(v => queryParams.append(key, v));
        } else {
          queryParams.append(key, value);
        }
      }
    });
    
    const queryString = queryParams.toString();
    const fullPath = path + (queryString ? '?' + queryString : '');
    
    const response = await app.inject({
      method: req.method as any,
      url: fullPath,
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