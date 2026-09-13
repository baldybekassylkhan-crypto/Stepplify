const { chromium } = require('playwright');
const path = require('path');
const OUT = process.env.OUT_DIR;
const url = 'file:///' + path.resolve(process.env.PROJ_DIR, 'index.html').split(path.sep).join('/');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 780 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(url);
  await p.waitForTimeout(800);
  await p.evaluate(() => { const v = document.querySelector('.scene'); if (v) { v.pause(); v.currentTime = 2; } });

  const geo = await p.evaluate(() => {
    const s = document.getElementById('yurtSection');
    return { top: s.offsetTop, h: s.offsetHeight };
  });
  const runway = geo.h - 780;

  for (const frac of [0, 0.2, 0.45, 0.7, 1]) {
    await p.evaluate((y) => window.scrollTo(0, y), geo.top + runway * frac);
    await p.waitForTimeout(500);
    const t = await p.evaluate(() => Array.from(document.querySelectorAll('.yurt-hill')).map((e) => e.getAttribute('transform')));
    console.log(`p=${frac}`, JSON.stringify(t));
    if (frac === 0.45) await p.screenshot({ path: path.join(OUT, 'hills-reduced-mobile.png') });
  }
  console.log('errors:', errors);
  await b.close();
})();
