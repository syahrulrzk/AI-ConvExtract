import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { runExtraction } from './job-store.js';

/**
 * Redis-backed async job queue (BullMQ).
 *
 * Replaces the in-memory job store: jobs survive restarts, multiple server
 * instances can share one queue, and the worker runs inside the same process
 * (or could be split into a separate container for scaling).
 *
 * Flow:
 *  1. POST /extract → queue.add() → returns { jobId } immediately
 *  2. BullMQ Worker picks up the job and runs the extraction pipeline
 *  3. Client polls GET /extract/jobs/:jobId → BullMQ job state + return value
 */

// Per-job safety net so a hung extraction (bot challenge, stalled network)
// can't wedge the serial queue forever. Generous enough for very long
// conversations (200+ prompts) — the real collector budget is separate and
// scales with conversation size, this only guards against true hangs.
const JOB_TIMEOUT_MS = Number(process.env.EXTRACT_JOB_TIMEOUT_MS) || 60 * 60 * 1000;
// Keep completed/failed jobs in Redis for 1h so the poll endpoint can still
// serve results, then let BullMQ auto-clean them.
const JOB_RETENTION_SECONDS = 60 * 60;

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const extractQueue = new Queue('ai-converter-extract', { connection });

let worker = null;

/** Submit an extraction job. Returns { id, url, status: 'queued' }. */
export async function createJob(url) {
  const jobId = randomUUID();
  await extractQueue.add(
    'extract',
    { url },
    {
      jobId,
      removeOnComplete: { age: JOB_RETENTION_SECONDS },
      removeOnFail: { age: JOB_RETENTION_SECONDS },
    }
  );
  return { id: jobId, url, status: 'queued' };
}

/** Map a BullMQ job to the API-facing job payload. Returns null if not found. */
export async function getJob(jobId) {
  const job = await extractQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const statusMap = {
    waiting: 'queued',
    delayed: 'queued',
    paused: 'queued',
    active: 'running',
    completed: 'done',
    failed: 'failed',
  };

  const payload = {
    id: job.id,
    url: job.data.url,
    status: statusMap[state] || 'queued',
    createdAt: job.timestamp,
    startedAt: job.processedOn,
    finishedAt: job.finishedOn,
  };

  if (state === 'completed') {
    payload.result = job.returnvalue;
  } else if (state === 'failed') {
    const reason = job.failedReason || 'Extraction failed';
    payload.error = {
      // BullMQ prefixes stack traces; detect our own timeout marker
      code: reason.includes('EXTRACTION_TIMEOUT') || /exceeded .*ms budget/.test(reason)
        ? 'EXTRACTION_TIMEOUT'
        : 'EXTRACTION_FAILED',
      message: reason,
    };
  }

  return payload;
}

/** Start the background worker (idempotent). */
export async function startWorker() {
  if (worker) return worker;

  worker = new Worker(
    'ai-converter-extract',
    async (job) => {
      // Enforce a per-job budget so a hung extraction (bot challenge, stalled
      // network) can't wedge the queue. The AbortController is threaded down
      // through extractDom into the scroll loops, so the browser work is
      // actually stopped — no zombie extraction eating the shared browsers.
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, JOB_TIMEOUT_MS);

      try {
        return await runExtraction(job.data.url, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) {
          err.message = `Extraction exceeded ${JOB_TIMEOUT_MS}ms budget`;
          err.code = 'EXTRACTION_TIMEOUT';
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },
    { connection, concurrency: 1 }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job.id, error: err.message }, 'Job failed');
  });
  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'Worker error');
  });

  logger.info('BullMQ worker started');
  return worker;
}

/** Graceful shutdown: stop worker + close queue + close Redis. */
export async function closeQueue() {
  if (worker) {
    // force: true → don't wait up to JOB_TIMEOUT_MS for an in-flight job;
    // browsers are closed right after anyway.
    await worker.close({ force: true });
    worker = null;
  }
  await extractQueue.close();
  await connection.quit();
}
