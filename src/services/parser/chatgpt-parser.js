import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';

export function parseChatGPT(html) {
  const $ = cheerio.load(html);
  const messages = [];

  // Assuming ChatGPT shared conversations have divs with data-message-author-role
  // We may need to refine the selector based on the exact DOM of ChatGPT share links.
  $('[data-message-author-role]').each((_, el) => {
    const role = $(el).attr('data-message-author-role');
    // Extract text content. In reality, we might want markdown or structured text.
    const content = $(el).text().trim();

    if (role === 'user' || role === 'assistant') {
      messages.push({ role, content });
    }
  });

  // Fallback if the selector changed
  if (messages.length === 0) {
    logger.warn('No messages found using data-message-author-role. Trying fallback parsing.');
    // Add fallback logic here later if needed
  }

  // Find the title (usually in a h1 or title tag)
  const title = $('title').text().replace('ChatGPT', '').trim() || 'ChatGPT Conversation';

  return { title, messages };
}

