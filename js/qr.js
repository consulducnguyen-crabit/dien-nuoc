// Chia/ghép data URL ảnh QR thành các mảnh lưu trong Config (mục 7.2). Thuần, không phụ thuộc DOM.

export const QR_PART_SIZE = 40000;   // ký tự mỗi mảnh (ô Sheets tối đa 50.000)
export const QR_MAX_LENGTH = 200000; // tổng ký tự tối đa sau khi nén
export const QR_MAX_PARTS = 10;      // khớp MAX_QR_PARTS ở Code.gs

/** Chỉ chấp nhận data URL ảnh (tránh chèn URL/script tuỳ ý vào thẻ img). */
export function isImageDataUrl(s) {
  return typeof s === 'string' && /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(s);
}

/** Cắt chuỗi thành các mảnh <= size ký tự. Chuỗi rỗng -> []. */
export function splitQr(dataUrl, size = QR_PART_SIZE) {
  const parts = [];
  for (let i = 0; i < dataUrl.length; i += size) parts.push(dataUrl.slice(i, i + size));
  return parts;
}

/** Ghép các mảnh; trả '' nếu thiếu mảnh hoặc kết quả không phải data URL ảnh hợp lệ. */
export function joinQr(parts) {
  const s = (parts || []).join('');
  return isImageDataUrl(s) ? s : '';
}

/** Đọc từ config Sheets (qr_parts, qr_part_N) -> data URL hoặc ''. */
export function qrFromConfig(config) {
  const n = parseInt(config?.qr_parts, 10);
  if (!Number.isInteger(n) || n <= 0 || n > QR_MAX_PARTS) return '';
  const parts = [];
  for (let i = 0; i < n; i++) {
    const p = config[`qr_part_${i}`];
    if (typeof p !== 'string' || !p) return ''; // thiếu mảnh -> coi như không có QR
    parts.push(p);
  }
  return joinQr(parts);
}

/** Tạo phần config cần saveConfig; dataUrl rỗng -> { qr_parts: 0 } (server tự xoá mảnh dư). */
export function qrToConfig(dataUrl) {
  if (!dataUrl) return { qr_parts: 0 };
  const parts = splitQr(dataUrl);
  const cfg = { qr_parts: parts.length };
  parts.forEach((p, i) => { cfg[`qr_part_${i}`] = p; });
  return cfg;
}
