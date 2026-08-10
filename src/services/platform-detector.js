import { PLATFORMS } from '../constants/platforms.js';

export function detectPlatform(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // ChatGPT: chatgpt.com/share/... or openai.com
    if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
      return PLATFORMS.CHATGPT;
    }

    // Claude: claude.ai/share/... or share.claude.ai/...
    if (hostname.includes('claude.ai') || hostname === 'share.claude.ai') {
      return PLATFORMS.CLAUDE;
    }

    // Gemini: gemini.google.com or share.gemini.google (subdomain format)
    if (
      hostname.includes('gemini.google.com') ||
      hostname === 'share.gemini.google' ||
      hostname.endsWith('.gemini.google')
    ) {
      return PLATFORMS.GEMINI;
    }

    return PLATFORMS.UNKNOWN;
  } catch (err) {
    return PLATFORMS.UNKNOWN;
  }
}
