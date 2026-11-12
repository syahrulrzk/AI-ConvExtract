import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger.js';

// Patterns for ChatGPT attachment placeholders (no actual file data is embedded
// in the share page DOM — only a placeholder text like "Uploaded an image").
// Anchored to the FULL string so real text is never replaced (e.g. a prompt
// that says "Uploaded an image of the error" stays untouched).
const IMAGE_UPLOAD_RE = /^uploaded\s+(an?\s+|one\s+|\d+\s+)?(image|images|photo|photos|screenshot|screenshots)\s*$/i;
const FILE_UPLOAD_RE = /^uploaded\s+(a\s+|one\s+|\d+\s+)?(file|files|document|documents|pdf|pdfs|attachment|attachments)\s*$/i;

/**
 * Normalize a raw message. Attachment uploads render as placeholder text only
 * (e.g. "Uploaded an image") because ChatGPT share pages don't embed the actual
 * file data. We surface that clearly via `content` + an `attachments` array.
 */
export function normalizeMessage(role, raw) {
  const content = raw.trim();
  const attachments = [];

  if (role === 'user') {
    if (IMAGE_UPLOAD_RE.test(content)) {
      attachments.push('image');
      return { content: '[User uploaded an image]', attachments };
    }
    if (FILE_UPLOAD_RE.test(content)) {
      attachments.push('file');
      return { content: '[User uploaded a file]', attachments };
    }
  }

  return { content, attachments };
}

export function parseChatGPT(html) {
  const $ = cheerio.load(html);
  const messages = [];

  // ChatGPT currently uses data-message-role on conversation <li>s. Older
  // share pages used data-message-author-role on message wrappers.
  $('[data-message-author-role], [data-message-role]').each((_, el) => {
    const role = $(el).attr('data-message-author-role') || $(el).attr('data-message-role');
    // Extract text content. In reality, we might want markdown or structured text.
    const raw = $(el).text().trim();

    if (role === 'user' || role === 'assistant') {
      const { content, attachments } = normalizeMessage(role, raw);
      const msg = { role, content };
      if (attachments.length > 0) msg.attachments = attachments;
      messages.push(msg);
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

