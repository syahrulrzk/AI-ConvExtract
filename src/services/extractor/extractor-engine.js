import { browserManager, puppeteerBrowserManager } from '../browser/browser-manager.js';
import { logger } from '../../utils/logger.js';
import { PLATFORMS } from '../../constants/platforms.js';
import { detectPlatform } from '../platform-detector.js';
import { extractClaude } from './extractor-engine-claude.js';
import { extractGemini } from './extractor-engine-gemini.js';
import { collectChatMessages } from './auto-scroll.js';

/**
 * Main extraction entry point.
 * Routes to the correct platform-specific extractor.
 *
 * For ChatGPT: runs BOTH browser engines (Playwright + Puppeteer) as a
 * dual-validation — lazy-loaded share pages render slightly differently per
 * run, so whichever engine captured the most messages is returned.
 * For Claude/Gemini: uses Playwright page.evaluate() extraction.
 *
 * @param {string} url - The share URL to extract
 * @returns {string|{title: string, messages: Array}} - HTML string (ChatGPT) or parsed object (Claude/Gemini)
 */
export async function extractDom(url, signal) {
  const platform = detectPlatform(url);
  logger.info({ url, platform }, 'Starting extraction');

  if (signal?.aborted) throw abortError();

  if (platform === PLATFORMS.CLAUDE || platform === PLATFORMS.GEMINI) {
    return extractWithPlaywright(url, platform, signal);
  }

  if (platform === PLATFORMS.CHATGPT) {
    return extractChatDualEngine(url, signal);
  }

  throw new Error('UNSUPPORTED_PLATFORM');
}

function abortError() {
  const err = new Error('EXTRACTION_TIMEOUT: extraction aborted');
  err.code = 'EXTRACTION_TIMEOUT';
  return err;
}

// Helper: throw if the job's abort signal fired (checked inside long loops)
function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

// ──────────────────────────────────────────────────────────────────────────
// Playwright helpers
// ──────────────────────────────────────────────────────────────────────────

// Shared context setup + navigation used by every Playwright extraction.
// Returns an open context+page; caller is responsible for closing both.
async function createPlaywrightPage(url) {
  const browser = await browserManager.getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
  });
  const page = await context.newPage();

  // Remove the webdriver property that some sites check via JavaScript
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for network to settle (handles SPAs)
  try {
    await page.waitForLoadState('networkidle', { timeout: 20000 });
  } catch (e) {
    logger.warn('networkidle wait timed out, continuing anyway');
  }

  return { context, page };
}

// ──────────────────────────────────────────────────────────────────────────
// Playwright path (Claude / Gemini SPA extraction)
// ──────────────────────────────────────────────────────────────────────────
async function extractWithPlaywright(url, platform) {
  let context;
  let page;
  try {
    ({ context, page } = await createPlaywrightPage(url));

    if (platform === PLATFORMS.CLAUDE) {
      const data = await extractClaude(page);
      return { __playwrightExtracted: true, ...data };
    }

    if (platform === PLATFORMS.GEMINI) {
      const data = await extractGemini(page);
      return { __playwrightExtracted: true, ...data };
    }

    throw new Error('EXTRACTION_FAILED: unsupported platform for Playwright extractor');
  } catch (error) {
    logger.error({ url, error }, 'Playwright extraction failed');
    throw new Error('EXTRACTION_FAILED: ' + error.message);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

// ──────────────────────────────────────────────────────────────────────────
// ChatGPT dual-engine (Playwright + Puppeteer) — pick the most complete HTML
// ──────────────────────────────────────────────────────────────────────────

async function extractChatWithPlaywright(url, signal) {
  let context;
  let page;
  try {
    ({ context, page } = await createPlaywrightPage(url));

    // Virtualized share pages only render messages near the viewport, so we
    // scroll through the whole conversation and collect messages per position.
    const { messages, truncated } = await collectChatMessages(page, signal);
    const title =
      (await page.title()).replace(/ChatGPT/gi, '').trim() || 'ChatGPT Conversation';
    return { __chatExtracted: true, title, messages, truncated };
  } catch (error) {
    logger.error({ url, error }, 'Playwright ChatGPT extraction failed');
    throw new Error('EXTRACTION_FAILED: ' + error.message);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

async function extractChatWithPuppeteer(url, signal) {
  const browser = await puppeteerBrowserManager.getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
      await page.waitForNetworkIdle({ timeout: 20000 });
    } catch (e) {
      logger.warn('Puppeteer: networkidle wait timed out, continuing anyway');
    }

    // Virtualized share pages only render messages near the viewport, so we
    // scroll through the whole conversation and collect messages per position.
    const { messages, truncated } = await collectChatMessages(page, signal);
    const title =
      (await page.title()).replace(/ChatGPT/gi, '').trim() || 'ChatGPT Conversation';
    return { __chatExtracted: true, title, messages, truncated };
  } catch (error) {
    logger.error({ url, error }, 'Puppeteer ChatGPT extraction failed');
    throw new Error('EXTRACTION_FAILED: ' + error.message);
  } finally {
    await page.close();
  }
}

/**
 * Runs Playwright + Puppeteer in parallel and returns the result of whichever
 * engine collected the MOST messages. This hedges against lazy-render
 * variance: occasionally an engine misses a turn, so the fuller result (the
 * "correct" one) wins.
 */
async function extractChatDualEngine(url, signal) {
  const [pwResult, ppResult] = await Promise.allSettled([
    extractChatWithPlaywright(url, signal),
    extractChatWithPuppeteer(url, signal),
  ]);

  const candidates = [];

  if (pwResult.status === 'fulfilled') {
    candidates.push({ engine: 'playwright', result: pwResult.value });
  } else {
    logger.warn({ error: pwResult.reason?.message }, 'Playwright engine failed');
  }

  if (ppResult.status === 'fulfilled') {
    candidates.push({ engine: 'puppeteer', result: ppResult.value });
  } else {
    logger.warn({ error: ppResult.reason?.message }, 'Puppeteer engine failed');
  }

  if (candidates.length === 0) {
    throw new Error(
      'EXTRACTION_FAILED: both engines failed. Playwright: ' +
      (pwResult.reason?.message || 'n/a') + ' | Puppeteer: ' +
      (ppResult.reason?.message || 'n/a')
    );
  }

  // Pick the candidate with the most messages (tie → first/playwright)
  let best = candidates[0];
  let bestCount = -1;

  for (const candidate of candidates) {
    const count = candidate.result.messages.length;
    const promptCount = candidate.result.messages.filter((m) => m.role === 'user').length;
    logger.info(
      { engine: candidate.engine, messageCount: count, promptCount, truncated: !!candidate.result.truncated },
      'Dual-engine candidate result'
    );
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  logger.info(
    { chosenEngine: best.engine, messageCount: bestCount },
    'Dual-engine extraction complete'
  );

  // If the chosen engine ran out of time but the other is complete, prefer the
  // complete one (more trustworthy) as long as it has at least as many messages.
  if (best.result.truncated && candidates.length > 1) {
    const complete = candidates.find((c) => !c.result.truncated && c.result.messages.length >= best.result.messages.length);
    if (complete) {
      logger.info({ chosenEngine: complete.engine }, 'Switching to complete (non-truncated) engine result');
      return complete.result;
    }
  }

  return best.result;
}
