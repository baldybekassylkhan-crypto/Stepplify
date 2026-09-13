// A CSS `opacity` declaration outranks the SVG opacity ATTRIBUTE, so any
// class the script fades by attribute must not carry one in the
// stylesheet. Checks that in the live page rather than by reading source.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1350, height: 646 } });
  await page.goto('file:///' + path.resolve('C:/Users/User/Desktop/Stepplify-main/index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(600);
  const bad = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.yurt-svg *').forEach((el) => {
      const attr = el.getAttribute('opacity');
      if (attr === null) return; // not animated by the script
      const computed = getComputedStyle(el).opacity;
      if (Math.abs(Number(computed) - Number(attr)) > 0.001) {
        out.push(`${el.getAttribute('class') || el.tagName}: attribute ${attr} but computed ${computed}`);
      }
    });
    return [...new Set(out)];
  });
  console.log(bad.length ? bad.join('\n') : 'no CSS opacity is overriding a script-set attribute');
  await browser.close();
})();
