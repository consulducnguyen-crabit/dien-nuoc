// Khớp mã khách hàng -> căn (thuần, không phụ thuộc DOM).

// Bỏ '-' và khoảng trắng, đưa về chữ thường để so khớp
const clean = (s) => String(s ?? '').toLowerCase().replace(/[-\s]/g, '');

/**
 * Tìm căn có suffix dài nhất mà mã KH kết thúc bằng.
 * Tin điện dùng elecSuffix, tin nước dùng waterSuffix.
 * @param {string} customerCode mã KH trong tin nhắn
 * @param {'elec'|'water'} type
 * @param {{name:string, elecSuffix?:string, waterSuffix?:string}[]} units
 * @returns {object|null} căn khớp hoặc null
 */
export function matchUnit(customerCode, type, units) {
  const code = clean(customerCode);
  if (!code) return null;
  const field = type === 'elec' ? 'elecSuffix' : 'waterSuffix';
  let best = null;
  let bestLen = 0;
  for (const u of units || []) {
    const suffix = clean(u[field]);
    if (suffix && suffix.length > bestLen && code.endsWith(suffix)) {
      best = u;
      bestLen = suffix.length;
    }
  }
  return best;
}
