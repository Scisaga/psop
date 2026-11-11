import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = path.join(root, 'assets', 'brand');
const web = path.join(root, 'apps', 'workbench', 'static');
const publicBrand = path.join(web, 'assets', 'brand');
async function syncHomepage() {
  const homepageBrand = path.join(root, 'docs', 'html', 'assets', 'brand');
  await mkdir(homepageBrand, { recursive: true });
  for (const [source, target] of [
    ['psop-mark.svg', 'psop-mark.svg'], ['favicon.svg', 'psop-favicon.svg'],
    ['favicon.ico', 'favicon.ico'], ['psop-app-icon-180.png', 'apple-touch-icon.png'],
  ]) await copyFile(path.join(assets, source), path.join(homepageBrand, target));
}
if (process.argv.includes('--homepage-only')) {
  await syncHomepage();
  console.log('Synchronized standalone homepage icons from assets/brand.');
  process.exit(0);
}
const sizes = [16, 20, 24, 28, 32, 40, 48, 64, 96, 128, 180, 192, 256, 384, 512, 1024];
const require = createRequire(path.join(root, 'apps', 'workbench', 'package.json'));
const { chromium } = require('@playwright/test');

// PNG exports use the same SVG master as the workbench, rendered by Chrome.
// No generative redraw or additional graphics dependency is involved.
await mkdir(path.join(assets, 'icons'), { recursive: true });
await mkdir(path.join(publicBrand, 'icons'), { recursive: true });
const svg = await readFile(path.join(assets, 'psop-mark.svg'), 'utf8');
const appSvg = svg.replace('<defs>', '<rect width="1024" height="1024" fill="#F3F4F2"/><defs>');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  async function png(source, size) {
    const base64 = await page.evaluate(async ({ source, size }) => {
      const image = new Image();
      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
      try {
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('A 2D canvas context is required.');
        context.drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      } finally {
        URL.revokeObjectURL(url);
      }
    }, { source, size });
    return Buffer.from(base64, 'base64');
  }

  for (const size of sizes) {
    await writeFile(path.join(assets, 'icons', `psop-icon-${size}.png`), await png(svg, size));
  }
  for (const size of [180, 192, 512]) {
    await writeFile(path.join(assets, `psop-app-icon-${size}.png`), await png(appSvg, size));
  }
} finally {
  await browser.close();
}

// Windows ICO containers support PNG images; include a genuine image per size.
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(icoSizes.map(size => readFile(path.join(assets, 'icons', `psop-icon-${size}.png`))));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((bytes, index) => {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = icoSizes[index] === 256 ? 0 : icoSizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(bytes.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += bytes.length;
});
await writeFile(path.join(assets, 'favicon.ico'), Buffer.concat([header, ...images]));
await writeFile(path.join(assets, 'favicon.svg'), svg);

for (const filename of ['psop-mark.svg', 'psop-mark-mono.svg', 'favicon.svg', 'favicon.ico']) {
  await copyFile(path.join(assets, filename), path.join(publicBrand, filename));
}
for (const size of [16, 32, 48, 180, 192, 512]) {
  const filename = `psop-icon-${size}.png`;
  await copyFile(path.join(assets, 'icons', filename), path.join(publicBrand, 'icons', filename));
}
for (const size of [180, 192, 512]) {
  await copyFile(path.join(assets, `psop-app-icon-${size}.png`), path.join(publicBrand, `psop-app-icon-${size}.png`));
}
await copyFile(path.join(assets, 'favicon.svg'), path.join(web, 'favicon.svg'));
await copyFile(path.join(assets, 'favicon.ico'), path.join(web, 'favicon.ico'));
await copyFile(path.join(assets, 'psop-app-icon-180.png'), path.join(web, 'apple-touch-icon.png'));

// The standalone homepage ships copies of the same master, with no parent-path dependency.
await syncHomepage();

console.log(`Generated ${sizes.length} transparent PNG sizes, 3 app icons, SVG and multi-size ICO in assets/brand.`);
console.log('Updated workbench and standalone homepage brand assets.');
