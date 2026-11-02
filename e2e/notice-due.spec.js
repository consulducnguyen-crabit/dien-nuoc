// Khối "Hạn đóng" trong ảnh thông báo: tờ lịch + ngày đầy đủ; xoá ngày thì chuyển sang trạng thái mờ "chưa chọn".
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('Hạn đóng hiện tờ lịch đúng ngày/tháng/năm, đổi ngày thì cập nhật, xoá trống thì "chưa chọn"', async ({ page }) => {
  await openApp(page, '#thong-bao');
  const due = page.locator('.notice-due');
  await expect(due).toBeVisible();

  await page.locator('#notice-due').fill('2026-11-05');
  await expect(due.locator('.notice-cal i')).toHaveText('THÁNG 11');
  await expect(due.locator('.notice-cal b')).toHaveText('5');
  await expect(due.locator('.notice-cal em')).toHaveText('2026');
  await expect(due.locator('.notice-due-txt b')).toHaveText('5/11/2026');
  await expect(due).not.toHaveClass(/is-empty/);

  await page.locator('#notice-due').fill('');
  await expect(due).toHaveClass(/is-empty/);
  await expect(due.locator('.notice-due-txt b')).toHaveText('chưa chọn');
});

test('Mobile: huy hiệu hạn đóng không làm trang tràn ngang', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openApp(page, '#thong-bao');
  await expect(page.locator('.notice-due')).toBeVisible();
  const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth }));
  expect(m.doc).toBeLessThanOrEqual(m.view);
});

test('Favicon là logo căn nhà (favicon.svg) và tải được', async ({ page, request }) => {
  await openApp(page);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'favicon.svg');
  const res = await request.get('http://localhost:8765/favicon.svg');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('image/svg+xml');
});
