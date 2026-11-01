// Tổng hợp hoá đơn theo căn + kỳ (thuần, không phụ thuộc DOM). Dùng chung cho Thống kê và Thông báo.

export const STATUS_META = {
  full: { label: 'Đủ điện + nước', chip: 'chip-ok' },
  elec: { label: 'Chỉ có điện', chip: 'chip-elec' },
  water: { label: 'Chỉ có nước', chip: 'chip-water' },
  none: { label: 'Chưa có tin nhắn', chip: '' },
};

/**
 * @param {{name:string}} unit
 * @param {object[]} invoices hoá đơn (có trường unit, period, type, amount, dueDate)
 * @param {string} period 'YYYY-MM'
 */
export function summarizeUnit(unit, invoices, period) {
  const name = String(unit.name).toUpperCase();
  const mine = (invoices || []).filter(
    (i) => i.period === period && String(i.unit).toUpperCase() === name,
  );
  const elec = mine.find((i) => i.type === 'elec') || null;
  const water = mine.find((i) => i.type === 'water') || null;
  const status = elec && water ? 'full' : elec ? 'elec' : water ? 'water' : 'none';
  return {
    unit: name,
    elec,
    water,
    status,
    total: (elec?.amount || 0) + (water?.amount || 0),
    dueDate: elec?.dueDate || '',
  };
}

/**
 * Theo dõi hoá đơn từng căn trong một kỳ. Dựa hoàn toàn vào summarizeUnit nên khớp trang Thống kê.
 * rows: mỗi căn kèm `missing` (['điện'|'nước']); căn thiếu xếp trước, giữ thứ tự gốc trong từng nhóm.
 * @returns {{rows: object[], fullCount: number, total: number, summary: string}}
 */
export function listMissing(units, invoices, period) {
  const all = (units || []).map((u) => {
    const s = summarizeUnit(u, invoices, period);
    const missing = [];
    if (!s.elec) missing.push('điện');
    if (!s.water) missing.push('nước');
    return { ...s, missing };
  });
  const rows = [...all.filter((r) => r.missing.length), ...all.filter((r) => !r.missing.length)];
  const fullCount = all.length - all.filter((r) => r.missing.length).length;
  const gaps = rows.filter((r) => r.missing.length).map((r) => `${r.unit} (${r.missing.join(', ')})`);
  const summary = gaps.length
    ? `${fullCount}/${all.length} căn đã đủ; còn thiếu: ${gaps.join(', ')}`
    : `${fullCount}/${all.length} căn đã đủ điện + nước`;
  return { rows, fullCount, total: all.length, summary };
}
