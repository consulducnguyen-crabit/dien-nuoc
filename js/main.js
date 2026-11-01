// Điểm vào: router hash, bộ chọn Kỳ, trạng thái kết nối, điều hướng (sidebar + nav đáy).
import { getState, setState, subscribe, currentPeriod } from './state.js';
import { isConfigured } from './api.js';
import { reloadAll } from './data.js';
import { h } from './dom.js';
import { staggerIn, runCountUps } from './ui.js';
import { render as renderInput } from './pages/input.js';
import { render as renderStats } from './pages/stats.js';
import { render as renderNotice } from './pages/notice-page.js';
import { render as renderSettings } from './pages/settings.js';

const APP_NAME = 'Hoá đơn Nhà';

// rerenderOnPeriod: dựng lại trang khi đổi Kỳ. Trang Nhập KHÔNG dựng lại để không mất nội dung đã dán.
const ROUTES = {
  'nhap': { title: 'Nhập tin nhắn', render: renderInput, rerenderOnPeriod: false },
  'thong-ke': { title: 'Thống kê', render: renderStats, rerenderOnPeriod: true },
  'thong-bao': { title: 'Thông báo', render: renderNotice, rerenderOnPeriod: true },
  'cau-hinh': { title: 'Cấu hình', render: renderSettings, rerenderOnPeriod: false },
};
const DEFAULT_ROUTE = 'nhap';

const CONNECTION_TEXT = {
  none: 'Chưa kết nối',
  unchecked: 'Chưa kiểm tra',
  checking: 'Đang kiểm tra…',
  ok: 'Đã kết nối',
  error: 'Lỗi kết nối',
};

const view = document.getElementById('view');
const pageTitle = document.getElementById('page-title');
const periodInput = document.getElementById('period-input');
const connectionEl = document.getElementById('connection-status');

let currentKey = null;
let cleanup = null;      // hàm dọn dẹp do trang trả về (huỷ subscribe...)
let firstLoad = true;

function routeFromHash() {
  const key = location.hash.replace(/^#/, '');
  return Object.hasOwn(ROUTES, key) ? key : null;
}

function updateNav(key) {
  // Sidebar và nav đáy dùng chung href '#key'
  document.querySelectorAll('.nav-link, .bottom-nav a').forEach((a) => {
    if (a.getAttribute('href') === `#${key}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function renderRoute(key, { moveFocus }) {
  const route = ROUTES[key];
  currentKey = key;
  if (cleanup) { cleanup(); cleanup = null; }
  view.replaceChildren();
  try {
    const result = route.render(view);
    if (typeof result === 'function') cleanup = result;
  } catch (err) {
    console.error(err);
    view.replaceChildren(h('div', { class: 'card' },
      h('h2', null, 'Không hiển thị được trang'),
      h('p', { class: 'text-sub' }, 'Đã xảy ra lỗi, hãy tải lại trang.')));
  }
  staggerIn(view);
  runCountUps(view);
  updateNav(key);
  pageTitle.textContent = route.title;
  document.title = `${route.title} · ${APP_NAME}`;
  if (moveFocus) {
    // Đưa focus về h1 để trình đọc màn hình đọc tiêu đề trang mới
    pageTitle.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function navigate() {
  let key = routeFromHash();
  if (firstLoad) {
    firstLoad = false;
    // Lần đầu mở app chưa có URL/token: chuyển thẳng tới Cấu hình (chỉ một lần, sau đó người dùng đi tự do)
    if (!isConfigured()) key = 'cau-hinh';
    else if (!key) key = DEFAULT_ROUTE;
    history.replaceState(null, '', `#${key}`);
    renderRoute(key, { moveFocus: false });
    return;
  }
  if (!key) {
    key = DEFAULT_ROUTE;
    history.replaceState(null, '', `#${key}`);
  }
  renderRoute(key, { moveFocus: true });
}

setState({ connection: isConfigured() ? 'unchecked' : 'none' });

// ---- Bộ chọn Kỳ: mặc định tháng hiện tại, gắn với state ----
periodInput.value = currentPeriod();
function onPeriodChange() {
  const v = periodInput.value;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return; // bỏ qua giá trị rỗng/không hợp lệ
  // Hoá đơn của mọi kỳ đã nằm trong state nên đổi kỳ không cần tải lại
  setState({ period: v });
}
periodInput.addEventListener('change', onPeriodChange);
periodInput.addEventListener('input', onPeriodChange);

// ---- Lắng nghe state ----
const DATA_KEYS = ['units', 'config', 'invoices', 'loading'];
subscribe((s, changed) => {
  if (changed.includes('connection')) connectionEl.textContent = CONNECTION_TEXT[s.connection] || CONNECTION_TEXT.none;
  if (!currentKey) return;
  const route = ROUTES[currentKey];
  // Dựng lại khi đổi kỳ, hoặc khi dữ liệu đổi/đang tải (chỉ các trang chỉ-đọc)
  const dataChanged = changed.some((k) => DATA_KEYS.includes(k));
  if ((changed.includes('period') || dataChanged) && route.rerenderOnPeriod) {
    renderRoute(currentKey, { moveFocus: false });
  }
  // Trang Cấu hình chỉ dựng lại ở lần tải thành công đầu tiên (tránh mất chữ đang gõ ở các lần tải lại)
  if (changed.includes('loaded') && s.loaded && currentKey === 'cau-hinh') {
    renderRoute(currentKey, { moveFocus: false });
  }
});
connectionEl.textContent = CONNECTION_TEXT[getState().connection];

// Nút chuông: đưa tới trang Nhập để xử lý hoá đơn chưa khớp căn
document.querySelector('.icon-btn')?.addEventListener('click', () => { location.hash = '#nhap'; });

window.addEventListener('hashchange', navigate);
navigate();
// Tải dữ liệu thật khi mở app (chưa cấu hình thì reloadAll chỉ dọn state, không gọi mạng)
reloadAll();
