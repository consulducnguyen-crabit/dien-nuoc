// Lớp gọi Google Apps Script Web App. URL và token chỉ nằm trong localStorage, không hard-code.

const KEY_URL = 'hd_api_url';
const KEY_TOKEN = 'hd_api_token';
const TIMEOUT_MS = 20000;
// Chỉ gửi token tới script.google.com. (Redirect sang googleusercontent do trình duyệt tự theo, không phải URL người dùng nhập.)
const ALLOWED_HOSTS = ['script.google.com'];

/** Lỗi API có mã máy đọc được (code) và thông điệp tiếng Việt thân thiện (message). */
export class ApiError extends Error {
  constructor(code, message, detail, hint) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail; // mã phân loại từ server (chỉ ocrImage)
    this.hint = hint; // message gốc đã làm sạch từ server
  }
}

function readStore(key) {
  try {
    return (localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

/** URL hợp lệ: https, host script.google.com, đường dẫn đúng /macros/s/<id>/exec, không userinfo/port. */
export function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname)
      && !u.username && !u.password && u.port === ''
      && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname);
  } catch {
    return false;
  }
}

export function isConfigured() {
  return isAllowedUrl(readStore(KEY_URL)) && readStore(KEY_TOKEN) !== '';
}

/** Lưu URL + token; ném ApiError nếu URL không hợp lệ. */
export function saveConnection(url, token) {
  const u = String(url || '').trim();
  const t = String(token || '').trim();
  if (!isAllowedUrl(u)) {
    throw new ApiError(
      'bad_url',
      'URL không hợp lệ. Hãy dán đường dẫn Web app có dạng https://script.google.com/macros/s/…/exec.'
    );
  }
  if (!t) throw new ApiError('bad_token', 'Vui lòng nhập token truy cập.');
  localStorage.setItem(KEY_URL, u);
  localStorage.setItem(KEY_TOKEN, t);
}

export function clearConnection() {
  try {
    localStorage.removeItem(KEY_URL);
    localStorage.removeItem(KEY_TOKEN);
  } catch {
    // bỏ qua: trình duyệt chặn localStorage
  }
}

/** Gọi một action; trả về phần dữ liệu của phản hồi (đã bỏ cờ ok). */
export async function call(action, payload = {}, timeoutMs = TIMEOUT_MS) {
  const url = readStore(KEY_URL);
  const token = readStore(KEY_TOKEN);
  if (!url || !token) {
    throw new ApiError('not_configured', 'Chưa cấu hình kết nối Google Sheets. Hãy vào trang Cấu hình để nhập URL và token.');
  }
  if (!isAllowedUrl(url)) {
    throw new ApiError('bad_url', 'URL Apps Script đã lưu không hợp lệ. Hãy nhập lại ở trang Cấu hình.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    // text/plain để tránh preflight CORS; token nằm trong body, không đặt trên URL.
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, token }),
      signal: controller.signal,
      credentials: 'omit',
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new ApiError('timeout', `Hết thời gian chờ phản hồi (${Math.round(timeoutMs / 1000)} giây). Vui lòng thử lại.`);
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ApiError(
      'network',
      offline
        ? 'Mất kết nối mạng. Hãy kiểm tra Internet rồi thử lại.'
        : 'Không kết nối được tới Google Apps Script. Kiểm tra mạng và URL Web app.'
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ApiError('server_error', 'Máy chủ Google Apps Script trả về lỗi. Vui lòng thử lại sau.');
  }

  let data;
  try {
    data = await res.json();
  } catch {
    // Thường gặp khi Web app chưa chia sẻ "Anyone" hoặc URL không đúng (trả về trang HTML).
    throw new ApiError('server_error', 'Phản hồi không hợp lệ. Hãy kiểm tra URL Web app và quyền truy cập "Anyone".');
  }

  if (!data || data.ok !== true) {
    const code = data && data.error;
    if (code === 'unauthorized') {
      throw new ApiError('unauthorized', 'Sai token hoặc chưa đặt API_TOKEN trong Apps Script. Hãy kiểm tra lại ở trang Cấu hình.');
    }
    if (code === 'bad_request') {
      throw new ApiError('bad_request', 'Dữ liệu gửi lên không hợp lệ. Hãy kiểm tra lại thông tin đã nhập.');
    }
    const detail = typeof data.detail === 'string' ? data.detail.slice(0, 50) : undefined;
    const hint = typeof data.hint === 'string' ? data.hint.slice(0, 200) : undefined;
    throw new ApiError('server_error', 'Lỗi máy chủ Apps Script. Vui lòng thử lại sau.', detail, hint);
  }
  const { ok, ...rest } = data;
  return rest;
}

// ===== Hàm tiện ích theo action =====
export const ping = () => call('ping');
/** period tuỳ chọn dạng YYYY-MM để chỉ lấy hoá đơn của một kỳ. */
export const getAll = (period) => call('getAll', period ? { period } : {});
/** invoices: mảng object dùng tên cột snake_case (period, unit, type, ...). */
export const saveInvoices = (invoices) => call('saveInvoices', { invoices });
export const saveUnits = (units) => call('saveUnits', { units });
/** config: object { key: value } chỉ gồm các key được phép (bank_*, transfer_template, qr_parts, qr_part_N). */
export const saveConfig = (config) => call('saveConfig', { config });
export const deleteInvoice = (key) => call('deleteInvoice', { key });
/** Đánh dấu (notified=true) hoặc bỏ đánh dấu "đã thông báo"; keys: chuỗi 'YYYY-MM|CĂN|elec|water', tối đa 20. Server cũ -> bad_request. */
export const markNotified = (keys, notified) => call('markNotified', { keys, notified });
export const setup =() => call('setup');

const OCR_TIMEOUT_MS = 60000;
/**
 * OCR ảnh qua Google Drive. base64 không kèm tiền tố data:; mime: image/jpeg | image/png | image/webp.
 * Trả { text }. Lỗi máy chủ thường do chưa bật Drive API / chưa cấp quyền Drive cho script.
 */
/** Dịch mã lỗi OCR của server sang thông báo tiếng Việt; null nếu không có/không nhận ra detail. Chỉ trả chuỗi thuần (hiển thị bằng textContent). */
export function describeOcrDetail(detail, hint) {
  // Nối nguyên văn lỗi gốc (đã làm sạch ở server) để người dùng/dev biết Google báo gì.
  const extra = hint ? ` (Chi tiết từ Google: ${hint})` : '';
  switch (detail) {
    case 'drive_not_enabled':
      return 'Chưa bật dịch vụ Drive API trong Apps Script (Services > Drive API v2, hoặc dán lại appsscript.json) rồi Deploy phiên bản mới.';
    case 'no_permission':
      return 'Chưa cấp quyền Drive/Documents: chạy hàm testOcr trong editor, cấp quyền, rồi Deploy phiên bản mới.';
    case 'quota':
      return `Vượt hạn mức Google, thử lại sau.${extra}`;
    case 'rate_limited':
      return `Google đang giới hạn tốc độ, vui lòng đợi vài chục giây rồi bấm Đọc ảnh lại${extra}`;
    case 'drive_rejected':
    case 'ocr_failed':
      return `Google từ chối đọc ảnh.${extra}`;
    default:
      return null;
  }
}

export async function ocrImage(base64, mime) {
  try {
    return await call('ocrImage', { image: base64, mime }, OCR_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'server_error') {
      const specific = describeOcrDetail(err.detail, err.hint);
      if (specific) throw new ApiError('server_error', specific, err.detail, err.hint);
      throw new ApiError('server_error',
        'Không đọc được ảnh. Hãy kiểm tra đã bật Drive API (appsscript.json), cấp quyền Drive và Deploy phiên bản mới (xem README).');
    }
    if (err instanceof ApiError && err.code === 'bad_request') {
      throw new ApiError('bad_request',
        'Máy chủ từ chối ảnh (sai định dạng, quá lớn, hoặc Code.gs chưa là bản mới có ocrImage). Hãy thử ảnh khác.');
    }
    throw err;
  }
}
