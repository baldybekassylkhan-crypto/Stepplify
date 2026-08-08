const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1456, height: 816 } });
  const fileUrl = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
  await page.goto(fileUrl);
  // hold long enough to land on the 5th phrase (index 4) mid-hold-window
  await page.waitForTimeout(2600 * 4 + 1200);
  await page.screenshot({ path: 'phrase-4-clean.png', clip: { x: 250, y: 240, width: 950, height: 260 } });
  const text = await page.evaluate(() => document.getElementById('rotator').textContent);
  const fontSize = await page.evaluate(() => getComputedStyle(document.getElementById('rotator')).fontSize);
  console.log('text:', text, 'fontSize:', fontSize);
  await browser.close();
})();
