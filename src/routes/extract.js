import { z } from 'zod';
import { detectPlatform } from '../services/platform-detector.js';
import { PLATFORMS } from '../constants/platforms.js';
import { createJob, getJob, waitForJob } from '../services/jobs/queue.js';
import { authMiddleware } from '../middleware/auth.js';

// Sync-mode (wait: true) limits. Waiting past these is risky for HTTP clients
// (n8n's default request timeout is 5 min), so we fall back to async polling.
const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const MAX_WAIT_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

const extractSchema = z.object({
  url: z.string().url(),
  // wait: true blocks until the extraction finishes and returns the full
  // result inline (status 200). Default false = async (202 + pollUrl).
  wait: z.boolean().optional().default(false),
  // How long to wait before falling back to an async 202 + pollUrl.
  waitTimeoutMs: z.number().int().min(1000).max(MAX_WAIT_TIMEOUT_MS).optional(),
});

const batchExtractSchema = z.object({
  urls: z.array(z.string().url()).max(10),
  wait: z.boolean().optional().default(false),
  waitTimeoutMs: z.number().int().min(1000).max(MAX_WAIT_TIMEOUT_MS).optional(),
});

/** Map a job payload (from getJob) to the API-facing job response shape. */
function jobToResponse(payload) {
  return {
    success: true,
    jobId: payload.id,
    status: payload.status,
    url: payload.url,
    createdAt: payload.createdAt,
    startedAt: payload.startedAt,
    finishedAt: payload.finishedAt,
    ...(payload.result ? { result: payload.result } : {}),
    ...(payload.error ? { error: payload.error } : {}),
  };
}

export default async function extractRoutes(fastify, options) {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  // Submit an extraction job. By default it responds immediately (202) with a
  // jobId — the actual extraction runs in the background and is polled via
  // GET /extract/jobs/:jobId. With { wait: true } it instead blocks until the
  // job is done and returns the full result inline (200).
  fastify.post('/extract', async (request, reply) => {
    const parseResult = extractSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { success: false, error: { code: 'INVALID_REQUEST', message: parseResult.error.errors } };
    }

    const { url, wait, waitTimeoutMs } = parseResult.data;
    const platform = detectPlatform(url);
    if (platform === PLATFORMS.UNKNOWN) {
      reply.status(400);
      return { success: false, error: { code: 'UNSUPPORTED_PLATFORM', message: 'Platform not supported yet.' } };
    }

    const job = await createJob(url);

    if (wait) {
      const timeoutMs = waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
      try {
        const finished = await waitForJob(job.id, { timeoutMs });
        if (!finished) {
          reply.status(404);
          return { success: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found or expired.' } };
        }
        return jobToResponse(finished);
      } catch (err) {
        // Wait timed out — fall back to the async response so the caller can
        // still poll for the result instead of losing the job.
        if (err.code === 'WAIT_TIMEOUT') {
          const current = await getJob(job.id);
          reply.status(202);
          return {
            success: true,
            jobId: job.id,
            status: current?.status ?? job.status,
            url,
            pollUrl: `/api/v1/extract/jobs/${job.id}`,
            note: `Job not finished within ${timeoutMs}ms — poll pollUrl to retrieve the result.`,
          };
        }
        throw err;
      }
    }

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

    return jobToResponse(job);
  });

  // Batch: submit multiple URLs at once, each gets its own jobId. With
  // { wait: true } it blocks until every job is finished (or timed out).
  fastify.post('/extract/batch', async (request, reply) => {
    const parseResult = batchExtractSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { success: false, error: { code: 'INVALID_REQUEST', message: parseResult.error.errors } };
    }

    const { urls, wait, waitTimeoutMs } = parseResult.data;
    const timeoutMs = waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;

    const jobs = await Promise.all(urls.map(async (url) => {
      const platform = detectPlatform(url);
      if (platform === PLATFORMS.UNKNOWN) {
        return { url, success: false, error: { code: 'UNSUPPORTED_PLATFORM', message: 'Platform not supported yet.' } };
      }
      const job = await createJob(url);

      if (wait) {
        try {
          const finished = await waitForJob(job.id, { timeoutMs });
          return finished ? jobToResponse(finished) : { url, success: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found or expired.' } };
        } catch (err) {
          if (err.code === 'WAIT_TIMEOUT') {
            const current = await getJob(job.id);
            return {
              url,
              success: true,
              jobId: job.id,
              status: current?.status ?? job.status,
              pollUrl: `/api/v1/extract/jobs/${job.id}`,
              note: `Job not finished within ${timeoutMs}ms — poll pollUrl to retrieve the result.`,
            };
          }
          throw err;
        }
      }

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
