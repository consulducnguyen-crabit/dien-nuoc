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

// ===== Hoá đơn nước từ ảnh (văn bản OCR của màn hình 'Thanh toán MM - YYYY') =====

// Token số có thể lẫn ký tự OCR nhầm (O/o->0, l/I/|->1); phải đứng sau ranh giới chữ.
const OCR_TOKEN = /(?<![a-z0-9])[0-9oli|][0-9oli|.,]*/g;

/** Sửa ký tự OCR nhầm trong một token số rồi đọc giá trị; ',' hoặc '.' kiểu nghìn (1-3 chữ số) coi là ngăn nghìn. */
function ocrNumber(token) {
  const t = String(token).replace(/[oO]/g, '0').replace(/[lI|iL]/g, '1').replace(/[.,]+$/, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''));
  return parseVnNumber(t);
}

/** Mọi token số (phải có ít nhất 1 chữ số thật) trong chuỗi đã normalize. */
function numberTokens(s) {
  return [...s.matchAll(OCR_TOKEN)].map((m) => m[0]).filter((t) => /\d/.test(t));
}

// Dòng chỉ gồm số (giá trị bị OCR tách sang dòng riêng sau nhãn), cho phép đơn vị 'm3' đứng cuối
const isNumericLine = (l) => /^[0-9oli|.,\s]+(?:m\s*3?)?\s*$/.test(l) && /\d/.test(l);

/**
 * Tìm giá trị số sau nhãn: ưu tiên cùng dòng, nếu không có thì các dòng toàn số kế tiếp.
 * pick: 'first' | 'last' token trong nhóm tìm được.
 */
function valueAfterLabel(lines, labelRe, pick = 'first') {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelRe);
    if (!m) continue;
    let tokens = numberTokens(lines[i].slice(m.index + m[0].length));
    for (let j = i + 1; !tokens.length && j < lines.length && j <= i + 3 && isNumericLine(lines[j]); j++) {
      tokens = numberTokens(lines[j]);
    }
    if (!tokens.length) continue;
    const v = ocrNumber(pick === 'last' ? tokens[tokens.length - 1] : tokens[0]);
    if (v !== null) return v;
  }
  return null;
}

/** Mã khách hàng: từ ngay sau nhãn (cùng dòng hoặc dòng kế tiếp). */
function codeAfterLabel(lines, labelRe) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelRe);
    if (!m) continue;
    for (const s of [lines[i].slice(m.index + m[0].length), lines[i + 1] || '']) {
      const w = s.replace(/^[\s:;.|-]+/, '').match(/^([a-z0-9-]+)/);
      if (w && /\d/.test(w[1])) return w[1].toUpperCase();
    }
  }
  return null;
}

/**
 * Dự phòng khi OCR đọc bảng THEO CỘT (nhãn và số tách xa nhau): gom các số tiền dạng nhóm nghìn
 * nằm sau tiêu đề cột 'Thành tiền' (hoặc sau 'Tổng tiền'/'Thuế') tới trước 'Bằng chữ'.
 * Số không nhóm nghìn (22, 506, 33, 0000...) bị bỏ qua tự nhiên; đơn giá nằm trước tiêu đề cột.
 * @returns {{amount, sub, discount, vat, warning}|null} null nếu < 4 số tiền
 */
function amountFromColumns(lines) {
  let start = lines.findIndex((l) => /thanh tien/.test(l));
  if (start < 0) {
    const cand = lines.map((l, i) => (/^[^a-z0-9]*(tong tien|thue)\b/.test(l) ? i : -1)).filter((i) => i >= 0);
    if (!cand.length) return null;
    start = Math.min(...cand);
  }
  let end = lines.findIndex((l, i) => i > start && /bang chu/.test(l));
  if (end < 0) end = lines.length;
  const seq = [];
  for (const l of lines.slice(start, end)) {
    for (const t of numberTokens(l)) {
      const fixed = t.replace(/[oO]/g, '0').replace(/[lI|iL]/g, '1').replace(/[.,]+$/, '');
      if (/^\d{1,3}([.,]\d{3})+$/.test(fixed)) seq.push(ocrNumber(t));
    }
  }
  if (seq.length < 4) return null;
  // (a) 4 số cuối đúng thứ tự [cộng, giảm trừ, thuế, tổng]
  const [c, g, v, T] = seq.slice(-4);
  if (c - g + v === T) return { amount: T, sub: c, discount: g, vat: v, warning: null };
  // (b) thứ tự cột bị xáo: tìm bộ a - g + t == T, ưu tiên T đứng muộn nhất trong dãy
  for (let ti = seq.length - 1; ti >= 0; ti--) {
    for (let ai = 0; ai < seq.length; ai++) {
      for (let gi = 0; gi < seq.length; gi++) {
        for (let vi = 0; vi < seq.length; vi++) {
          if (new Set([ti, ai, gi, vi]).size < 4) continue;
          if (seq[ai] - seq[gi] + seq[vi] === seq[ti] && seq[ai] >= seq[gi] && seq[ai] >= seq[ti]) {
            return {
              amount: seq[ti], sub: seq[ai], discount: seq[gi], vat: seq[vi],
              warning: 'Tổng tiền suy ra từ bộ số khớp công thức (thứ tự cột bị xáo), hãy kiểm tra lại.',
            };
          }
        }
      }
    }
  }
  // (c) không bộ nào khớp: lấy số cuối dãy
  return { amount: seq[seq.length - 1], sub: null, discount: null, vat: null, warning: 'Tổng tiền suy ra từ thứ tự cột, hãy kiểm tra lại' };
}

/**
 * Phân tích văn bản OCR của ảnh hoá đơn nước (thuần). Chịu lỗi OCR: số cùng dòng hoặc dòng kế,
 * O/0, l/1, dấu '.'/',' ngăn nghìn, thứ tự dòng xáo trộn.
 * @returns {{invoices: object[], errors: object[], warnings: string[]}}
 *   warnings: cảnh báo không chặn (vd bảng tiền không khớp); cũng nằm trong invoice.warnings.
 */
export function parseWaterReceiptText(text) {
  const raw = String(text ?? '');
  const invoices = [];
  const errors = [];
  const warnings = [];
  const lines = raw.split(/\r?\n/).map(normalize).filter((l) => /[a-z0-9]/.test(l));
  if (!lines.length) return { invoices, errors, warnings };

  const joined = lines.join(' ');
  let period = null;
  const pm = joined.match(/thanh toan\s*([0-9oli|]{1,2})\s*[-–—_.\/]?\s*([0-9oli|]{4})(?![0-9])/);
  if (pm) {
    const mo = ocrNumber(pm[1]);
    const yr = ocrNumber(pm[2]);
    if (mo >= 1 && mo <= 12 && yr >= 2000 && yr <= 2100) period = `${yr}-${pad2(mo)}`;
  }

  const customerCode = codeAfterLabel(lines, /ma\s*khach\s*hang\s*/);
  const indexStart = valueAfterLabel(lines, /chi so cu\b\s*:?/);
  const indexEnd = valueAfterLabel(lines, /chi so moi\b\s*:?/);
  const consumption = valueAfterLabel(lines, /tieu thu\s*:?/);
  // Dòng bảng: số tiền là token cuối dòng (Cộng có thêm cột số lượng đứng trước)
  let sub = valueAfterLabel(lines, /^[^a-z0-9]*cong\b/, 'last');
  let discount = valueAfterLabel(lines, /^[^a-z0-9]*giam tru\b/, 'last');
  let vat = valueAfterLabel(lines, /^[^a-z0-9]*thue\b/, 'last');
  let amount = valueAfterLabel(lines, /^[^a-z0-9]*tong tien\b\s*:?/, 'last');
  // Đường ưu tiên: số ngay sau nhãn 'Tổng tiền'. Không có -> suy từ dãy số theo cột
  let colWarning = null;
  if (amount === null) {
    const col = amountFromColumns(lines);
    if (col) {
      ({ amount, warning: colWarning } = col);
      // Cộng/giảm trừ/thuế đọc theo nhãn có thể sai trong bố cục cột -> dùng bộ số đã đối chiếu
      sub = col.sub; discount = col.discount; vat = col.vat;
    }
  }

  const inv = {
    type: 'water', customerCode, period, periodSource: period ? 'image' : null,
    indexStart, indexEnd, consumption, unitLabel: 'm³', amount, dueDate: null,
    rawMessage: raw, fromImage: true, warnings: [],
  };

  // Không nhận ra nhãn nào: không phải ảnh hoá đơn nước
  const found = [customerCode, indexStart, indexEnd, consumption, amount, period].some((v) => v !== null);
  if (!found) {
    errors.push({ reason: 'unrecognized', snippet: raw.trim() });
    return { invoices, errors, warnings };
  }

  const missing = REQUIRED.water.filter((f) => inv[f] === null);
  if (missing.length) {
    missing.forEach((field) => errors.push({ reason: 'missing_field', field, snippet: raw.trim() }));
    return { invoices, errors, warnings };
  }

  if ([sub, discount, vat].every((v) => v !== null) && sub - discount + vat !== amount) {
    inv.warnings.push('Bảng tiền không khớp (Cộng − Giảm trừ + Thuế ≠ Tổng tiền), có thể OCR đọc sai số.');
  }
  if (colWarning) inv.warnings.push(colWarning);
  warnings.push(...inv.warnings);
  invoices.push(inv);
  return { invoices, errors, warnings };
}

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
