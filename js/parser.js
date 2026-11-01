// Phân tích tin nhắn điện/nước (thuần, không phụ thuộc DOM).

/**
 * Chuẩn hoá: chữ thường, bỏ dấu tiếng Việt, đ->d, ³->3, gộp khoảng trắng.
 * Chỉ dùng để so khớp; tin gốc luôn được giữ ở rawMessage.
 */
export function normalize(text) {
  return foldWithMap(String(text ?? '')).text.trim();
}

// Chuẩn hoá kèm bảng ánh xạ vị trí (ký tự chuẩn hoá -> vị trí trong bản gốc),
// để cắt đoạn gốc đúng chỗ dù độ dài hai bản khác nhau (bỏ dấu, gộp khoảng trắng).
function foldWithMap(raw) {
  let out = '';
  const map = [];
  let prevSpace = true; // true để bỏ khoảng trắng đầu chuỗi
  for (let i = 0; i < raw.length; i++) {
    let ch = raw[i].toLowerCase();
    if (ch === 'đ') ch = 'd';
    else if (ch === '³') ch = '3';
    else ch = ch.normalize('NFD').replace(/\p{M}/gu, ''); // bỏ dấu kết hợp
    if (ch === '') continue; // dấu kết hợp đứng riêng
    if (/^\s+$/.test(ch)) {
      if (prevSpace) continue;
      out += ' ';
      map.push(i);
      prevSpace = true;
      continue;
    }
    prevSpace = false;
    for (const c of ch) {
      out += c;
      map.push(i);
    }
  }
  return { text: out, map };
}

/**
 * Đọc số kiểu VN: '.' là dấu nghìn, ',' là dấu thập phân.
 * Cắt ký tự đuôi không phải số ('5.517.569VND.' -> 5517569, '13.451,' -> 13451).
 * Trả về null nếu không có số.
 */
export function parseVnNumber(str) {
  const m = String(str ?? '').match(/\d[\d.,]*/);
  if (!m) return null;
  const s = m[0].replace(/[.,]+$/, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const pad2 = (n) => String(n).padStart(2, '0');
const toIsoDate = (d, m, y) => `${y}-${pad2(m)}-${pad2(d)}`;
const firstGroup = (re, s) => { const m = s.match(re); return m ? m[1] : null; };

function parseElec(norm, raw) {
  const inv = {
    type: 'elec', customerCode: null, periodFrom: null, periodTo: null, period: null,
    consumption: null, unitLabel: 'kWh', indexEnd: null, amount: null, dueDate: null, rawMessage: raw,
  };
  const p = norm.match(/tu\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (p) {
    inv.periodFrom = toIsoDate(p[1], p[2], p[3]);
    inv.periodTo = toIsoDate(p[4], p[5], p[6]);
    inv.period = `${p[6]}-${pad2(p[5])}`; // kỳ theo ngày kết thúc
  }
  const code = firstGroup(/ma\s*kh\s+([a-z0-9]+)/, norm);
  inv.customerCode = code ? code.toUpperCase() : null;
  inv.consumption = parseVnNumber(firstGroup(/su dung\s+([\d.,]+)\s*kwh/, norm));
  inv.indexEnd = parseVnNumber(firstGroup(/chi so cuoi ky\s*:?\s*([\d.,]+)/, norm));
  inv.amount = parseVnNumber(firstGroup(/so tien\s+([\d.,]+)\s*vnd/, norm));
  const d = norm.match(/truoc ngay\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (d) inv.dueDate = toIsoDate(d[1], d[2], d[3]);
  return inv;
}

function parseWater(norm, raw) {
  const code = firstGroup(/(?:ma khach hang\s*\/?\s*danh ba|danh ba)\s*:?\s*([a-z0-9-]+)/, norm);
  return {
    type: 'water',
    customerCode: code ? code.toUpperCase() : null,
    period: null, // tin nước không ghi kỳ: UI gán theo kỳ đang chọn
    indexStart: parseVnNumber(firstGroup(/chi so dau ky\s*:?\s*([\d.,]+)/, norm)),
    indexEnd: parseVnNumber(firstGroup(/chi so cuoi ky\s*:?\s*([\d.,]+)/, norm)),
    consumption: parseVnNumber(firstGroup(/tong san luong tieu thu\s*:?\s*([\d.,]+)\s*m3/, norm)),
    unitLabel: 'm³',
    amount: parseVnNumber(firstGroup(/tong so tien phai thanh toan\s*:?\s*([\d.,]+)/, norm)),
    dueDate: null, // tin nước không có hạn: chủ nhà tự chọn
    rawMessage: raw,
  };
}

// Trường bắt buộc: thiếu thì không ghi nhận mà đưa vào errors.
// Tin điện cần thêm kỳ vì khoá upsert dựa trên period.
const REQUIRED = {
  elec: ['customerCode', 'consumption', 'amount', 'period'],
  water: ['customerCode', 'consumption', 'amount'],
};

/**
 * Phân tích văn bản dán vào: tách thành nhiều tin, phân loại, trích trường.
 * @returns {{invoices: object[], errors: {reason: string, field?: string, snippet: string}[]}}
 */
export function parseMessages(text) {
  const raw = String(text ?? '');
  const { text: norm, map } = foldWithMap(raw);
  const invoices = [];
  const errors = [];

  if (!/[a-z0-9]/.test(norm)) return { invoices, errors };

  // Vị trí bắt đầu mỗi tin: 'embhy' (điện) hoặc 'ma khach hang' (nước)
  const markers = [...norm.matchAll(/embhy|ma khach hang/g)].map((m) => m.index);
  if (markers.length === 0) {
    errors.push({ reason: 'unrecognized', snippet: raw.trim() });
    return { invoices, errors };
  }
  // Đổi sang vị trí trong bản gốc và lùi về đầu dòng chứa marker, nhưng chỉ khi
  // phần trước marker trên dòng đó không có chữ/số (vd '• '), để tin nước giữ
  // nguyên bullet đầu dòng và rawMessage tin điện không dính '•' của tin sau.
  const starts = [...new Set(markers.map((idx) => {
    const pos = map[idx];
    const lineStart = raw.lastIndexOf('\n', pos - 1) + 1;
    return /[\p{L}\p{N}]/u.test(raw.slice(lineStart, pos)) ? pos : lineStart;
  }))].sort((a, b) => a - b);
  // Chữ đứng trước marker đầu tiên (tiêu đề...) gộp vào tin đầu tiên, không báo lỗi giả
  starts[0] = 0;

  starts.forEach((rawStart, i) => {
    const rawEnd = i + 1 < starts.length ? starts[i + 1] : raw.length;
    const snippet = raw.slice(rawStart, rawEnd).trim();
    const segNorm = normalize(snippet);
    if (!/[a-z0-9]/.test(segNorm)) return;

    let type = null;
    if (segNorm.includes('ma kh') && segNorm.includes('kwh')) type = 'elec';
    else if (segNorm.includes('chi so dau ky') && segNorm.includes('m3')) type = 'water';
    if (!type) {
      errors.push({ reason: 'unrecognized', snippet });
      return;
    }

    const inv = type === 'elec' ? parseElec(segNorm, snippet) : parseWater(segNorm, snippet);
    const missing = REQUIRED[type].filter((f) => inv[f] === null || inv[f] === undefined);
    if (missing.length) {
      missing.forEach((field) => errors.push({ reason: 'missing_field', field, snippet }));
    } else {
      invoices.push(inv);
    }
  });

  return { invoices, errors };
}
