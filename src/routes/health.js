import { env } from '../config/env.js';

export default async function healthRoutes(fastify, options) {
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/version', async (request, reply) => {
    return { version: env.APP_VERSION };
  });
}
