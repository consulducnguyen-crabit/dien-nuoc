import test from 'node:test';
import assert from 'node:assert';
import { summarizeUnit, listMissing } from '../js/summary.js';

const P = '2026-10';
const units = [{ name: 'AA01' }, { name: 'pb08' }, { name: 'TD473' }, { name: 'ZZ99' }];
const invoices = [
  { unit: 'AA01', period: P, type: 'elec', amount: 100 },
  { unit: 'AA01', period: P, type: 'water', amount: 50 },
  { unit: 'PB08', period: P, type: 'elec', amount: 70 },
  { unit: 'TD473', period: P, type: 'water', amount: 30 },
  { unit: 'ZZ99', period: '2026-09', type: 'elec', amount: 10 }, // kỳ khác: không tính
];

test('listMissing: khớp summarizeUnit cho đủ / chỉ điện / chỉ nước / chưa có', () => {
  const { rows } = listMissing(units, invoices, P);
  for (const u of units) {
    const expect = summarizeUnit(u, invoices, P);
    const got = rows.find((r) => r.unit === expect.unit);
    assert.equal(got.status, expect.status);
    assert.equal(got.total, expect.total);
  }
  const by = Object.fromEntries(rows.map((r) => [r.unit, r]));
  assert.deepEqual([by.AA01.status, by.PB08.status, by.TD473.status, by.ZZ99.status], ['full', 'elec', 'water', 'none']);
  assert.deepEqual(by.AA01.missing, []);
  assert.deepEqual(by.PB08.missing, ['nước']);
  assert.deepEqual(by.TD473.missing, ['điện']);
  assert.deepEqual(by.ZZ99.missing, ['điện', 'nước']);
});

test('listMissing: căn thiếu xếp lên trên, đếm đủ và dòng tóm tắt', () => {
  const r = listMissing(units, invoices, P);
  assert.deepEqual(r.rows.map((x) => x.unit), ['PB08', 'TD473', 'ZZ99', 'AA01']);
  assert.equal(r.fullCount, 1);
  assert.equal(r.total, 4);
  assert.equal(r.summary, '1/4 căn đã đủ; còn thiếu: PB08 (nước), TD473 (điện), ZZ99 (điện, nước)');
});

test('listMissing: tất cả đủ và danh sách rỗng', () => {
  assert.equal(listMissing([units[0]], invoices, P).summary, '1/1 căn đã đủ điện + nước');
  assert.deepEqual(listMissing([], [], P).rows, []);
});
