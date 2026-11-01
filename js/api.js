// Lớp gọi Google Apps Script Web App. URL và token chỉ nằm trong localStorage, không hard-code.

const KEY_URL = 'hd_api_url';
const KEY_TOKEN = 'hd_api_token';
const TIMEOUT_MS = 20000;
// Chỉ gửi token tới script.google.com. (Redirect sang googleusercontent do trình duyệt tự theo, không phải URL người dùng nhập.)
const ALLOWED_HOSTS = ['script.google.com'];

/** Lỗi API có mã máy đọc được (code) và thông điệp tiếng Việt thân thiện (message). */
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
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
export async function call(action, payload = {}) {
  const url = readStore(KEY_URL);
  const token = readStore(KEY_TOKEN);
  if (!url || !token) {
    throw new ApiError('not_configured', 'Chưa cấu hình kết nối Google Sheets. Hãy vào trang Cấu hình để nhập URL và token.');
  }
  if (!isAllowedUrl(url)) {
    throw new ApiError('bad_url', 'URL Apps Script đã lưu không hợp lệ. Hãy nhập lại ở trang Cấu hình.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
      throw new ApiError('timeout', 'Hết thời gian chờ phản hồi (20 giây). Vui lòng thử lại.');
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
    throw new ApiError('server_error', 'Lỗi máy chủ Apps Script. Vui lòng thử lại sau.');
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
export const setup = () => call('setup');
