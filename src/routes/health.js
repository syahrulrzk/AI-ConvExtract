export default async function healthRoutes(fastify, options) {
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/version', async (request, reply) => {
    return { version: '1.0.0' }; // In reality, we could read this from package.json
  });
}
