import { chromium as playwrightChromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../../utils/logger.js';

// Apply the stealth plugin — patches ~20+ browser fingerprinting tells:
// navigator.webdriver, chrome runtime, plugins, permissions, etc.
playwrightChromium.use(StealthPlugin());

class BrowserManager {
  constructor() {
    this.browser = null;
  }

  async getBrowser() {
    if (!this.browser) {
      logger.info('Launching stealth Playwright Chromium instance...');
      this.browser = await playwrightChromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          // Prevent "Chrome is controlled by automated software" banner
          '--disable-infobars',
        ],
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
