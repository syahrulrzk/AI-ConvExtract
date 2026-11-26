import { PLATFORMS } from '../constants/platforms.js';

/**
 * Validate platform-specific share URL formats so we can fail fast with a
 * helpful error instead of queueing a job that will never complete.
 *
 * Currently the strictest validation is for ChatGPT: this service extracts
 * public share pages (typically `/share/...`). Links like `/s/...` often
 * require login and may not contain the full conversation content.
 *
 * @param {string} url
 * @param {string} platform - one of PLATFORMS.*
 * @returns {{ ok: true } | { ok: false, error: { code: string, message: string, reason: string, retryable: boolean } }}
 */
export function validateShareUrl(url, platform) {
  if (platform !== PLATFORMS.CHATGPT) return { ok: true };

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname || '/';

    const isChatgptHost = host.includes('chatgpt.com') || host.includes('openai.com');
    if (!isChatgptHost) return { ok: true };

    // Public share links: https://chatgpt.com/share/<id> (historical format)
    if (path.startsWith('/share/')) return { ok: true };

    // Known non-share formats (often login-gated or not a full conversation page)
    if (path.startsWith('/s/')) {
      return {
        ok: false,
        error: {
          code: 'INVALID_SHARE_URL',
          message: 'ChatGPT URL format is not supported.',
          reason: 'Use a public ChatGPT share link that starts with https://chatgpt.com/share/… (not /s/…).',
          retryable: false,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: 'INVALID_SHARE_URL',
        message: 'ChatGPT URL format is not supported.',
        reason: 'Use a public ChatGPT share link that starts with https://chatgpt.com/share/…',
        retryable: false,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: 'INVALID_SHARE_URL',
        message: 'Invalid URL.',
        reason: 'Provide a full URL (including https://).',
        retryable: false,
      },
    };
  }
}

