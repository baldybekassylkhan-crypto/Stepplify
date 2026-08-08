const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1456, height: 816 } });
  const fileUrl = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(fileUrl);
  await page.waitForTimeout(400);

  // cycle through all 5 phrases (hold 2.6s + swap 0.35s each)
  for (let i = 0; i < 5; i++) {
    await page.screenshot({ path: `phrase-${i}.png`, clip: { x: 250, y: 240, width: 950, height: 260 } });
    await page.waitForTimeout(2950);
  }

  console.log('errors:', errors);
  await browser.close();
})();
