// Renders brand/logo.svg to the app's icon files: icon.png (512), public/icon.png, and a
// multi-size vibedeck.ico (16-256, PNG entries). Run: node brand/render-icons.cjs <playwright-core path>
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.argv[2] || 'playwright-core');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(__dirname, 'logo.svg');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function render(page, size) {
  const src = 'data:image/svg+xml;base64,' + fs.readFileSync(SVG).toString('base64');
  await page.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.waitForFunction(() => { const i = document.getElementById('i'); return i.complete && i.naturalWidth > 0; });
  return page.locator('#i').screenshot({ omitBackground: true });
}

function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p.png)]);
}

(async () => {
  let browser;
  for (const channel of ['chrome', 'msedge', undefined]) { try { browser = await chromium.launch(channel ? { channel } : {}); break; } catch {} }
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const big = await render(page, 512);
  fs.writeFileSync(path.join(ROOT, 'icon.png'), big);
  fs.writeFileSync(path.join(ROOT, 'public', 'icon.png'), big);
  const pngs = [];
  for (const size of ICO_SIZES) pngs.push({ size, png: await render(page, size) });
  fs.writeFileSync(path.join(ROOT, 'vibedeck.ico'), ico(pngs));
  await browser.close();
  console.log('wrote icon.png (512), public/icon.png, vibedeck.ico (' + ICO_SIZES.join(', ') + ')');
})();
