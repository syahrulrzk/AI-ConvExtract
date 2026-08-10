import { logger } from '../../utils/logger.js';

/**
 * Extracts conversation data from Claude share links using Playwright.
 * Handles Cloudflare challenge detection and properly de-duplicates
 * nested element extraction.
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {{ title: string, messages: Array<{role: string, content: string}> }}
 */
export async function extractClaude(page) {
  logger.info('Extracting Claude conversation via Playwright');

  // --- Step 1: Wait for Cloudflare challenge to clear ---
  try {
    await page.waitForFunction(() => {
      const bodyText = document.body?.innerText?.toLowerCase() || '';
      return !(
        bodyText.includes('verifying you are not a bot') ||
        bodyText.includes('security service') ||
        bodyText.includes('checking your browser') ||
        bodyText.includes('enable javascript and cookies')
      );
    }, { timeout: 25000 });
    logger.info('Claude: Security challenge cleared');
  } catch (e) {
    logger.warn('Claude: Could not confirm security challenge cleared — continuing anyway');
  }

  // --- Step 2: Wait for conversation content ---
  try {
    await page.waitForSelector(
      '[data-testid="human-turn"], [data-testid="ai-turn"], ' +
      '.font-claude-message, article',
      { timeout: 20000 }
    );
  } catch (e) {
    logger.warn('Claude: Timeout waiting for message selectors, extracting anyway');
  }

  await page.waitForTimeout(2000);

  const pageTitle = await page.title();
  logger.info({ pageTitle }, 'Claude page title');

  // --- Step 3: Extract messages ---
  const result = await page.evaluate(() => {
    /**
     * Filter elements so we only keep the "outermost" matches.
     * This prevents extracting both a container AND its children.
     */
    function keepOutermost(elements) {
      return elements.filter(el => {
        return !elements.some(other => other !== el && other.contains(el));
      });
    }

    /**
     * Deduplicate messages: remove entries whose text is fully contained
     * within another entry (handles partial overlap from nested selectors).
     */
    function deduplicate(msgs) {
      return msgs.filter((msg, i) => {
        return !msgs.some((other, j) => {
          if (i === j) return false;
          // Remove msg if another message fully contains its text
          return other.content.includes(msg.content) && other.content.length > msg.content.length;
        });
      });
    }

    const messages = [];

    // ── Strategy 1: data-testid (Claude's actual share page attributes) ──
    const humanEls = keepOutermost(Array.from(document.querySelectorAll('[data-testid="human-turn"]')));
    const aiEls    = keepOutermost(Array.from(document.querySelectorAll('[data-testid="ai-turn"]')));
    // Additional selectors for Claude share links
    const userEls  = keepOutermost(Array.from(document.querySelectorAll('[data-testid="user-turn"], [data-testid="user-message"]')));
    const assistantEls = keepOutermost(Array.from(document.querySelectorAll('[data-testid="assistant-turn"], [data-testid="assistant-message"]')));
    // Try broader selectors for Claude's actual structure
    const allUserEls = keepOutermost(Array.from(document.querySelectorAll('[class*="user"], [class*="human"], [class*="prompt"]')));
    const allAiEls = keepOutermost(Array.from(document.querySelectorAll('[class*="assistant"], [class*="ai"], [class*="claude"], [class*="response"]')));

    if (humanEls.length > 0 || aiEls.length > 0 || userEls.length > 0 || assistantEls.length > 0 || allUserEls.length > 0 || allAiEls.length > 0) {
      const allTurns = [
        ...humanEls.map(el => ({ el, role: 'user' })),
        ...userEls.map(el => ({ el, role: 'user' })),
        ...allUserEls.map(el => ({ el, role: 'user' })),
        ...aiEls.map(el => ({ el, role: 'assistant' })),
        ...assistantEls.map(el => ({ el, role: 'assistant' })),
        ...allAiEls.map(el => ({ el, role: 'assistant' })),
      ].sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      for (const { el, role } of allTurns) {
        const content = el.innerText?.trim();
        if (content && content.length > 0) {
          messages.push({ role, content });
        }
      }
    }

    // ── Strategy 2: Claude-specific class patterns ──
    // Claude share pages wrap turns in divs with role-specific class patterns.
    // We look for containers that are SIBLINGS (same parent = alternating turns).
    if (messages.length === 0) {
      // Find the conversation container
      const convContainer =
        document.querySelector('[class*="conversation"]') ||
        document.querySelector('[class*="thread"]') ||
        document.querySelector('main') ||
        document.body;

      // Get all direct or near-direct children that look like turns
      const allDivs = Array.from(convContainer.querySelectorAll('div[class]'));

      // Look for elements containing human-message or claude-message markers
      const humanCandidates = keepOutermost(
        allDivs.filter(el => {
          const cls = el.className.toLowerCase();
          return cls.includes('human') || cls.includes('user-message') || cls.includes('human-message') || cls.includes('user-turn') || cls.includes('prompt');
        })
      );
      const aiCandidates = keepOutermost(
        allDivs.filter(el => {
          const cls = el.className.toLowerCase();
          return (cls.includes('claude') || cls.includes('ai-message') || cls.includes('assistant') || cls.includes('ai-turn') || cls.includes('response')) &&
            !cls.includes('human');
        })
      );

      if (humanCandidates.length > 0 || aiCandidates.length > 0) {
        const combined = [
          ...humanCandidates.map(el => ({ el, role: 'user' })),
          ...aiCandidates.map(el => ({ el, role: 'assistant' })),
        ].sort((a, b) => {
          const pos = a.el.compareDocumentPosition(b.el);
          return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        for (const { el, role } of combined) {
          const content = el.innerText?.trim();
          if (content && content.length > 5) messages.push({ role, content });
        }
      }
    }

    // ── Strategy 3: font-claude-message + parent heuristic ──
    // Claude share page uses `.font-claude-message` for AI responses.
    // We walk up to find the turn-level container, then find sibling user turns.
    if (messages.length === 0) {
      const claudeEls = Array.from(document.querySelectorAll('.font-claude-message, [class*="font-claude"]'));
      const turnContainers = new Set();

      claudeEls.forEach(el => {
        // Walk up a few levels to find the turn container
        let node = el;
        for (let i = 0; i < 5; i++) {
          if (!node.parentElement) break;
          node = node.parentElement;
          if (node.children.length > 1 || i >= 3) break;
        }
        turnContainers.add(node);
      });

      keepOutermost(Array.from(turnContainers)).forEach(el => {
        const content = el.innerText?.trim();
        if (content && content.length > 5) messages.push({ role: 'assistant', content });
      });
    }

    // ── Strategy 4: Article-based (generic fallback) ──
    if (messages.length === 0) {
      const articles = keepOutermost(Array.from(document.querySelectorAll('article')));
      articles.forEach((el, idx) => {
        const content = el.innerText?.trim();
        if (content && content.length > 10) {
          messages.push({ role: idx % 2 === 0 ? 'user' : 'assistant', content });
        }
      });
    }

    // ── Strategy 5: Last resort — large text blocks from main ──
    if (messages.length === 0) {
      const main = document.querySelector('main') || document.body;
      // Only grab direct children divs with substantial content
      Array.from(main.children).forEach((el, idx) => {
        const content = el.innerText?.trim();
        if (content && content.length > 50) {
          messages.push({ role: idx % 2 === 0 ? 'user' : 'assistant', content });
        }
      });
    }

    // Deduplicate to remove substring-duplicates from nested element matching
    const cleaned = deduplicate(messages);

    // Extract title
    const title =
      document.querySelector('h1')?.innerText?.trim() ||
      document.querySelector('[class*="title"]')?.innerText?.trim() ||
      document.title?.replace(/claude\.ai/gi, '').replace(/\|/g, '').trim() ||
      'Claude Conversation';

    return { title, messages: cleaned };
  });

  logger.info({ messageCount: result.messages.length, title: result.title }, 'Claude extraction complete');

  if (result.messages.length === 0) {
    logger.warn('Claude: No messages extracted. Page may still be behind Cloudflare.');
  }

  return result;
}
