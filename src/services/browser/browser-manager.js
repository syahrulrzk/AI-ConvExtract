import { existsSync } from 'node:fs';
import { chromium as playwrightChromium } from 'playwright-extra';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../../utils/logger.js';

// Apply the stealth plugin — patches ~20+ browser fingerprinting tells:
// navigator.webdriver, chrome runtime, plugins, permissions, etc.
playwrightChromium.use(StealthPlugin());
puppeteerExtra.use(StealthPlugin());

const SHARED_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  // Prevent "Chrome is controlled by automated software" banner
  '--disable-infobars',
];

// Resolve a usable system Chrome binary for Puppeteer (env override first,
// then common Linux locations). Falls back to null → Puppeteer's default.
function resolveChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch (e) { /* ignore */ }
  }
  return undefined;
}

class BrowserManager {
  constructor() {
    this.browser = null;
  }

  async getBrowser() {
    if (!this.browser) {
      logger.info('Launching stealth Playwright Chromium instance...');
      this.browser = await playwrightChromium.launch({
        headless: true,
        args: SHARED_LAUNCH_ARGS,
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      logger.info('Closing Playwright Chromium instance...');
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const browserManager = new BrowserManager();

class PuppeteerBrowserManager {
  constructor() {
    this.browser = null;
  }

  async getBrowser() {
    if (!this.browser) {
      logger.info('Launching stealth Puppeteer Chromium instance (system Chrome)...');
      this.browser = await puppeteerExtra.launch({
        headless: true,
        // Use the system-installed Chrome instead of downloading a browser bundle
        executablePath: resolveChromeExecutable(),
        args: SHARED_LAUNCH_ARGS,
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      logger.info('Closing Puppeteer Chromium instance...');
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const puppeteerBrowserManager = new PuppeteerBrowserManager();
