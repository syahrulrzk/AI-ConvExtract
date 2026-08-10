import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';

export function parseGemini(html) {
  const $ = cheerio.load(html);
  const messages = [];

  // Note: These selectors are placeholders. Actual Gemini selectors need reverse engineering.
  $('.message-container, .gemini-msg').each((_, el) => {
    const text = $(el).text().trim();
    const isUser = $(el).attr('data-author') === 'user' || $(el).hasClass('user-msg');
    const role = isUser ? 'user' : 'assistant';
    
    if (text) {
      messages.push({ role, content: text });
    }
  });

  if (messages.length === 0) {
    logger.warn('No messages found for Gemini using standard selectors.');
  }

  const title = $('title').text().replace('Gemini', '').trim() || 'Gemini Conversation';

  return { title, messages };
}
