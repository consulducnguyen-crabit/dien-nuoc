// Thẻ "Hoá đơn kỳ ..." ở đầu trang Nhập: ma trận căn x (Điện | Nước), ô xanh = đã có, ô đỏ = chưa có.
// Tự subscribe state và chỉ dựng lại chính nó, KHÔNG đụng phần còn lại của trang
// (giữ nội dung đã dán / ảnh đã chọn / kết quả đang sửa).
import { h, svg } from '../dom.js';
import { getState, setState, subscribe } from '../state.js';
import { formatPeriod, formatMoney, defaultDueDate } from '../format.js';
import { renderDataGate, toast, setBusy } from '../ui.js';
import { listMissing, summarizeUnit } from '../summary.js';
import {
  buildNoticeNode, loadHtmlToImage, renderNoticePng, noticeFileName, downloadDataUrl, copyPngToClipboard,
} from '../notice.js';
import { qrFromConfig } from '../qr.js';
import { markNotified, ApiError } from '../api.js';
import { withNotified, errorMessage } from '../data.js';

// Khoá state ảnh hưởng tới thẻ này
const WATCH = ['units', 'invoices', 'loaded', 'loading', 'period'];

/** Dấu ✓ / ✕ vẽ bằng SVG inline (trang trí; nghĩa nằm ở chữ + aria-label của ô). */
function markIcon(ok) {
  return svg('svg', { class: 'track-mark', viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', focusable: 'false' },
    svg('path', {
      d: ok ? 'M3 8.5l3.2 3.2L13 4.8' : 'M4 4l8 8M12 4l-8 8',
      fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
}

/** Dấu ✓✓ (đã thông báo), trang trí; nghĩa nằm ở chữ + aria-label. */
function doubleMarkIcon() {
  return svg('svg', { class: 'track-mark', viewBox: '0 0 20 16', width: 20, height: 16, 'aria-hidden': 'true', focusable: 'false' },
    svg('path', {
      d: 'M1.5 8.5l3 3L10 5M8 10.5l1.5 1.5L18 4.8',
      fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
}

/** Icon "sao chép" (hai tờ giấy) cho nút trong ô. */
function copyIcon() {
  return svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' },
    svg('rect', { x: 9, y: 9, width: 11, height: 11, rx: 2, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
    svg('path', { d: 'M5 15V6a2 2 0 0 1 2-2h9', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

const KIND_NAME = { elec: 'điện', water: 'nước' };
// Khoá hoá đơn đang tạo ảnh: nút bị khoá kể cả khi thẻ vẽ lại giữa chừng
const busy = new Set();
let repaint = () => {};

/** Dựng ảnh thông báo RIÊNG một loại ở node ngoài màn hình (không dùng display:none để html-to-image vẫn render được). */
async function makeImage(unit, kind) {
  const { invoices, period, config } = getState();
  const summary = summarizeUnit({ name: unit }, invoices, period);
  const host = h('div', { 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0;width:420px;pointer-events:none' });
  host.append(buildNoticeNode({ summary, period, dueDate: defaultDueDate(period), config, qrDataUrl: qrFromConfig(config), only: kind }));
  document.body.append(host);
  try {
    return await renderNoticePng(host.firstElementChild);
  } catch {
    toast('Không tạo được ảnh. Kiểm tra kết nối Internet (cần tải thư viện xuất ảnh) rồi thử lại.', 'error');
    return null;
  } finally {
    host.remove(); // luôn thu dọn node tạm
  }
}

/** Lưu "đã thông báo" lên Sheet rồi cập nhật state. Lỗi không làm mất ảnh đã tạo (chỉ báo, ô giữ nguyên). */
async function persistNotified(inv) {
  if (!inv.key) return;
  try {
    await markNotified([inv.key], true);
    setState({ invoices: withNotified(getState().invoices, [inv.key], new Date().toISOString()) });
  } catch (err) {
    toast(err instanceof ApiError && err.code === 'bad_request'
      ? 'Cần cập nhật Apps Script (dán lại Code.gs và Deploy phiên bản mới) để lưu trạng thái "Đã thông báo". Ảnh vẫn dùng bình thường.'
      : `Chưa lưu được trạng thái "Đã thông báo": ${errorMessage(err)}`, 'error');
  }
}

/** Bấm nút: tạo ảnh, sao chép (hoặc tải file nếu không được) rồi đánh dấu đã thông báo. */
async function onCopyClick(btn, unit, kind, inv) {
  if (busy.has(inv.key)) return;
  busy.add(inv.key);
  setBusy(btn, true);
  try {
    // Gọi clipboard.write ngay trong click với Promise<dataUrl> (Safari yêu cầu cử chỉ người dùng); await sau
    const urlPromise = makeImage(unit, kind);
    const copied = await copyPngToClipboard(urlPromise);
    const url = await urlPromise;
    if (!url) return;
    const name = `${KIND_NAME[kind]} ${unit}`;
    if (copied) {
      toast(`Đã sao chép ảnh thông báo ${name}, có thể dán vào Zalo hoặc Messenger.`, 'ok');
    } else {
      downloadDataUrl(url, noticeFileName(unit, getState().period, kind));
      toast(`Trình duyệt không cho sao chép ảnh nên đã tải file thông báo ${name} về máy.`, 'info');
    }
    await persistNotified(inv);
  } finally {
    busy.delete(inv.key);
    setBusy(btn, false);
    repaint();
  }
}

/** Một ô Điện/Nước. Màu + icon + chữ (không chỉ dựa vào màu); số tiền chỉ hiện khi đủ rộng (CSS).
 *  Ô đã có hoá đơn kèm nút sao chép ảnh thông báo riêng loại đó; đã thông báo thì ô đổi sang xanh đậm. */
function cell(unit, kind, inv) {
  const label = kind === 'elec' ? 'Điện' : 'Nước';
  if (!inv) {
    return h('td', { class: 'track-td' },
      h('span', { class: 'track-cell track-no', role: 'img', 'aria-label': `${unit}, ${label}: chưa có` },
        markIcon(false), h('span', { class: 'track-word' }, 'Chưa')));
  }
  const notified = !!inv.notifiedAt;
  const isBusy = busy.has(inv.key);
  const status = h('span', {
    class: notified ? 'track-cell track-yes track-done' : 'track-cell track-yes',
    role: 'img',
    'aria-label': `${unit}, ${label}: ${notified ? 'đã có, đã thông báo' : 'đã có, chưa thông báo'}`,
  },
  notified ? doubleMarkIcon() : markIcon(true),
  h('span', { class: 'track-word' }, notified ? 'Đã thông báo' : 'Có'),
  inv.amount ? h('span', { class: 'track-amt' }, formatMoney(inv.amount)) : null);
  const btn = h('button', {
    type: 'button',
    class: isBusy ? 'track-copy is-loading' : 'track-copy',
    'aria-label': `${notified ? 'Sao chép lại' : 'Sao chép'} ảnh thông báo ${KIND_NAME[kind]} ${unit}`,
    title: 'Sao chép ảnh thông báo',
    disabled: isBusy,
    'aria-busy': isBusy ? 'true' : null,
    onClick: (e) => onCopyClick(e.currentTarget, unit, kind, inv),
  }, copyIcon());
  return h('td', { class: 'track-td' }, h('div', { class: 'track-box' }, status, btn));
}

/** Một hàng căn: tên căn (nút tạo thông báo nếu có ít nhất 1 loại) + 2 ô. */
function unitRow(r) {
  const nameNode = r.status !== 'none'
    ? h('button', {
      type: 'button', class: 'track-unit-btn', title: 'Tạo thông báo', 'aria-label': `Tạo thông báo cho căn ${r.unit}`,
      onClick: () => {
        setState({ selectedUnit: r.unit });
        location.hash = '#thong-bao';
      },
    }, r.unit)
    : h('span', { class: 'track-unit-name' }, r.unit);
  return h('tr', null,
    h('th', { scope: 'row', class: 'track-th' }, nameNode),
    cell(r.unit, 'elec', r.elec),
    cell(r.unit, 'water', r.water));
}

/** Dựng thẻ vào container; trả về hàm dọn (huỷ subscribe). */
export function mountTracker(container) {
  const root = h('div', { class: 'track' });
  // Vùng aria-live giữ nguyên node qua các lần vẽ lại (node bị thay mới thì trình đọc không đọc lại)
  const summaryEl = h('span', { class: 'track-summary', role: 'status', 'aria-live': 'polite' });
  container.append(root);

  function paint() {
    const state = getState();
    const gate = h('div', null);
    if (renderDataGate(gate, state)) {
      if (summaryEl.textContent) summaryEl.textContent = '';
      root.replaceChildren(...gate.childNodes);
      return;
    }
    const { rows, fullCount, total } = listMissing(state.units, state.invoices, state.period);
    // Giữ thứ tự căn như cấu hình (listMissing xếp căn thiếu lên trước -> khôi phục lại cho ma trận ổn định)
    const order = new Map((state.units || []).map((u, i) => [String(u.name).toUpperCase(), i]));
    const ordered = [...rows].sort((a, b) => order.get(a.unit) - order.get(b.unit));
    const text = `${fullCount}/${total} căn đủ`;
    // Chỉ gán khi đổi để không đọc lại thông báo giống hệt
    if (summaryEl.textContent !== text) summaryEl.textContent = text;
    const period = formatPeriod(state.period);
    root.replaceChildren(h('div', { class: 'card' },
      h('div', { class: 'card-head track-head' },
        h('h2', null, `Hoá đơn kỳ ${period}`),
        summaryEl),
      h('table', { class: 'track-table' },
        h('caption', { class: 'sr-only' }, `Trạng thái hoá đơn điện, nước từng căn kỳ ${period}`),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Căn')),
          h('th', { scope: 'col' }, 'Điện'),
          h('th', { scope: 'col' }, 'Nước'))),
        h('tbody', null, ...ordered.map(unitRow))),
    ));
  }
  repaint = paint;
  paint();
  loadHtmlToImage().catch(() => {}); // nạp sẵn thư viện xuất ảnh để bấm nút là chụp ngay (lỗi thì báo lúc bấm)

  const unsubscribe = subscribe((s, changed) => {
    if (changed.some((k) => WATCH.includes(k))) paint();
  });
  return () => { unsubscribe?.(); if (repaint === paint) repaint = () => {}; };
}
