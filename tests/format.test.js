import test from 'node:test';
import assert from 'node:assert';
import { previousPeriod, formatPeriod, transferContent } from '../js/format.js';

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

test('tháng hiển thị và nội dung chuyển khoản theo tháng trước', () => {
  assert.equal(formatPeriod(previousPeriod('2026-11')), 'Tháng 10/2026');
  assert.equal(transferContent('', 'pb08', previousPeriod('2026-11')), 'PB08 T10/2026');
});
