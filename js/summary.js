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
