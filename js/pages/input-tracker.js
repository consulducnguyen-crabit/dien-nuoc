// Thẻ "Theo dõi hoá đơn kỳ ..." ở đầu trang Nhập. Tự subscribe state và chỉ dựng lại chính nó,
// KHÔNG đụng phần còn lại của trang (giữ nội dung đã dán / ảnh đã chọn / kết quả đang sửa).
import { h } from '../dom.js';
import { getState, setState, subscribe } from '../state.js';
import { formatPeriod } from '../format.js';
import { renderDataGate } from '../ui.js';
import { listMissing, STATUS_META } from '../summary.js';

// Khoá state ảnh hưởng tới thẻ này
const WATCH = ['units', 'invoices', 'loaded', 'loading', 'period'];

/** Một dòng căn: tên, chip Điện/Nước, nhãn tổng (STATUS_META như trang Thống kê), dòng "Còn thiếu", nút tạo thông báo. */
function unitRow(r) {
  const meta = STATUS_META[r.status];
  const chipFor = (label, inv, haveClass) => (inv
    ? h('span', { class: `chip ${haveClass}` }, `${label}: có`)
    : h('span', { class: 'chip chip-danger' }, `${label}: chưa có`));
  return h('li', { class: r.missing.length ? 'track-row track-missing' : 'track-row' },
    h('strong', { class: 'track-unit' }, r.unit),
    h('span', { class: 'track-chips' },
      chipFor('Điện', r.elec, 'chip-elec'),
      chipFor('Nước', r.water, 'chip-water'),
      h('span', { class: `chip ${meta.chip}` }, meta.label)),
    r.missing.length ? h('span', { class: 'track-gap' }, `Còn thiếu: ${r.missing.join(', ')}`) : null,
    r.status !== 'none'
      ? h('button', {
        type: 'button', class: 'btn btn-secondary btn-sm', 'aria-label': `Tạo thông báo cho căn ${r.unit}`,
        onClick: () => {
          setState({ selectedUnit: r.unit });
          location.hash = '#thong-bao';
        },
      }, 'Tạo thông báo')
      : null,
  );
}

/** Dựng thẻ vào container; trả về hàm dọn (huỷ subscribe). */
export function mountTracker(container) {
  const root = h('div', { class: 'track' });
  // Vùng aria-live giữ nguyên node qua các lần vẽ lại (node bị thay mới thì trình đọc không đọc lại)
  const summaryEl = h('p', { class: 'track-summary', role: 'status', 'aria-live': 'polite' });
  container.append(root);

  function paint() {
    const state = getState();
    const gate = h('div', null);
    if (renderDataGate(gate, state)) {
      if (summaryEl.textContent) summaryEl.textContent = '';
      root.replaceChildren(...gate.childNodes);
      return;
    }
    const { rows, summary } = listMissing(state.units, state.invoices, state.period);
    // Chỉ gán khi đổi để không đọc lại thông báo giống hệt
    if (summaryEl.textContent !== summary) summaryEl.textContent = summary;
    root.replaceChildren(h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', null, `Theo dõi hoá đơn kỳ ${formatPeriod(state.period)}`)),
      summaryEl,
      h('ul', { class: 'track-list', 'aria-label': `Trạng thái hoá đơn từng căn ${formatPeriod(state.period)}` },
        ...rows.map(unitRow)),
    ));
  }
  paint();

  const unsubscribe = subscribe((s, changed) => {
    if (changed.some((k) => WATCH.includes(k))) paint();
  });
  return () => unsubscribe?.();
}
