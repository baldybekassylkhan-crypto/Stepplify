import fs from 'fs';

async function main() {
  try {
    const res = await fetch('https://2gis.kz');
    const html = await res.text();
    const logoMatch = html.match(/https:\/\/[^\s"'<>]+\/logo[^\s"'<>]*\.(svg|png)/gi) || html.match(/https:\/\/[^\s"'<>]+\.(svg|png)/gi) || [];
    console.log('Found logo candidates:', [...new Set(logoMatch)].slice(0, 10));

    // Also download alkn54 / 2gis official SVG if found
    for (const url of [...new Set(logoMatch)].slice(0, 5)) {
      try {
        const r = await fetch(url);
        if (r.ok) {
          const buf = await r.arrayBuffer();
          const ext = url.endsWith('.svg') ? 'svg' : 'png';
          fs.writeFileSync(`2gis_official.${ext}`, Buffer.from(buf));
          console.log(`Saved 2gis_official.${ext} from ${url}`);
          break;
        }
      } catch(e) {}
    }
  } catch (e) {
    console.error(e);
  }
}
main();
