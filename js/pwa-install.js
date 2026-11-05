// Cài ứng dụng lên màn hình chính (PWA). detectPlatform là hàm thuần (test được trong Node);
// phần còn lại giữ sự kiện cài đặt của trình duyệt ở cấp module để trang Cấu hình dùng lại.

const INAPP_RE = /Zalo|FBAN|FBAV|Instagram|Line\//;

/**
 * Phân loại nền tảng để chọn cách cài. Ưu tiên: installed > prompt > inapp > ios > other.
 * @param {{userAgent?:string, maxTouchPoints?:number, standalone?:boolean, hasPrompt?:boolean}} o
 * @returns {'installed'|'prompt'|'ios'|'inapp'|'other'}
 */
export function detectPlatform({ userAgent = '', maxTouchPoints = 0, standalone = false, hasPrompt = false } = {}) {
  if (standalone) return 'installed';
  if (hasPrompt) return 'prompt';
  if (INAPP_RE.test(userAgent)) return 'inapp';
  // iPadOS 13+ giả UA Macintosh nhưng có cảm ứng đa điểm
  const isIos = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return isIos ? 'ios' : 'other';
}

// Hướng dẫn thủ công cho nền tảng không có hộp thoại cài tự động (chuỗi hằng, không chứa dữ liệu người dùng)
export const INSTALL_GUIDE = {
  ios: {
    title: 'Thêm vào màn hình chính (iPhone/iPad)',
    message: 'Mở trang này bằng Safari rồi làm theo các bước:',
    steps: ['Bấm nút Chia sẻ (hình ô vuông có mũi tên lên) ở thanh công cụ Safari.', 'Chọn “Thêm vào Màn hình chính”.', 'Bấm “Thêm” ở góc trên bên phải.'],
  },
  inapp: {
    title: 'Hãy mở bằng trình duyệt',
    message: 'Trình duyệt trong ứng dụng (Zalo, Facebook, Instagram...) không thêm được vào màn hình chính.',
    steps: ['Mở menu của ứng dụng đang dùng, chọn “Mở bằng trình duyệt” (Safari hoặc Chrome).', 'Quay lại trang Cấu hình và bấm lại nút này.'],
  },
  other: {
    title: 'Thêm vào màn hình chính',
    message: 'Làm theo các bước sau để thêm vào màn hình chính:',
    steps: ['Mở menu của trình duyệt (dấu ba chấm hoặc ba gạch).', 'Chọn “Thêm vào màn hình chính” hoặc “Cài đặt ứng dụng”.'],
  },
};

let deferredPrompt = null;
let installed = false;
let initialized = false;
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn());

/** Gọi 1 lần khi tải app: giữ sự kiện cài đặt (Chrome/Edge Android) để bấm nút mới hiện hộp thoại. */
export function initInstallCapture() {
  if (initialized) return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // chặn mini-infobar, giữ lại để gọi khi người dùng bấm nút
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true;
}

export function getInstallPlatform() {
  return detectPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: installed || isStandalone(),
    hasPrompt: !!deferredPrompt,
  });
}

/** Đăng ký nghe thay đổi trạng thái cài đặt; trả về hàm huỷ. */
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hiện hộp thoại cài của trình duyệt. Sự kiện chỉ dùng được 1 lần nên bỏ ngay sau khi gọi. */
export async function promptInstall() {
  const evt = deferredPrompt;
  if (!evt) return null;
  deferredPrompt = null;
  try {
    evt.prompt();
    const choice = await evt.userChoice;
    return choice?.outcome ?? null;
  } finally {
    notify();
  }
}
