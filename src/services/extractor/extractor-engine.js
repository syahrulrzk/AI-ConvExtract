import { browserManager } from '../browser/browser-manager.js';
import { logger } from '../../utils/logger.js';
import { PLATFORMS } from '../../constants/platforms.js';
import { detectPlatform } from '../platform-detector.js';
import { extractClaude } from './extractor-engine-claude.js';
import { extractGemini } from './extractor-engine-gemini.js';

/**
 * Main extraction entry point.
 * Routes to the correct platform-specific extractor.
 *
 * For ChatGPT: Returns raw HTML (SSR, Cheerio can parse it).
 * For Claude/Gemini: Uses Playwright page.evaluate() to extract
 * rendered data from the SPA DOM before returning.
 *
 * @param {string} url - The share URL to extract
 * @returns {string|{title: string, messages: Array}} - HTML string (ChatGPT) or parsed object (Claude/Gemini)
 */
export async function extractDom(url) {
  const platform = detectPlatform(url);
  logger.info({ url, platform }, 'Starting extraction');

  const browser = await browserManager.getBrowser();
  const context = await browser.newContext({
    // Realistic browser fingerprint to bypass bot detection
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

  try {
    // Navigate to the URL
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for network to settle (handles SPAs)
    try {
      await page.waitForLoadState('networkidle', { timeout: 20000 });
    } catch (e) {
      logger.warn('networkidle wait timed out, continuing anyway');
    }

    // --- Platform-specific extraction ---

    if (platform === PLATFORMS.CLAUDE) {
      // Claude SPA: use Playwright-based extraction
      const data = await extractClaude(page);
      return { __playwrightExtracted: true, ...data };
    }

    if (platform === PLATFORMS.GEMINI) {
      // Gemini SPA: use Playwright-based extraction
      const data = await extractGemini(page);
      return { __playwrightExtracted: true, ...data };
    }

    // ChatGPT and others: SSR page, return HTML for Cheerio parsing
    await page.waitForTimeout(2000);
    const html = await page.content();
    return html;

  } catch (error) {
    logger.error({ url, error }, 'Extraction failed');
    throw new Error('EXTRACTION_FAILED: ' + error.message);
  } finally {
    await page.close();
    await context.close();
  }
}
