// Test parseWaterReceiptText với văn bản OCR GIẢ LẬP tự viết (không phải dữ liệu thật).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWaterReceiptText } from '../js/parser.js';

const FULL = `Thanh toán 10 - 2026
Mã khách hàng: TD475
Chỉ số cũ: 506
Chỉ số mới: 528
Tiêu thụ: 22 m³
Mô tả Thành tiền
Cộng 22 182.600
Giảm trừ đặc cọc 19.173
Thuế GTGT 9.130
Tổng tiền 172.557
Bằng chữ: Một trăm bảy mươi hai nghìn năm trăm năm mươi bảy đồng`;

test('đủ trường', () => {
  const r = parseWaterReceiptText(FULL);
  assert.equal(r.errors.length, 0);
  assert.equal(r.invoices.length, 1);
  const i = r.invoices[0];
  assert.equal(i.type, 'water');
  assert.equal(i.period, '2026-10');
  assert.equal(i.periodSource, 'image');
  assert.equal(i.customerCode, 'TD475');
  assert.equal(i.indexStart, 506);
  assert.equal(i.indexEnd, 528);
  assert.equal(i.consumption, 22);
  assert.equal(i.amount, 172557);
  assert.equal(i.unitLabel, 'm³');
  assert.equal(i.dueDate, null);
  assert.equal(i.rawMessage, FULL);
  assert.equal(i.fromImage, true);
  assert.deepEqual(r.warnings, []);
});

test('thứ tự dòng xáo trộn, số nằm dòng kế sau nhãn', () => {
  const text = `Tổng tiền
172.557
Thuế GTGT 9.130
Chỉ số mới:
528
Mã khách hàng:
TD475
Cộng 22 182.600
Tiêu thụ:
22 m³
Giảm trừ đặc cọc 19.173
Chỉ số cũ: 506
Thanh toán 10 - 2026`;
  const r = parseWaterReceiptText(text);
  assert.equal(r.errors.length, 0);
  const i = r.invoices[0];
  assert.equal(i.customerCode, 'TD475');
  assert.equal(i.indexStart, 506);
  assert.equal(i.indexEnd, 528);
  assert.equal(i.consumption, 22);
  assert.equal(i.amount, 172557);
  assert.equal(i.period, '2026-10');
  assert.deepEqual(r.warnings, []);
});

test('OCR nhầm O/0, l/1 và dấu , ngăn nghìn', () => {
  const text = `Thanh toán lO - 2O26
Mã khách hàng: TD475
Chỉ số cũ: 5O6
Chỉ số mới: 528
Tiêu thụ: 22 m³
Cộng 22 182,600
Giảm trừ đặc cọc 19,173
Thuế GTGT 9.l3O
Tổng tiền l72.557`;
  const r = parseWaterReceiptText(text);
  assert.equal(r.errors.length, 0);
  const i = r.invoices[0];
  assert.equal(i.period, '2026-10');
  assert.equal(i.indexStart, 506);
  assert.equal(i.amount, 172557);
  assert.deepEqual(r.warnings, []);
});

test('thiếu tổng tiền -> missing_field, không ghi nhận', () => {
  const text = FULL.replace('Tổng tiền 172.557\n', '');
  const r = parseWaterReceiptText(text);
  assert.equal(r.invoices.length, 0);
  assert.deepEqual(r.errors.map((e) => [e.reason, e.field]), [['missing_field', 'amount']]);
});

test('thiếu mã khách hàng -> missing_field customerCode', () => {
  const r = parseWaterReceiptText(FULL.replace('Mã khách hàng: TD475\n', ''));
  assert.equal(r.invoices.length, 0);
  assert.equal(r.errors[0].field, 'customerCode');
});

test('thiếu tiêu đề kỳ -> period null, vẫn ghi nhận', () => {
  const r = parseWaterReceiptText(FULL.replace('Thanh toán 10 - 2026\n', ''));
  assert.equal(r.invoices.length, 1);
  assert.equal(r.invoices[0].period, null);
  assert.equal(r.invoices[0].periodSource, null);
});

test('cảnh báo khi bảng tiền không khớp, không chặn', () => {
  const r = parseWaterReceiptText(FULL.replace('Thuế GTGT 9.130', 'Thuế GTGT 9.139'));
  assert.equal(r.invoices.length, 1);
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(r.invoices[0].warnings, r.warnings);
});

test('văn bản rỗng hoặc không liên quan', () => {
  assert.deepEqual(parseWaterReceiptText('').invoices, []);
  const r = parseWaterReceiptText('xin chào thế giới');
  assert.equal(r.invoices.length, 0);
  assert.equal(r.errors[0].reason, 'unrecognized');
});
