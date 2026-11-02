// Nút sao chép ảnh thông báo: desktop ghi clipboard, mobile tải file về (clipboard ảnh không dán được vào Zalo/Messenger).
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Thay CDN html-to-image bằng bản giả để test chạy offline. */
async function stubLib(page) {
  await page.route('**/html-to-image*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.htmlToImage={toPng:()=>Promise.resolve('${PNG}')};`,
  }));
}

const copyBtn = (page) => page.getByRole('button', { name: /ảnh thông báo nước TD475/ });

test('Mobile: bấm sao chép thì tải file PNG về, không ghi clipboard', async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    viewport: { width: 390, height: 800 },
  });
  const page = await ctx.newPage();
  await stubLib(page);
  await page.addInitScript(() => {
    window.__clip = 0;
    if (navigator.clipboard) navigator.clipboard.write = async () => { window.__clip++; };
  });
  const { calls } = await openApp(page);
  const download = page.waitForEvent('download');
  await copyBtn(page).click();
  expect((await download).suggestedFilename()).toMatch(/^thong-bao_TD475_\d{4}-\d{2}_nuoc\.png$/);
  await expect(page.getByText('Đã tải ảnh thông báo nước TD475 về máy')).toBeVisible();
  expect(await page.evaluate(() => window.__clip)).toBe(0);
  await expect.poll(() => calls.includes('markNotified')).toBe(true);
  await ctx.close();
});

test('Desktop: bấm sao chép thì ghi clipboard, không tải file', async ({ page }) => {
  await stubLib(page);
  await page.addInitScript(() => {
    window.__clip = 0;
    window.ClipboardItem = window.ClipboardItem || class { constructor(o) { this.o = o; } };
    Object.defineProperty(navigator, 'clipboard', { value: { write: async () => { window.__clip++; } }, configurable: true });
  });
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await openApp(page);
  await copyBtn(page).click();
  await expect(page.getByText('Đã sao chép ảnh thông báo nước TD475')).toBeVisible();
  expect(await page.evaluate(() => window.__clip)).toBe(1);
  expect(downloaded).toBe(false);
});
