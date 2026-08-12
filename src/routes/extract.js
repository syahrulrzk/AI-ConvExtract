import { z } from 'zod';
import { detectPlatform } from '../services/platform-detector.js';
import { PLATFORMS } from '../constants/platforms.js';
import { createJob, getJob } from '../services/jobs/queue.js';
import { authMiddleware } from '../middleware/auth.js';

const extractSchema = z.object({
  url: z.string().url(),
});

const batchExtractSchema = z.object({
  urls: z.array(z.string().url()).max(10),
});

export default async function extractRoutes(fastify, options) {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  // Submit an extraction job. Responds immediately (202) with a jobId —
  // the actual extraction runs in the background and is polled via
  // GET /extract/jobs/:jobId.
  fastify.post('/extract', async (request, reply) => {
    const parseResult = extractSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { success: false, error: { code: 'INVALID_REQUEST', message: parseResult.error.errors } };
    }

    const { url } = parseResult.data;
    const platform = detectPlatform(url);
    if (platform === PLATFORMS.UNKNOWN) {
      reply.status(400);
      return { success: false, error: { code: 'UNSUPPORTED_PLATFORM', message: 'Platform not supported yet.' } };
    }

    const job = await createJob(url);
    reply.status(202);
    return {
      success: true,
      jobId: job.id,
      status: job.status,
      url,
      pollUrl: `/api/v1/extract/jobs/${job.id}`,
    };
  });

  // Poll a job's status.
  fastify.get('/extract/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    const job = await getJob(jobId);

    if (!job) {
      reply.status(404);
      return { success: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found or expired.' } };
    }

    return {
      success: true,
      jobId: job.id,
      status: job.status,
      url: job.url,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      ...(job.result ? { result: job.result } : {}),
      ...(job.error ? { error: job.error } : {}),
    };
  });

  // Batch: submit multiple URLs at once, each gets its own jobId.
  fastify.post('/extract/batch', async (request, reply) => {
    const parseResult = batchExtractSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { success: false, error: { code: 'INVALID_REQUEST', message: parseResult.error.errors } };
    }

    const urls = parseResult.data.urls;
    const jobs = await Promise.all(urls.map(async (url) => {
      const platform = detectPlatform(url);
      if (platform === PLATFORMS.UNKNOWN) {
        return { url, success: false, error: { code: 'UNSUPPORTED_PLATFORM', message: 'Platform not supported yet.' } };
      }
      const job = await createJob(url);
      return {
        url,
        success: true,
        jobId: job.id,
        status: job.status,
        pollUrl: `/api/v1/extract/jobs/${job.id}`,
      };
    }));

    reply.status(202);
    return { success: true, total: urls.length, jobs };
  });
}
