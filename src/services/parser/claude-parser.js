import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';

export function parseClaude(html) {
  const $ = cheerio.load(html);
  const messages = [];

  // Note: These selectors are placeholders. Actual Claude selectors need reverse engineering of their share links.
  // Claude typically uses divs with distinct classes for human and AI messages.
  $('.message, .font-claude-message').each((_, el) => {
    const text = $(el).text().trim();
    // Crude detection for placeholder purposes
    const isHuman = $(el).hasClass('human-message') || $(el).text().startsWith('Human:');
    const role = isHuman ? 'user' : 'assistant';
    
    if (text) {
      messages.push({ role, content: text });
    }
  });

  if (messages.length === 0) {
    logger.warn('No messages found for Claude using standard selectors.');
    // Add fallback logic here
  }

  const title = $('title').text().replace('Claude', '').trim() || 'Claude Conversation';

  return { title, messages };
}
