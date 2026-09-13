const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1350, height: 646 }, deviceScaleFactor: 3 });
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
  await page.goto('file:///' + path.resolve('C:/Users/User/Desktop/Stepplify-main/index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  const geo = await page.evaluate(() => {
    const s = document.getElementById('yurtSection');
    return { top: s.getBoundingClientRect().top + window.scrollY, runway: s.offsetHeight - window.innerHeight };
  });
  for (const [frac, name] of [[0.02, 'a'], [0.14, 'b'], [0.28, 'c']]) {
    await page.evaluate((y) => window.scrollTo(0, y), geo.top + geo.runway * frac);
    await page.waitForTimeout(700);
    const box = await page.evaluate(() => {
      const r = document.querySelector('.yurt-svg').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.screenshot({
      path: `C:/Users/User/Desktop/Stepplify-main/_x_yurt_${name}.png`,
      clip: { x: box.x, y: box.y, width: box.w, height: box.h },
    });
  }
  await browser.close();
})();
