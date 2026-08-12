// Quick manual test: extract a share URL end-to-end
import { extractDom } from '../src/services/extractor/extractor-engine.js';
import { generateStatistics } from '../src/services/statistics/statistics-engine.js';
import { browserManager, puppeteerBrowserManager } from '../src/services/browser/browser-manager.js';

const url = process.argv[2] || 'https://chatgpt.com/share/6a7c2b4a-1dd4-83ec-82a5-bf7668cc8fd7';

try {
  console.log(`Extracting: ${url}`);
  const result = await extractDom(url);

  const parsed = {
    title: result.title,
    messages: result.messages,
  };
  const stats = generateStatistics(parsed.messages);

  console.log('Title:', parsed.title);
  console.log('Total messages:', stats.totalMessages);
  console.log('Prompts (user):', stats.promptCount);
  console.log('Assistant:', stats.assistantCount);
  console.log('---');
  parsed.messages.forEach((m, i) => {
    const preview = (m.content || '').slice(0, 100).replace(/\n/g, ' ');
    const att = m.attachments ? ` [att:${m.attachments.join(',')}]` : '';
    console.log(`[${i}] ${m.role}${att}: ${preview}`);
  });
} catch (err) {
  console.error('TEST FAILED:', err.message);
  process.exitCode = 1;
} finally {
  // Force-exit: browser connections keep the event loop alive otherwise
  await browserManager.closeBrowser().catch(() => {});
  await puppeteerBrowserManager.closeBrowser().catch(() => {});
  setTimeout(() => process.exit(process.exitCode || 0), 500);
}
