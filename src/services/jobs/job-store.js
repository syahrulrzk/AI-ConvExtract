import { logger } from '../../utils/logger.js';
import { extractDom } from '../extractor/extractor-engine.js';
import { detectPlatform } from '../platform-detector.js';
import { PLATFORMS } from '../../constants/platforms.js';
import { parseChatGPT } from '../parser/chatgpt-parser.js';
import { generateStatistics } from '../statistics/statistics-engine.js';

/**
 * Extraction pipeline shared by the BullMQ worker (queue.js).
 *
 * The queue itself lives in queue.js — this module only knows how to turn a
 * URL into a structured result.
 *
 * @param {string} url - Share URL to extract
 * @param {AbortSignal} [signal] - abort signal from the job timeout
 * @returns {Promise<Object>} the API-facing result payload
 */
export async function runExtraction(url, signal) {
  const platform = detectPlatform(url);
  if (platform === PLATFORMS.UNKNOWN) {
    const error = new Error('Platform not supported yet.');
    error.code = 'UNSUPPORTED_PLATFORM';
    throw error;
  }

  const startTime = Date.now();
  const extracted = await extractDom(url, signal);

  let parsedData;
  if (extracted && (extracted.__playwrightExtracted || extracted.__chatExtracted)) {
    parsedData = {
      title: extracted.title,
      messages: extracted.messages,
      ...(extracted.truncated ? { truncated: true } : {}),
    };
  } else if (platform === PLATFORMS.CHATGPT) {
    parsedData = parseChatGPT(extracted);
  } else {
    const error = new Error('Parser not implemented.');
    error.code = 'UNSUPPORTED_PLATFORM';
    throw error;
  }

  const processingTime = Date.now() - startTime;
  const stats = generateStatistics(parsedData.messages, processingTime);

  const result = {
    success: true,
    url,
    platform,
    title: parsedData.title,
    messages: parsedData.messages,
    ...stats,
  };
  logger.info({ url, totalMessages: stats.totalMessages }, 'Extraction pipeline complete');
  return result;
}
