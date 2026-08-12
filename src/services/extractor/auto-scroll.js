import { logger } from '../../utils/logger.js';
import { normalizeMessage } from '../parser/chatgpt-parser.js';

const EXPAND_KEYWORDS = [
  'show more', 'continue reading', 'load more', 'read more',
  'view earlier', 'see more', 'lihat lebih', 'tampilkan lebih', 'selengkapnya',
];

// Hard safety cap on total collection time per page (configurable via env).
// If exceeded, we return whatever messages were gathered + truncated: true.
const COLLECT_TIMEOUT_MS = Number(process.env.EXTRACT_COLLECT_TIMEOUT_MS) || 120_000;
// Ceiling for the auto-scaled budget — very long chats (200+ prompts) get up
// to this much collection time, kept under the 1-hour job timeout in queue.js
// so the abort signal can still fire in time.
const MAX_COLLECT_TIMEOUT_MS = Number(process.env.EXTRACT_COLLECT_MAX_TIMEOUT_MS) || 3_000_000;
// Step ceiling: generous enough for very long chats; the time budget is the
// real guard (if MAX_STEPS is hit before the bottom, we mark truncated).
const MAX_STEPS = 2000;

/**
 * ChatGPT share pages are VIRTUALIZED: only messages near the viewport exist
 * in the DOM at any moment — a single HTML capture is never complete.
 *
 * This helper scrolls the inner scroll container in TWO passes — top → bottom
 * with adaptive step growth (fast over empty stretches, still capped at ~1
 * viewport so clusters are rarely skipped), then bottom → top with a fine
 * base step that RECOVERS any cluster the first pass jumped over. It clicks
 * any "Show more" buttons along the way, and at every position collects the
 * currently-rendered messages keyed by their stable
 * `data-testid="conversation-turn-<id>"` attribute. The merged, deduplicated,
 * order-preserved result is returned — works with BOTH Playwright and
 * Puppeteer pages (only `page.evaluate` + a generic sleep are used).
 *
 * The collection budget scales with the conversation size (never silently
 * cutting long chats short). It stops early once the true bottom is reached
 * and no new messages appear. If the time budget runs out, the partial
 * result is flagged with `truncated: true`.
 *
 * @param {import('playwright').Page|import('puppeteer-core').Page} page
 * @param {AbortSignal} [signal] - abort signal from the job timeout
 * @returns {Promise<{messages: Array<{role: string, content: string, attachments?: string[]}>, truncated: boolean}>}
 */
export async function collectChatMessages(page, signal) {
  const throwIfAborted = () => {
    if (signal?.aborted) {
      const err = new Error('EXTRACTION_TIMEOUT: extraction aborted');
      err.code = 'EXTRACTION_TIMEOUT';
      throw err;
    }
  };

  const startedAt = Date.now();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const collected = new Map(); // key -> { key, role, content, _seq }
  let fallbackSeq = 0;
  let truncated = false;
  // Default budget; scaled up below based on the conversation's size.
  let effectiveTimeoutMs = COLLECT_TIMEOUT_MS;

  const timeLeft = () => effectiveTimeoutMs - (Date.now() - startedAt);
  const timeBudgetExhausted = () => timeLeft() < 3000;

  // Find the biggest inner scroll container and reset to the top
  const container = await page.evaluate(() => {
    let best = null;
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      if (el.scrollHeight > el.clientHeight + 50 && (!best || el.scrollHeight > best.scrollHeight)) {
        best = el;
      }
    }
    if (best) {
      best.dataset.__chatScrollRoot = '1';
      best.scrollTop = 0;
    }
    window.scrollTo(0, 0);
    return best ? { scrollHeight: best.scrollHeight, clientHeight: best.clientHeight } : null;
  });

  if (!container) {
    logger.warn('No scrollable container found on ChatGPT share page');
    const raw = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-message-author-role]'))
        .map((el) => ({ role: el.getAttribute('data-message-author-role'), content: el.textContent.trim() }))
    );
    return { messages: snapshotToMessages(raw), truncated: false };
  }

  let { scrollHeight, clientHeight } = container;
  // Adaptive step for pass 1: start small (so nothing is missed), grow modestly
  // when no messages render for a while. The ceiling stays around one viewport
  // so big jumps can never skip past a virtualized cluster of messages.
  let step = Math.max(200, Math.round(clientHeight * 0.4));
  const maxStepSize = Math.max(step * 3, Math.round(clientHeight * 1.2));
  const baseStep = step; // fine-grained step used for the recovery pass

  // Scale the collection budget to the conversation size so long chats aren't
  // silently cut off. Budget on the FULL fine-grained traversal: real per-step
  // cost is ~500ms (wait + 2 evaluate round-trips), and virtualized containers
  // grow while scrolling, so pad the step estimate by 1.5x.
  const stepsNeeded = Math.ceil((scrollHeight * 1.5) / baseStep);
  effectiveTimeoutMs = Math.min(
    MAX_COLLECT_TIMEOUT_MS,
    Math.max(COLLECT_TIMEOUT_MS, Math.ceil(stepsNeeded * 500))
  );
  logger.info({ scrollHeight, clientHeight, stepsNeeded, budgetMs: effectiveTimeoutMs }, 'Collection budget scaled');

  const snapshot = async () => {
    const data = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[data-message-author-role]'));
      const outer = els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
      const root = document.querySelector('[data-__chat-scroll-root="1"]');
      return {
        // Virtualized containers GROW as content loads — report the live
        // height so the early-exit / step math never uses a stale value.
        liveScrollHeight: root ? root.scrollHeight : 0,
        raw: outer.map((el) => {
          // Find the stable conversation-turn id (walk up the ancestors)
          let node = el;
          let id = null;
          while (node) {
            const tid = node.getAttribute && node.getAttribute('data-testid');
            if (tid && /^conversation-turn-\d+$/.test(tid)) { id = tid; break; }
            node = node.parentElement;
          }
          return {
            id,
            role: el.getAttribute('data-message-author-role'),
            content: el.textContent.trim(),
          };
        }),
      };
    });

    if (data.liveScrollHeight > scrollHeight) scrollHeight = data.liveScrollHeight;

    let added = 0;
    for (const msg of data.raw) {
      if (msg.role !== 'user' && msg.role !== 'assistant') continue;
      // Keyed by stable turn id when available; otherwise dedupe by content
      // so the same message seen at multiple scroll positions collapses.
      const key = msg.id || `__fb_${msg.role}_${msg.content.length}_${msg.content}`;
      if (!collected.has(key)) {
        collected.set(key, { key, role: msg.role, content: msg.content, _seq: fallbackSeq++ });
        added++;
      }
    }
    return added;
  };

  const clickExpandButtons = async () => {
    const clicked = await page.evaluate((keywords) => {
      let any = false;
      const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (const el of candidates) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (text.length > 0 && text.length < 80 && keywords.some((k) => text.includes(k))) {
          try { el.click(); any = true; } catch (e) { /* ignore */ }
        }
      }
      return any;
    }, EXPAND_KEYWORDS);
    if (clicked) await wait(1200);
  };

  const scrollTo = async (pos) => {
    // Returns true when the container actually reached its true bottom
    // (scrollTop clamps to the max scrollable offset, so this is reliable
    // even when the virtualized container grows while we scroll).
    return page.evaluate((p) => {
      const el = document.querySelector('[data-__chat-scroll-root="1"]');
      if (el) el.scrollTop = p;
      window.scrollBy(0, window.innerHeight / 2);
      return el ? el.scrollTop >= el.scrollHeight - el.clientHeight - 50 : false;
    }, pos);
  };

  // ── Pass 1: scroll top → bottom with adaptive steps ──
  await clickExpandButtons();
  await snapshot();
  let pos = 0;
  let noNewStreak = 0;
  let sawBottom = false;
  for (let i = 1; i <= MAX_STEPS; i++) {
    throwIfAborted();
    // Budget fired: only call it truncated if we haven't yet reached the
    // bottom — otherwise the collection is complete and just ran long.
    if (timeBudgetExhausted()) { if (!sawBottom) truncated = true; break; }

    pos = Math.min(scrollHeight, pos + step);
    const atBottom = await scrollTo(pos);
    await wait(200);
    await clickExpandButtons();

    const added = await snapshot();
    if (added > 0) {
      noNewStreak = 0;
      step = baseStep; // back to fine-grained when messages appear
    } else {
      noNewStreak++;
      // Speed up across "empty" stretches: modestly larger jumps (still
      // capped ~1 viewport so virtualized clusters are rarely skipped)
      step = Math.min(maxStepSize, Math.round(step * 1.5));
    }

    if (atBottom) sawBottom = true;
    // Early exit: we've seen the bottom AND no new messages appeared for a
    // few steps (gives the growing virtualized container time to settle).
    if (sawBottom && noNewStreak >= 3) break;
  }

  // Incomplete ONLY if we never saw the bottom — i.e. the step ceiling was
  // hit mid-page. A growing container makes raw scrollTop comparisons
  // unreliable, so base truncation on having reached the bottom at all.
  if (!sawBottom && !truncated) {
    truncated = true;
    logger.warn({ pos, scrollHeight }, 'MAX_STEPS reached before page bottom — result truncated');
  }

  // ── Pass 2 (recovery): scroll bottom → top with the fine base step ──
  // Pass 1's adaptive jumps can skip a virtualized cluster that only renders
  // between two visited positions; this pass re-visits EVERY baseStep
  // position from the live bottom to the top and merges anything missed. It
  // only stops early after many consecutive empty steps, so it genuinely
  // re-scans the page rather than breaking on the first already-seen region.
  await scrollTo(scrollHeight);
  await wait(250);
  await snapshot();
  noNewStreak = 0;
  const pass2Max = Math.ceil(scrollHeight / baseStep);
  for (let i = pass2Max; i >= 0; i--) {
    throwIfAborted();
    // Pass 2 starts at the bottom, so a budget hit here never means the
    // result is incomplete — pass 1 already covered the page.
    if (timeBudgetExhausted()) break;

    pos = Math.max(0, i * baseStep);
    await scrollTo(pos);
    await wait(150);
    const added = await snapshot();
    // Only break after a LONG stretch of nothing new — the fine sweep is
    // what makes pass 2 a real safety net for pass 1's skipped clusters.
    if (added === 0 && noNewStreak >= 12) break;
    if (added > 0) noNewStreak = 0;
  }

  // Sort by the numeric conversation-turn id when available; fallback-keyed
  // messages (no id) keep their first-seen sequence so order stays stable.
  const sorted = Array.from(collected.values()).sort((a, b) => {
    const ao = (a.key.match(/^conversation-turn-(\d+)$/) || [])[1];
    const bo = (b.key.match(/^conversation-turn-(\d+)$/) || [])[1];
    if (ao && bo) return Number(ao) - Number(bo);
    if (ao) return -1; // id-keyed first, in order
    if (bo) return 1;
    return a._seq - b._seq; // fallback: first-seen order
  });

  const messages = sorted.map(({ role, content }) => normalizeCollected(role, content));
  logger.info(
    {
      collected: collected.size,
      delivered: messages.length,
      elapsedMs: Date.now() - startedAt,
      budgetMs: effectiveTimeoutMs,
      truncated,
    },
    'ChatGPT message collection complete'
  );
  return { messages, truncated };
}

// Fallback helper when no scroll container was found
function snapshotToMessages(raw) {
  return raw
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => normalizeCollected(m.role, m.content));
}

// normalizeMessage() returns {content, attachments} — merge it back with role
function normalizeCollected(role, content) {
  const normalized = normalizeMessage(role, content);
  return {
    role,
    content: normalized.content,
    ...(normalized.attachments.length > 0 ? { attachments: normalized.attachments } : {}),
  };
}
