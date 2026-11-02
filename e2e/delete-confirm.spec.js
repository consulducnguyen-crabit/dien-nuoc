// Mọi thao tác xoá/ghi đè dữ liệu phải qua hộp thoại xác nhận; Huỷ/Esc thì KHÔNG được gọi API hay đổi dữ liệu.
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

const dialog = (page) => page.locator('dialog.modal[open]');

test('Thống kê: xoá hoá đơn - Huỷ thì không gọi API, Xác nhận mới xoá', async ({ page }) => {
  const { calls } = await openApp(page);
  const del = page.getByRole('button', { name: 'Xoá hoá đơn nước căn TD475' });
  await expect(del).toBeVisible();

  await del.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('Xoá hoá đơn?');
  await dialog(page).getByRole('button', { name: 'Huỷ' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(calls).not.toContain('deleteInvoice');

  await del.click(); // Esc cũng là Huỷ
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  expect(calls).not.toContain('deleteInvoice');

  await del.click();
  await dialog(page).getByRole('button', { name: 'Xoá hoá đơn' }).click();
  await expect.poll(() => calls.includes('deleteInvoice')).toBe(true);
});

test('Cấu hình: xoá căn - Huỷ thì căn còn nguyên', async ({ page }) => {
  await openApp(page, '#cau-hinh');
  const delBtns = page.getByRole('button', { name: /^Xoá căn/ });
  await expect(delBtns.first()).toBeVisible();
  const before = await delBtns.count();

  await delBtns.first().click();
  await expect(dialog(page)).toContainText('Xoá căn?');
  await dialog(page).getByRole('button', { name: 'Huỷ' }).click();
  await expect(delBtns).toHaveCount(before);

  await delBtns.first().click();
  await dialog(page).getByRole('button', { name: 'Xoá căn' }).click();
  await expect(delBtns).toHaveCount(before - 1);
});

test('Nhập: Xoá nội dung chỉ xoá sau khi xác nhận', async ({ page }) => {
  await openApp(page, '#nhap');
  const box = page.locator('textarea').first();
  await box.fill('nội dung thử');
  await page.getByRole('button', { name: 'Xoá nội dung' }).click();
  await expect(dialog(page)).toContainText('Xoá nội dung?');
  await dialog(page).getByRole('button', { name: 'Huỷ' }).click();
  await expect(box).toHaveValue('nội dung thử');

  await page.getByRole('button', { name: 'Xoá nội dung' }).click();
  await dialog(page).getByRole('button', { name: 'Xoá nội dung' }).click();
  await expect(box).toHaveValue('');
});

test('Thống kê: thẻ căn không còn nút Tạo thông báo, khối Nước có trạng thái thông báo', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('button', { name: 'Tạo thông báo' })).toHaveCount(0);
  await expect(page.getByText('✓✓ Đã thông báo').first()).toBeVisible();
  await expect(page.getByText('Chưa thông báo').first()).toBeVisible();
});

test('Thống kê: không còn dòng chú thích trạng thái ở đầu trang', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.card-navy')).toBeVisible();
  await expect(page.locator('.legend')).toHaveCount(0);
});

test('Thống kê: bảng tổng hợp không còn cột Trạng thái', async ({ page }) => {
  await openApp(page);
  const heads = page.locator('.table thead th');
  await expect(heads.first()).toBeVisible();
  await expect(page.locator('.table thead th', { hasText: 'Trạng thái' })).toHaveCount(0);
  // Số ô của hàng dữ liệu phải khớp số tiêu đề (không lệch cột sau khi bỏ cột)
  const cols = await heads.count();
  expect(await page.locator('.table tbody tr').first().locator('th, td').count()).toBe(cols);
});
