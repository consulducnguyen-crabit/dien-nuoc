import test from 'node:test';
import assert from 'node:assert';
import { previousPeriod, nextPeriod, defaultDueDate, formatPeriod, transferContent } from '../js/format.js';
import { defaultPeriod } from '../js/state.js';

test('previousPeriod: lùi một tháng, qua năm', () => {
  assert.equal(previousPeriod('2026-11'), '2026-10');
  assert.equal(previousPeriod('2026-01'), '2025-12');
  assert.equal(previousPeriod('2026-03'), '2026-02');
});

test('previousPeriod: đầu vào không hợp lệ trả về rỗng', () => {
  for (const bad of ['', null, undefined, '2026-13', '2026-00', 'abc', '2026']) {
    assert.equal(previousPeriod(bad), '');
  }
});

test('nextPeriod: tiến một tháng, qua năm', () => {
  assert.equal(nextPeriod('2026-10'), '2026-11');
  assert.equal(nextPeriod('2026-12'), '2027-01');
  assert.equal(nextPeriod('2026-01'), '2026-02');
});

test('nextPeriod: đầu vào không hợp lệ trả về rỗng', () => {
  for (const bad of ['', null, undefined, '2026-13', '2026-00', 'abc', '2026']) {
    assert.equal(nextPeriod(bad), '');
  }
});

test('defaultDueDate: ngày 10 của tháng kế tiếp', () => {
  assert.equal(defaultDueDate('2026-10'), '2026-11-10');
  assert.equal(defaultDueDate('2026-12'), '2027-01-10');
  assert.equal(defaultDueDate('xx'), '');
});

test('defaultPeriod: tháng trước của tháng hiện tại', () => {
  const d = new Date();
  assert.equal(defaultPeriod(), previousPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`));
});

test('tháng hiển thị và nội dung chuyển khoản theo đúng kỳ chọn', () => {
  assert.equal(formatPeriod('2026-10'), 'Tháng 10/2026');
  assert.equal(transferContent('', 'pb08', '2026-10'), 'PB08 T10/2026');
});
