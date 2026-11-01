// Liên kết cài nhanh: mã hoá URL + token vào fragment (#cai-nhanh=...) để cài trên điện thoại.
// Module thuần, không phụ thuộc DOM. Chỉ dùng fragment '#' vì trình duyệt không gửi fragment lên máy chủ.

export const QUICK_PREFIX = '#cai-nhanh=';
// Giới hạn độ dài toàn bộ hash để chặn đầu vào bất thường
export const MAX_HASH_LENGTH = 2000;

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Dựng chuỗi hash '#cai-nhanh=<base64url(JSON {u,t})>'. */
export function buildQuickSetupHash(url, token) {
  return QUICK_PREFIX + toBase64Url(JSON.stringify({ u: String(url), t: String(token) }));
}

/** Giải hash; trả về {url, token} hoặc null nếu hỏng/thiếu trường/quá dài. Không kiểm tính hợp lệ của URL. */
export function parseQuickSetupHash(hash) {
  try {
    if (typeof hash !== 'string' || hash.length > MAX_HASH_LENGTH || !hash.startsWith(QUICK_PREFIX)) return null;
    const obj = JSON.parse(fromBase64Url(hash.slice(QUICK_PREFIX.length)));
    if (!obj || typeof obj.u !== 'string' || typeof obj.t !== 'string') return null;
    const url = obj.u.trim();
    const token = obj.t.trim();
    if (!url || !token) return null;
    return { url, token };
  } catch {
    return null;
  }
}
