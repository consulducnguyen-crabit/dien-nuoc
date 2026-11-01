// Helper giao diện dùng chung: toast, count-up, fade-up lần lượt, spinner nút, skeleton, donut.
import { h, svg } from './dom.js';
import { formatMoney, formatNumber } from './format.js';
import { isConfigured } from './api.js';

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Toast góc trên phải (vùng aria-live #toast-region), tự ẩn sau 4s. type: 'ok' | 'error' | 'info'. */
export function toast(message, type = 'ok') {
  const region = document.getElementById('toast-region');
  if (!region) return;
  // Lỗi cần được đọc ngay: role="alert" (assertive); các loại khác dùng vùng aria-live sẵn có
  const node = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : null }, message);
  region.append(node);
  setTimeout(() => {
    node.classList.add('toast-leave');
    // Dùng timeout thay animationend vì reduced-motion tắt animation
    setTimeout(() => node.remove(), 220);
  }, 4000);
}

function formatKind(value, kind) {
  return kind === 'money' ? formatMoney(value) : formatNumber(value);
}

/** Phần tử số liệu lớn sẵn sàng count-up (text ban đầu = giá trị cuối để không nhấp nháy khi tắt hiệu ứng). */
export function countEl(tag, className, value, kind = 'number') {
  return h(tag, { class: className, 'data-count': value, 'data-kind': kind }, formatKind(value, kind));
}

/** Đếm tăng từ 0 đến target trong duration ms (mặc định 600). */
export function countUp(el, target, kind = 'number', duration = 600) {
  const end = Number(target) || 0;
  if (prefersReducedMotion() || end === 0) {
    el.textContent = formatKind(end, kind);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = formatKind(Math.round(end * eased), kind);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Chạy count-up cho mọi phần tử [data-count] trong root. */
export function runCountUps(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    countUp(el, el.dataset.count, el.dataset.kind || 'number');
  });
}

/** Gắn hiệu ứng fade-up lần lượt (60ms/thẻ, tối đa 12 bậc) cho các thẻ trong root. */
export function staggerIn(root, selector = '.card, .result-item') {
  root.querySelectorAll(selector).forEach((el, i) => {
    el.style.setProperty('--i', Math.min(i, 12));
    el.classList.remove('fade-up');
    void el.offsetWidth; // reflow để animation chạy lại khi gọi lần nữa
    el.classList.add('fade-up');
  });
}

/** Bật/tắt trạng thái đang xử lý của nút (spinner nhỏ, khoá nút). */
export function setBusy(button, busy) {
  button.disabled = busy;
  button.classList.toggle('is-loading', busy);
  if (busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

/** Khối skeleton/shimmer trong lúc chờ dữ liệu. */
export function skeleton(lines = 3) {
  const box = h('div', { class: 'skeleton-box', 'aria-hidden': 'true' });
  for (let i = 0; i < lines; i++) box.append(h('div', { class: 'skeleton skeleton-line' }));
  return box;
}

/**
 * Cổng dữ liệu cho các trang chỉ-đọc: khi chưa cấu hình / đang tải lần đầu / chưa có căn thì dựng
 * trạng thái thay thế vào container và trả về true (trang bỏ qua phần còn lại).
 */
export function renderDataGate(container, state) {
  if (!isConfigured()) {
    container.append(h('div', { class: 'card' },
      h('h2', null, 'Chưa kết nối Google Sheets'),
      h('p', { class: 'empty-state' }, 'Hãy nhập URL và token Apps Script để xem dữ liệu hoá đơn.'),
      h('a', { class: 'btn btn-secondary btn-sm', href: '#cau-hinh' }, 'Mở trang Cấu hình')));
    return true;
  }
  if (state.loading && !state.loaded) {
    container.append(h('div', { class: 'card', 'aria-busy': 'true' }, skeleton(4)));
    return true;
  }
  if (!state.loaded) {
    // Tải lỗi (mạng/sai token): lỗi đã được toast, ở đây chỉ gợi ý cách xử lý
    container.append(h('div', { class: 'card' },
      h('h2', null, 'Chưa tải được dữ liệu'),
      h('p', { class: 'empty-state' }, 'Không lấy được dữ liệu từ Google Sheets. Hãy kiểm tra kết nối ở trang Cấu hình.'),
      h('a', { class: 'btn btn-secondary btn-sm', href: '#cau-hinh' }, 'Mở trang Cấu hình')));
    return true;
  }
  if (!state.units.length) {
    container.append(h('div', { class: 'card' },
      h('h2', null, 'Chưa có căn nào'),
      h('p', { class: 'empty-state' }, 'Hãy thêm danh sách căn ở trang Cấu hình.'),
      h('a', { class: 'btn btn-secondary btn-sm', href: '#cau-hinh' }, 'Mở trang Cấu hình')));
    return true;
  }
  return false;
}

/** Donut SVG tự vẽ: done/total, chữ "done/total" ở giữa. Dùng trên nền navy. */
export function donut(done, total, size = 96) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const bar = svg('circle', {
    class: 'donut-bar', cx: 50, cy: 50, r,
    'stroke-dasharray': c, 'stroke-dashoffset': c, // bắt đầu rỗng, trượt tới giá trị đích
  });
  const node = svg('svg', {
    class: 'donut', viewBox: '0 0 100 100', width: size, height: size,
    role: 'img', 'aria-label': `${done} trên ${total} căn đã đủ điện và nước`,
  },
    svg('circle', { class: 'donut-track', cx: 50, cy: 50, r }),
    ratio > 0 ? bar : null, // 0/N: không vẽ cung (nét tròn đầu sẽ hiện thành một chấm)
    svg('text', { class: 'donut-text', x: 50, y: 56, 'text-anchor': 'middle' }, `${done}/${total}`),
  );
  // Hai khung hình để transition stroke-dashoffset chạy sau khi node vào DOM
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.setAttribute('stroke-dashoffset', c * (1 - ratio));
  }));
  return node;
}
