import { logger } from '../../utils/logger.js';

/**
 * Extracts conversation data from Gemini share links using Playwright.
 * Handles both share.gemini.google and gemini.google.com share URLs.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {{ title: string, messages: Array<{role: string, content: string}> }}
 */
export async function extractGemini(page) {
  logger.info('Extracting Gemini conversation via Playwright');

  // Wait for the conversation content to appear
  try {
    await page.waitForSelector(
      '[data-turn-role], [class*="conversation"], [class*="message"], ' +
      'model-response, user-query, .model-response, .user-query, ' +
      '[class*="turn"], [class*="Turn"]',
      { timeout: 15000 }
    );
  } catch (e) {
    logger.warn('Gemini: Timeout waiting for message selectors, trying to extract anyway');
  }

  // Extra buffer for Angular/React hydration
  await page.waitForTimeout(2500);

  // Get full page text for debugging
  const fullPageText = await page.evaluate(() => document.body?.innerText || '');
  const youSaidCount = (fullPageText.match(/You said/g) || []).length;
  logger.info({ youSaidCount, textLength: fullPageText.length, textPreview: fullPageText.substring(0, 500) }, 'Gemini page text debug');

  const result = await page.evaluate(() => {
    const messages = [];

    // Helper: deduplicate messages
    function deduplicate(msgs) {
      return msgs.filter((msg, i) => {
        return !msgs.some((other, j) => {
          if (i === j) return false;
          return other.content === msg.content && i > j;
        });
      });
    }

    // Helper: keep outermost elements
    function keepOutermost(elements) {
      return elements.filter(el => {
        return !elements.some(other => other !== el && other.contains(el));
      });
    }

    // Strategy 1: data-turn-role attribute (Gemini's Angular components sometimes expose this)
    const turnEls = document.querySelectorAll('[data-turn-role]');
    if (turnEls.length > 0) {
      turnEls.forEach(el => {
        const role = el.getAttribute('data-turn-role') === 'user' ? 'user' : 'assistant';
        const content = el.innerText?.trim();
        if (content && !content.includes('You said')) {
          messages.push({ role, content });
        }
      });
    }

    // Strategy 2: Look for actual message containers with text content
    if (messages.length === 0) {
      // Find the main conversation container
      const mainContent = document.querySelector('main') || 
                          document.querySelector('[role="main"]') || 
                          document.querySelector('.conversation') ||
                          document.querySelector('[class*="conversation"]') ||
                          document.body;
      
      // Get all text content and split by "You said" pattern
      const fullText = mainContent.innerText || '';
      
      // Split by "You said" to identify conversation turns
      const parts = fullText.split('You said');
      
      // Process each part - each "You said" marks the start of a user message
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part || part.length < 5) continue;
        
        // Remove UI metadata that might be mixed in
        const cleanedPart = part
          .replace(/Dibuat dengan.*$/gm, '')
          .replace(/Dipublikasikan.*$/gm, '')
          .replace(/Created with.*$/gm, '')
          .replace(/Published.*$/gm, '')
          .replace(/pukul.*$/gm, '')
          .replace(/Sign in.*$/gm, '')
          .replace(/Opens in a new window.*$/gm, '')
          .replace(/Privacy Policy.*$/gm, '')
          .replace(/Terms of Service.*$/gm, '')
          .replace(/About Gemini.*$/gm, '')
          .replace(/Get Gemini App.*$/gm, '')
          .replace(/Subscriptions.*$/gm, '')
          .replace(/For Business.*$/gm, '')
          .replace(/Google apps.*$/gm, '')
          .replace(/Your privacy.*$/gm, '')
          .replace(/Gemini may display inaccurate.*$/gm, '')
          .replace(/User Prompt.*$/gm, '')
          .replace(/^Google$/gm, '')
          .trim();
        
        if (!cleanedPart || cleanedPart.length < 5) continue;
        
        // Split by double newlines to separate user message from assistant response
        // Gemini format: "You said\n\n[user message]\n\n[assistant response]"
        const sections = cleanedPart.split('\n\n').map(s => s.trim()).filter(s => s);
        
        if (sections.length >= 1) {
          // First section after "You said" is the user message
          const userMsg = sections[0].trim();
          if (userMsg && userMsg.length > 2) {
            messages.push({ role: 'user', content: userMsg });
          }
          
          // Second section (if exists) is the assistant response
          if (sections.length >= 2) {
            let assistantMsg = sections.slice(1).join('\n\n').trim();
            // Remove standalone "Google" lines
            assistantMsg = assistantMsg.split('\n')
              .filter(line => line.trim() !== 'Google')
              .join('\n')
              .trim();
            if (assistantMsg && assistantMsg.length > 2) {
              messages.push({ role: 'assistant', content: assistantMsg });
            }
          }
        }
      }
    }

    // Strategy 3: Look for specific Gemini patterns
    if (messages.length === 0) {
      const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
      const children = Array.from(main.children);
      
      children.forEach((el, idx) => {
        const text = el.innerText?.trim();
        if (text && text.length > 10 && text.length < 10000) {
          // Clean up any prefixes
          let cleanText = text.replace(/^You said\n\n/g, '').trim();
          if (cleanText.length > 5) {
            messages.push({
              role: idx % 2 === 0 ? 'user' : 'assistant',
              content: cleanText
            });
          }
        }
      });
    }

    // Deduplicate
    const cleaned = deduplicate(messages);

    // Extract title
    const title =
      document.querySelector('h1')?.innerText?.trim() ||
      document.querySelector('[class*="title"]')?.innerText?.trim() ||
      document.title?.replace(/gemini/gi, '').trim() ||
      'Gemini Conversation';

    return { title, messages: cleaned };
  });

  logger.info({ messageCount: result.messages.length }, 'Gemini extraction complete');

  if (result.messages.length === 0) {
    logger.warn('Gemini: No messages extracted. The share page DOM may have changed.');
  }

  return result;
}
