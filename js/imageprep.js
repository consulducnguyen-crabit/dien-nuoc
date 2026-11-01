// Chuẩn bị ảnh hoá đơn để gửi OCR: kiểm tra định dạng/kích thước, thu nhỏ bằng canvas, xuất JPEG base64.
// Không log nội dung ảnh.

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // ảnh gốc tối đa 8MB
const MAX_EDGE = 1400; // cạnh dài tối đa sau khi thu nhỏ
const JPEG_QUALITY = 0.8;
const JPEG_QUALITY_LOW = 0.7; // dùng khi base64 > SOFT_BASE64_LEN
const SOFT_BASE64_LEN = 1200000;
const MAX_BASE64_LEN = 2500000; // khớp giới hạn ở Code.gs

/** Lỗi kiểm tra ảnh phía trình duyệt, message tiếng Việt hiển thị trực tiếp. */
export class ImageError extends Error {}

/** Kiểm tra file chọn từ máy; ném ImageError nếu không hợp lệ. */
export function validateImageFile(file) {
  if (!file) throw new ImageError('Chưa chọn ảnh.');
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageError('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP. Ảnh HEIC hãy chụp lại ở chế độ tương thích nhất.');
  }
  if (file.size > MAX_SOURCE_BYTES) throw new ImageError('Ảnh quá lớn (tối đa 8 MB).');
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageError('Không mở được ảnh. Hãy chọn ảnh khác.'));
    img.src = url;
  });
}

/**
 * Thu nhỏ ảnh (cạnh dài <= 1400px), nền trắng, xuất JPEG q0.8 (q0.7 nếu base64 > 1,2 triệu ký tự).
 * @param {string} objectUrl URL tạm của file (do nơi gọi tạo và thu hồi)
 * @returns {Promise<{base64: string, mime: 'image/jpeg'}>} base64 không kèm tiền tố data:
 */
export async function prepareImage(objectUrl) {
  const img = await loadImage(objectUrl);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) throw new ImageError('Ảnh không hợp lệ.');
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // nền trắng cho PNG/WebP trong suốt (JPEG không có alpha)
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  let base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  // Ảnh còn lớn thì nén mạnh hơn để giảm tải/nguy cơ Google từ chối.
  if (base64.length > SOFT_BASE64_LEN) {
    dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY_LOW);
    base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  }
  if (!base64 || base64.length > MAX_BASE64_LEN) throw new ImageError('Ảnh sau khi nén vẫn quá lớn. Hãy chọn ảnh nhỏ hơn.');
  return { base64, mime: 'image/jpeg' };
}
