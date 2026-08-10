import { z } from 'zod';
import { detectPlatform } from '../services/platform-detector.js';
import { PLATFORMS } from '../constants/platforms.js';
import { extractDom } from '../services/extractor/extractor-engine.js';
import { parseChatGPT } from '../services/parser/chatgpt-parser.js';
import { generateStatistics } from '../services/statistics/statistics-engine.js';
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

  fastify.post('/extract', async (request, reply) => {
    return handleExtract(request, reply, request.body.url);
  });

  fastify.post('/extract/batch', async (request, reply) => {
    const parseResult = batchExtractSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { success: false, error: { code: 'INVALID_REQUEST', message: parseResult.error.errors } };
    }

    const urls = parseResult.data.urls;
    const results = await Promise.all(
      urls.map(url => handleExtract(request, reply, url, true))
    );

    return {
      success: true,
      total: urls.length,
      results
    };
  });
}

// Helper to handle single extraction logic
async function handleExtract(request, reply, url, isBatch = false) {
  const startTime = Date.now();
  
  if (!url) {
    const errorRes = { success: false, error: { code: 'INVALID_REQUEST', message: 'URL is required' } };
    if (!isBatch) reply.status(400);
    return errorRes;
  }
  
  const platform = detectPlatform(url);
  if (platform === PLATFORMS.UNKNOWN) {
    const errorRes = { success: false, error: { code: 'UNSUPPORTED_PLATFORM', message: 'Platform not supported yet.' } };
    if (!isBatch) reply.status(400);
    return errorRes;
  }

  try {
    const extracted = await extractDom(url);
    
    let parsedData;

    // Check if extractor already returned parsed data (Claude/Gemini Playwright extractors)
    if (extracted && extracted.__playwrightExtracted) {
      // Data already extracted via page.evaluate(), skip HTML parser
      parsedData = {
        title: extracted.title,
        messages: extracted.messages,
      };
    } else if (platform === PLATFORMS.CHATGPT) {
      // ChatGPT returns raw HTML — parse with Cheerio
      parsedData = parseChatGPT(extracted);
    } else {
      // Fallback for any other platform returning raw HTML
      const errorRes = { success: false, error: { code: 'UNSUPPORTED_PLATFORM', message: 'Parser not implemented.' } };
      if (!isBatch) reply.status(400);
      return errorRes;
    }

    const processingTime = Date.now() - startTime;
    const stats = generateStatistics(parsedData.messages, processingTime);

    return {
      success: true,
      url,
      platform,
      title: parsedData.title,
      messages: parsedData.messages,
      ...stats
    };

  } catch (error) {
    request.log.error(error);
    const errorRes = {
      success: false,
      url,
      platform,
      error: {
        code: 'EXTRACTION_FAILED',
        message: error.message
      }
    };
    if (!isBatch) reply.status(500);
    return errorRes;
  }
}


