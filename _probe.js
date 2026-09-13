const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1350, height: 646 }, deviceScaleFactor: 3 });
  await page.goto('file:///' + path.resolve('C:/Users/User/Desktop/Stepplify-main/index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  const geo = await page.evaluate(() => {
    const s = document.getElementById('yurtSection');
    return { top: s.getBoundingClientRect().top + window.scrollY, runway: s.offsetHeight - window.innerHeight };
  });
  await page.evaluate((y) => window.scrollTo(0, y), geo.top + geo.runway * 0.28);
  await page.waitForTimeout(700);
  const v = await page.evaluate(() => {
    const g = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'missing';
      const b = el.getBoundingClientRect();
      return `${el.getAttribute('opacity')}  x=${b.x.toFixed(0)}..${(b.x + b.width).toFixed(0)}`;
    };
    const svg = document.querySelector('.yurt-svg').getBoundingClientRect();
    return {
      svgX: svg.x.toFixed(0),
      tie: g('.yurt-roll-tie'),
      knot: g('.yurt-roll-knot'),
      roll: g('.yurt-roll'),
      count: document.querySelectorAll('.yurt-roll-tie').length,
    };
  });
  console.log(v);
  const box = await page.evaluate(() => {
    const r = document.querySelector('.yurt-svg').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.screenshot({ path: 'C:/Users/User/Desktop/Stepplify-main/_x_now.png', clip: box });
  await browser.close();
})();
