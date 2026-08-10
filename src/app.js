import Fastify from 'fastify';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';
import { logger } from './utils/logger.js';
import healthRoutes from './routes/health.js';
import extractRoutes from './routes/extract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const buildApp = async () => {
  const app = Fastify({
    loggerInstance: logger,
  });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    reply.status(error.statusCode || 500).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: error.message || 'An unexpected error occurred.',
      },
    });
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(extractRoutes, { prefix: '/api/v1' });

  // Serve API Docs at /docs
  const docsPath = path.join(__dirname, '../docs');
  const apiHtmlPath = path.join(docsPath, 'api.html');
  app.get('/docs', async (request, reply) => {
    const html = fs.readFileSync(apiHtmlPath, 'utf-8');
    reply.type('text/html').send(html);
  });

  // Serve static frontend
  const frontendPath = path.join(__dirname, '../frontend/dist');
  await app.register(fastifyStatic, {
    root: frontendPath,
    prefix: '/',
    decorateReply: false,
  });

  // Fallback for SPA
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      reply.status(404).send({ success: false, error: { message: 'API Route not found' } });
    } else {
      reply.sendFile('index.html', frontendPath);
    }
  });

  return app;
};


