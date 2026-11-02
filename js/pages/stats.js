// Trang Thống kê (#thong-ke), mục 8.2. Đọc units/invoices/period từ state (dữ liệu thật từ Google Sheets).
import { h, icon } from '../dom.js';
import { getState, setState, subscribe } from '../state.js';
import { formatMoney, formatNumber, formatPeriod, invoiceKey } from '../format.js';
import { toast, countEl, donut, setBusy, renderDataGate } from '../ui.js';
import { deleteInvoice } from '../api.js';
import { reloadAll, errorMessage } from '../data.js';
import { summarizeUnit, STATUS_META } from '../summary.js';
import { KIND_NAME, copyIcon, isBusy, copyKindNotice } from '../notify-actions.js';
import { loadHtmlToImage } from '../notice.js';
import { confirmDialog } from '../modal.js';

let repaintCards = () => {};

/** Một khối Điện/Nước trong thẻ căn: số liệu + trạng thái thông báo riêng loại này + nút sao chép ảnh. */
function usageBlock(unit, kind, label, chipClass, inv, onDone) {
  const notified = !!inv.notifiedAt;
  const loading = isBusy(inv);
  return h('div', { class: 'usage' },
    h('span', { class: `chip ${chipClass}` }, label),
    h('div', { class: 'usage-main' },
      h('span', { class: 'num' }, `${formatNumber(inv.consumption)} ${inv.unitLabel}`),
      h('strong', { class: 'num' }, formatMoney(inv.amount)),
    ),
    h('div', { class: 'usage-notify' },
      h('span', { class: notified ? 'notify-state is-done' : 'notify-state' }, notified ? '✓✓ Đã thông báo' : 'Chưa thông báo'),
      h('button', {
        type: 'button',
        class: loading ? 'track-copy usage-copy is-loading' : 'track-copy usage-copy',
        'aria-label': `${notified ? 'Sao chép lại' : 'Sao chép'} ảnh thông báo ${KIND_NAME[kind]} ${unit}`,
        title: 'Sao chép ảnh thông báo',
        disabled: loading,
        'aria-busy': loading ? 'true' : null,
        onClick: (e) => copyKindNotice(e.currentTarget, unit, kind, inv, onDone),
      }, copyIcon()),
    ),
  );
}

function unitCard(s) {
  if (s.status === 'none') {
    return h('div', { class: 'card card-empty' },
      h('div', { class: 'unit-head' }, h('h2', null, s.unit), h('span', { class: 'chip' }, STATUS_META.none.label)),
      h('p', { class: 'text-sub' }, 'Chưa có hoá đơn điện hoặc nước trong kỳ này.'),
      h('a', { class: 'btn btn-secondary btn-sm', href: '#nhap', onClick: () => setState({ selectedUnit: s.unit }) }, 'Dán tin nhắn'),
    );
  }
  const meta = STATUS_META[s.status];
  return h('div', { class: 'card' },
    h('div', { class: 'unit-head' }, h('h2', null, s.unit), h('span', { class: `chip ${meta.chip}` }, meta.label)),
    s.elec && usageBlock(s.unit, 'elec', 'Điện', 'chip-elec', s.elec, () => repaintCards()),
    s.water && usageBlock(s.unit, 'water', 'Nước', 'chip-water', s.water, () => repaintCards()),
    h('div', { class: 'total-row' }, h('span', { class: 'text-sub' }, 'Tổng'), h('strong', { class: 'num' }, formatMoney(s.total))),
  );
}

/** CSV tại client; BOM UTF-8 để Excel đọc đúng tiếng Việt. */
function exportCsv(summaries, period) {
  const head = ['Căn', 'Điện (kWh)', 'Tiền điện', 'Nước (m³)', 'Tiền nước', 'Tổng', 'Trạng thái'];
  const lines = summaries.map((s) => [
    s.unit,
    s.elec ? s.elec.consumption : '',
    s.elec ? s.elec.amount : '',
    s.water ? s.water.consumption : '',
    s.water ? s.water.amount : '',
    s.total,
    STATUS_META[s.status].label,
  ]);
  const cell = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@]/.test(t) && !/^-?\d+$/.test(t)) t = `'${t}`; // chặn CSV/formula injection
    return `"${t.replaceAll('"', '""')}"`;
  };
  const csv = [head, ...lines].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xFEFF), csv], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: `thong-ke_${period}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Đã xuất file CSV.', 'ok');
}

/** Xoá một hoá đơn (xác nhận trước), rồi tải lại dữ liệu. */
async function removeInvoice(inv, label, btn) {
  const ok = await confirmDialog({
    title: 'Xoá hoá đơn?',
    message: `Hoá đơn ${label} của căn ${inv.unit}, kỳ ${formatPeriod(inv.period)} sẽ bị xoá khỏi Google Sheets và không khôi phục được.`,
    confirmText: 'Xoá hoá đơn',
  });
  if (!ok) return;
  setBusy(btn, true);
  try {
    await deleteInvoice(inv.key || invoiceKey(inv.period, inv.unit, inv.type));
    toast('Đã xoá hoá đơn.', 'ok');
    await reloadAll();
  } catch (err) {
    toast(errorMessage(err), 'error');
    setBusy(btn, false);
  }
}

export function render(container) {
  if (renderDataGate(container, getState())) return;
  const { units, invoices, period } = getState();
  const summaries = units.map((u) => summarizeUnit(u, invoices, period));
  const grand = summaries.reduce((sum, s) => sum + s.total, 0);
  const fullCount = summaries.filter((s) => s.status === 'full').length;

  // Thẻ navy: tổng cần đóng + donut số căn đủ điện + nước
  const navy = h('div', { class: 'card card-navy' },
    h('div', null,
      h('p', { class: 'navy-label' }, `Tổng cần đóng ${formatPeriod(period).toLowerCase()}`),
      countEl('strong', 'num-xl navy-value', grand, 'money'),
      h('p', { class: 'navy-sub' }, `${fullCount}/${units.length} căn đã đủ điện + nước`),
    ),
    donut(fullCount, units.length),
  );

  // Bảng tổng hợp
  const dash = '—';
  const tbody = h('tbody', null, ...summaries.map((s) => {
    const meta = STATUS_META[s.status];
    return h('tr', null,
      h('th', { scope: 'row' }, s.unit),
      h('td', null, s.elec ? formatNumber(s.elec.consumption) : dash),
      h('td', null, s.elec ? formatMoney(s.elec.amount) : dash),
      h('td', null, s.water ? formatNumber(s.water.consumption) : dash),
      h('td', null, s.water ? formatMoney(s.water.amount) : dash),
      h('td', null, s.status === 'none' ? dash : formatMoney(s.total)),
      h('td', null, h('span', { class: `chip ${meta.chip}` }, meta.label)),
      h('td', null, h('div', { class: 'actions' },
        ...[['Điện', s.elec], ['Nước', s.water]].filter(([, inv]) => inv).map(([label, inv]) => {
          const btn = h('button', {
            type: 'button', class: 'btn btn-danger btn-sm', 'aria-label': `Xoá hoá đơn ${label.toLowerCase()} căn ${s.unit}`,
          }, icon('trash'), label);
          btn.addEventListener('click', () => removeInvoice(inv, label.toLowerCase(), btn));
          return btn;
        }))),
    );
  }));
  const table = h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('caption', { class: 'sr-only' }, `Tổng hợp hoá đơn ${formatPeriod(period)}`),
      h('thead', null, h('tr', null,
        ...['Căn', 'Điện (kWh)', 'Tiền điện', 'Nước (m³)', 'Tiền nước', 'Tổng', 'Trạng thái']
          .map((t) => h('th', { scope: 'col' }, t)),
        h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Thao tác')))),
      tbody,
    ),
  );

  // Chỉ vẽ lại lưới thẻ căn khi hoá đơn đổi (vd. vừa sao chép ảnh ở trang Nhập hoặc ngay tại đây), giữ nguyên phần còn lại
  const cardsGrid = h('div', { class: 'grid grid-3 grid-top' });
  function paintCards() {
    const st = getState();
    cardsGrid.replaceChildren(...st.units.map((u) => unitCard(summarizeUnit(u, st.invoices, st.period))));
  }
  repaintCards = paintCards;
  paintCards();
  loadHtmlToImage().catch(() => {}); // nạp sẵn thư viện xuất ảnh để bấm nút là chụp ngay

  container.append(
    navy,
    cardsGrid,
    h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', null, `Tổng hợp ${formatPeriod(period)}`),
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => exportCsv(summaries, period) }, 'Xuất CSV'),
      ),
      table,
    ),
  );
  const unsubscribe = subscribe((st, changed) => { if (changed.includes('invoices')) paintCards(); });
  return () => { unsubscribe(); if (repaintCards === paintCards) repaintCards = () => {}; };
}
