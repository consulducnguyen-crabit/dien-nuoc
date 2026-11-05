// PWA: manifest/icon, thẻ "Cài ứng dụng" theo nền tảng, ô dán liên kết cài nhanh ở trang Cấu hình.
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';
import { buildQuickSetupHash } from '../js/quicksetup.js';

const API_URL = 'https://script.google.com/macros/s/E2E_TEST/exec';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const dialog = (page) => page.locator('dialog.modal[open]');

// Chặn beforeinstallprompt thật của Edge để nhánh "other" (không có prompt) chạy ổn định
const blockRealPrompt = () => window.addEventListener('beforeinstallprompt', (e) => e.stopImmediatePropagation(), true);

test('manifest hợp lệ, không chứa bí mật; icon tải được', async ({ page, request }) => {
  await openApp(page, '#cau-hinh');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(href).toBe('manifest.webmanifest');
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const text = await res.text();
  expect(text).not.toContain('script.google.com');
  expect(text).not.toContain('e2e-token');
  const m = JSON.parse(text);
  expect(m.display).toBe('standalone');
  expect(m.start_url).toBe('./');
  expect(m.scope).toBe('./');
  for (const ic of m.icons.filter((i) => i.type === 'image/png')) {
    const r = await request.get(`/${ic.src}`);
    expect(r.ok(), ic.src).toBe(true);
    expect(r.headers()['content-type']).toBe('image/png');
  }
  const apple = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
  const ra = await request.get(`/${apple}`);
  expect(ra.ok()).toBe(true);
  expect(ra.headers()['content-type']).toBe('image/png');
});

test('thẻ cài ứng dụng hiện cả khi chưa cấu hình', async ({ page }) => {
  await page.goto('/index.html#cau-hinh');
  await expect(page.locator('#install-card')).toBeVisible();
  await expect(page.locator('#install-btn')).toBeVisible();
  await expect(page.locator('#install-note')).toContainText('iPhone');
});

test('có beforeinstallprompt: bấm nút gọi prompt() đúng 1 lần', async ({ page }) => {
  await page.addInitScript(() => {
    window.__promptCalls = 0;
    const evt = new Event('beforeinstallprompt', { cancelable: true });
    evt.prompt = () => { window.__promptCalls += 1; return Promise.resolve(); };
    evt.userChoice = Promise.resolve({ outcome: 'accepted' });
    document.addEventListener('DOMContentLoaded', () => window.dispatchEvent(evt));
  });
  await openApp(page, '#cau-hinh');
  await page.locator('#install-btn').click();
  await expect.poll(() => page.evaluate(() => window.__promptCalls)).toBe(1);
  await expect(dialog(page)).toHaveCount(0); // không rơi sang hộp thoại hướng dẫn
  // Sự kiện chỉ dùng 1 lần: bấm lần 2 không gọi lại prompt(), hiện hướng dẫn thủ công
  await page.locator('#install-btn').click();
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => window.__promptCalls)).toBe(1);
});

test('iPhone: bấm nút mở hướng dẫn, chỉ có nút "Đã hiểu"', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: IPHONE_UA });
  const page = await ctx.newPage();
  await page.addInitScript(blockRealPrompt);
  await openApp(page, '#cau-hinh');
  await page.locator('#install-btn').click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('Chia sẻ');
  await expect(dialog(page)).toContainText('Thêm vào Màn hình chính');
  await expect(dialog(page).getByRole('button', { name: 'Đã hiểu' })).toBeFocused();
  await expect(dialog(page).getByRole('button', { name: 'Huỷ' })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await ctx.close();
});

test('trình duyệt khác (không prompt): hiện hướng dẫn menu trình duyệt', async ({ page }) => {
  await page.addInitScript(blockRealPrompt);
  await openApp(page, '#cau-hinh');
  await page.locator('#install-btn').click();
  await expect(dialog(page)).toContainText('menu của trình duyệt');
  await expect(dialog(page).getByRole('button', { name: 'Huỷ' })).toHaveCount(0);
});

test('đang chạy standalone: chip "Đã cài", ẩn nút', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => (q.includes('display-mode: standalone')
      ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
      : orig(q));
  });
  await openApp(page, '#cau-hinh');
  await expect(page.locator('#install-status')).toHaveText('Đã cài');
  await expect(page.locator('#install-btn')).toBeHidden();
});

test('sự kiện appinstalled: chip chuyển "Đã cài"', async ({ page }) => {
  await page.addInitScript(blockRealPrompt);
  await openApp(page, '#cau-hinh');
  await expect(page.locator('#install-status')).toHaveText('Chưa cài');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#install-status')).toHaveText('Đã cài');
  await expect(page.locator('#install-btn')).toBeHidden();
});

test('viewport 390px không tràn ngang', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openApp(page, '#cau-hinh');
  await expect(page.locator('#install-card')).toBeVisible();
  await expect(page.locator('table.table-form tbody tr').first()).toBeVisible(); // đợi dữ liệu đổ vào bảng rồi mới đo
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('ô dán liên kết cài nhanh: hợp lệ thì lưu, hỏng thì báo lỗi và không đổi localStorage', async ({ page }) => {
  await openApp(page, '#cau-hinh');
  const paste = page.locator('#cfg-quick-paste');
  const token = () => page.evaluate(() => localStorage.getItem('hd_api_token'));

  await paste.fill('https://example.github.io/dien-nuoc/#cai-nhanh=@@khong-hop-le');
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.locator('.toast').last()).toContainText('không hợp lệ');
  expect(await token()).toBe('e2e-token');
  await expect(paste).toHaveValue('');

  await paste.fill(`https://example.github.io/dien-nuoc/${buildQuickSetupHash(API_URL, 'new-token')}`);
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await expect.poll(token).toBe('new-token');
  await expect(page.locator('#cfg-token')).toHaveValue('new-token');
  await expect(paste).toHaveValue('');
  await expect(page.locator('.toast').last()).not.toContainText('new-token');
});

test('ô dán: hash hợp lệ nhưng URL không được phép thì báo lỗi, không đổi localStorage', async ({ page }) => {
  await openApp(page, '#cau-hinh');
  const before = await page.evaluate(() => [localStorage.getItem('hd_api_url'), localStorage.getItem('hd_api_token')]);
  await page.locator('#cfg-quick-paste').fill(buildQuickSetupHash('https://evil.example/macros/s/x/exec', 't'));
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.locator('.toast').last()).toContainText('không hợp lệ');
  expect(await page.evaluate(() => [localStorage.getItem('hd_api_url'), localStorage.getItem('hd_api_token')])).toEqual(before);
});
