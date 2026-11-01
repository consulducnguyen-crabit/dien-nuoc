import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { invoiceFromRow, invoiceToRow, withNotified } from '../js/data.js';
import { narrowSummary, summarizeUnit } from '../js/summary.js';
import { noticeFileName } from '../js/notice.js';

test('invoiceFromRow map notified_at -> notifiedAt; invoiceToRow không gửi notified', () => {
  assert.equal(invoiceFromRow({ key: 'k', notified_at: '2026-05-01T10:00:00' }).notifiedAt, '2026-05-01T10:00:00');
  assert.equal(invoiceFromRow({ key: 'k' }).notifiedAt, '');
  const row = invoiceToRow({ type: 'elec', notifiedAt: 'x' }, '2026-05', 'TD475');
  assert.equal('notified_at' in row, false);
  assert.equal('notifiedAt' in row, false);
});

test('withNotified chỉ đổi các key chọn và không sửa mảng gốc', () => {
  const list = [{ key: 'a', notifiedAt: '' }, { key: 'b', notifiedAt: '' }];
  const out = withNotified(list, ['a'], 'T');
  assert.equal(out[0].notifiedAt, 'T');
  assert.equal(out[1].notifiedAt, '');
  assert.equal(list[0].notifiedAt, '');
  assert.equal(withNotified(out, ['a'], '')[0].notifiedAt, '');
});

test('narrowSummary: only chọn đúng loại và tính lại tổng', () => {
  const invoices = [
    { period: '2026-05', unit: 'TD475', type: 'elec', amount: 100 },
    { period: '2026-05', unit: 'TD475', type: 'water', amount: 40 },
  ];
  const s = summarizeUnit({ name: 'TD475' }, invoices, '2026-05');
  assert.equal(narrowSummary(s).total, 140);
  assert.equal(narrowSummary(s, undefined), s);
  const e = narrowSummary(s, 'elec');
  assert.equal(e.total, 100);
  assert.equal(e.water, null);
  assert.ok(e.elec);
  const w = narrowSummary(s, 'water');
  assert.equal(w.total, 40);
  assert.equal(w.elec, null);
});

test('noticeFileName thêm hậu tố theo loại', () => {
  assert.equal(noticeFileName('td475', '2026-05'), 'thong-bao_TD475_2026-05.png');
  assert.equal(noticeFileName('TD475', '2026-05', 'elec'), 'thong-bao_TD475_2026-05_dien.png');
  assert.equal(noticeFileName('TD475', '2026-05', 'water'), 'thong-bao_TD475_2026-05_nuoc.png');
});

// Trích hàm thuần từ Code.gs để kiểm tra logic giữ/xoá notified_at và cột thiếu.
function loadGs() {
  const src = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const pick = (re) => {
    const m = src.match(re);
    assert.ok(m, 'không tìm thấy ' + re);
    return m[0];
  };
  const code = [
    pick(/var INVOICE_HEADERS = \[[\s\S]*?\];/),
    pick(/function missingHeaderIdx_[\s\S]*?\n}\n/),
    pick(/function keepNotifiedAt_[\s\S]*?\n}\n/),
  ].join('\n');
  const ctx = {};
  vm.runInNewContext(code + '\nthis.H = INVOICE_HEADERS; this.keep = keepNotifiedAt_; this.missing = missingHeaderIdx_;', ctx);
  return ctx;
}

test('INVOICE_HEADERS có notified_at ở cuối; Sheet cũ thiếu đúng cột đó', () => {
  const { H, missing } = loadGs();
  assert.equal(H[H.length - 1], 'notified_at');
  // Mảng sinh trong vm khác realm: so sánh qua JSON để không vướng kiểm tra prototype
  assert.equal(JSON.stringify(missing(H.slice(0, -1), H)), JSON.stringify([H.length - 1]));
  assert.equal(missing(H, H).length, 0);
  assert.equal(missing([], H).length, H.length);
});

test('keepNotifiedAt_: giữ nếu amount+consumption không đổi, xoá nếu đổi, bản mới rỗng', () => {
  const { H, keep } = loadGs();
  const row = H.map(() => '');
  row[H.indexOf('amount')] = 1000;
  row[H.indexOf('consumption')] = 50;
  row[H.indexOf('notified_at')] = '2026-05-01T10:00:00';
  assert.equal(keep(row, { amount: 1000, consumption: 50 }), '2026-05-01T10:00:00');
  assert.equal(keep(row, { amount: 1200, consumption: 50 }), '');
  assert.equal(keep(row, { amount: 1000, consumption: 51 }), '');
  assert.equal(keep(null, { amount: 1000, consumption: 50 }), '');
  // Hoá đơn cũ chưa từng thông báo vẫn rỗng
  row[H.indexOf('notified_at')] = '';
  assert.equal(keep(row, { amount: 1000, consumption: 50 }), '');
});
