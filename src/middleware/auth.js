import { env } from '../config/env.js';

export function authMiddleware(request, reply, done) {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing x-api-key header.'
      }
    });
    return;
  }

  if (apiKey !== env.API_KEY) {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API Key.'
      }
    });
    return;
  }

  done();
}
