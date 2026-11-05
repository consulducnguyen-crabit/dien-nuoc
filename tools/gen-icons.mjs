// Sinh icon PNG cho PWA từ hình căn nhà của favicon.svg (nền vuông tràn viền, không bo góc).
// Chạy: node tools/gen-icons.mjs   (dùng @playwright/test + Edge có sẵn, xem playwright.config.js)
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL || 'msedge');

// scale: tỉ lệ hình nhà so với toàn khung (maskable: nhỏ lại để nằm trong vùng an toàn 80%)
function svg(scale) {
  const s = 64 * scale;
  const off = (64 - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#5B7BEF"/><stop offset="1" stop-color="#8E86E6"/></linearGradient></defs>
  <rect width="64" height="64" fill="url(#g)"/>
  <g transform="translate(${off} ${off}) scale(${scale})">
    <path d="M32 12 10 31h6v20h11V38h10v13h11V31h6z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
  </g></svg>`;
}

// Nhà trong favicon chiếm ~73% khung: bản thường phóng 1.1, maskable 0.8 (nằm gọn trong vùng an toàn)
const JOBS = [
  ['icons/icon-192.png', 192, 1.1],
  ['icons/icon-512.png', 512, 1.1],
  ['icons/icon-maskable-512.png', 512, 0.8],
  ['apple-touch-icon.png', 180, 1.1],
];

const browser = await chromium.launch({ channel });
try {
  await mkdir(`${root}icons`, { recursive: true });
  for (const [file, size, scale] of JOBS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;overflow:hidden">${svg(scale)}</body></html>`);
    await writeFile(root + file, await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } }));
    await page.close();
    console.log('đã tạo', file);
  }
} finally {
  await browser.close();
}
