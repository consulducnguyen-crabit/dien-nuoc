// Định dạng tiền, ngày, kỳ, số và các helper nhỏ (thuần, không phụ thuộc DOM).

/**
 * Số kiểu VN: '.' ngăn nghìn, ',' thập phân (1566 -> '1.566', 12.5 -> '12,5').
 * Định dạng tay, không dùng Intl để không phụ thuộc dữ liệu ICU của môi trường.
 * Tối đa 3 chữ số thập phân, bỏ số 0 thừa (giống Intl mặc định).
 */
export function formatNumber(n) {
  let v = Number(n);
  if (!Number.isFinite(v)) v = 0;
  const neg = v < 0;
  const [intPart, decPart = ''] = Math.abs(v).toFixed(3).split('.');
  const dec = decPart.replace(/0+$/, '');
  const int = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const s = dec ? `${int},${dec}` : int;
  return neg && s !== '0' ? `-${s}` : s;
}

/** Như formatNumber nhưng thiếu số liệu (null/undefined/''/không hữu hạn) thì hiện '—' thay vì 0. */
export function formatNumberOrDash(n) {
  if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '—';
  return formatNumber(n);
}

/** Tiền: 5517569 -> '5.517.569 ₫'. */
export function formatMoney(n) {
  return `${formatNumber(n)} ₫`;
}

/** 'YYYY-MM-DD' -> 'd/m/yyyy' (rỗng nếu không hợp lệ). */
export function formatDate(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : '';
}

/** 'YYYY-MM' -> 'Tháng 9/2026' (rỗng nếu không hợp lệ). */
export function formatPeriod(period) {
  const m = String(period ?? '').match(/^(\d{4})-(\d{1,2})/);
  return m ? `Tháng ${Number(m[2])}/${m[1]}` : '';
}

/** Tháng liền trước của 'YYYY-MM' ('2026-11' -> '2026-10', '2026-01' -> '2025-12'); '' nếu không hợp lệ. */
export function previousPeriod(period) {
  const m = String(period ?? '').match(/^(\d{4})-(\d{1,2})$/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  let y = Number(m[1]);
  let mo = Number(m[2]) - 1;
  if (mo === 0) { y -= 1; mo = 12; }
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}`;
}

/** Khoá upsert của hoá đơn: 'period|UNIT|type' (mã căn luôn in hoa). */
export function invoiceKey(period, unit, type) {
  return `${period}|${String(unit).toUpperCase()}|${type}`;
}

/**
 * Nội dung chuyển khoản từ template, thay {căn} {tháng} {năm}.
 * Ví dụ ('{căn} T{tháng}/{năm}', 'pb08', '2026-09') -> 'PB08 T9/2026'.
 */
export function transferContent(template, unit, period) {
  const m = String(period ?? '').match(/^(\d{4})-(\d{1,2})/);
  return String(template || '{căn} T{tháng}/{năm}')
    .replaceAll('{căn}', String(unit ?? '').toUpperCase())
    .replaceAll('{tháng}', m ? String(Number(m[2])) : '')
    .replaceAll('{năm}', m ? m[1] : '');
}
