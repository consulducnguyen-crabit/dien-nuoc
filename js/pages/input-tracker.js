// Thẻ "Hoá đơn kỳ ..." ở đầu trang Nhập: ma trận căn x (Điện | Nước), ô xanh = đã có, ô đỏ = chưa có.
// Tự subscribe state và chỉ dựng lại chính nó, KHÔNG đụng phần còn lại của trang
// (giữ nội dung đã dán / ảnh đã chọn / kết quả đang sửa).
import { h, svg } from '../dom.js';
import { getState, setState, subscribe } from '../state.js';
import { formatPeriod, formatMoney } from '../format.js';
import { renderDataGate } from '../ui.js';
import { listMissing } from '../summary.js';

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

/** Một ô Điện/Nước. Màu + icon + chữ (không chỉ dựa vào màu); số tiền chỉ hiện khi đủ rộng (CSS). */
function cell(unit, label, inv) {
  return h('td', { class: 'track-td' },
    h('span', {
      class: inv ? 'track-cell track-yes' : 'track-cell track-no',
      role: 'img',
      'aria-label': `${unit}, ${label}: ${inv ? 'đã có' : 'chưa có'}`,
    },
    markIcon(!!inv),
    h('span', { class: 'track-word' }, inv ? 'Có' : 'Chưa'),
    inv && inv.amount ? h('span', { class: 'track-amt' }, formatMoney(inv.amount)) : null));
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
    cell(r.unit, 'Điện', r.elec),
    cell(r.unit, 'Nước', r.water));
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
  paint();

  const unsubscribe = subscribe((s, changed) => {
    if (changed.some((k) => WATCH.includes(k))) paint();
  });
  return () => unsubscribe?.();
}
