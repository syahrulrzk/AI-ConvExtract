import { chromium } from 'playwright';

const url = process.argv[2] || 'https://chatgpt.com/share/6a7c2b4a-1dd4-83ec-82a5-bf7668cc8fd7';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
});
const page = await context.newPage();

page.on('response', async (res) => {
  const u = res.url();
  if (u.includes('/backend-api/') || u.includes('/share') || u.includes('conversation')) {
    try {
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('json')) {
        const body = await res.json();
        const mapping = body.mapping || body?.props?.pageProps?.serverResponse?.data?.mapping;
        console.log('URL:', u);
        if (mapping) {
          const nodes = Object.values(mapping);
          const withMsg = nodes.filter(n => n.message);
          const roles = withMsg.map(n => n.message.author?.role);
          console.log('  total mapping nodes:', nodes.length, 'with message:', withMsg.length);
          console.log('  roles:', JSON.stringify(roles));
          const userMsgs = withMsg.filter(n => n.message.author?.role === 'user');
          userMsgs.forEach((n, i) => {
            const parts = n.message.content?.parts || [];
            console.log(`  user[${i}] id=${n.message.id} parts_preview=`, JSON.stringify(parts).slice(0, 100));
          });
        } else {
          console.log('  (no mapping field) keys:', Object.keys(body));
        }
      }
    } catch (e) {
      console.log('parse err for', u, e.message);
    }
  }
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch (e) {}
await new Promise(r => setTimeout(r, 3000));
await browser.close();
