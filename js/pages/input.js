// Trang Nhập tin nhắn (#nhap), mục 8.1. Phase 2: kết quả "phân tích" là dữ liệu mẫu cố định.
// Phase 4 chỉ cần thay makeSampleParseResult() bằng parseMessages() + matchUnit().
import { h, icon } from '../dom.js';
import { getState, subscribe } from '../state.js';
import { formatMoney, formatNumber, formatNumberOrDash, formatDate, formatPeriod, invoiceKey } from '../format.js';
import { toast, setBusy, staggerIn } from '../ui.js';
import { parseMessages } from '../parser.js';
import { matchUnit } from '../matcher.js';
import { saveInvoices, isConfigured } from '../api.js';
import { reloadAll, invoiceToRow, errorMessage } from '../data.js';

const TYPE_META = {
  elec: { label: 'Điện', chip: 'chip-elec', icon: 'bolt' },
  water: { label: 'Nước', chip: 'chip-water', icon: 'drop' },
};

/** Danh sách "nhãn: giá trị" của một hoá đơn (dòng "Kỳ ghi nhận" của tin nước do buildItem tự dựng vì phụ thuộc các tin khác). */
function fieldRows(inv) {
  const rows = [['Mã khách hàng', inv.customerCode]];
  if (inv.type === 'elec') {
    rows.push(
      ['Kỳ', `${formatDate(inv.periodFrom) || '—'} – ${formatDate(inv.periodTo) || '—'}`],
      ['Chỉ số cuối kỳ', formatNumberOrDash(inv.indexEnd)],
      ['Điện tiêu thụ', `${formatNumber(inv.consumption)} ${inv.unitLabel}`],
    );
  } else {
    rows.push(
      ['Chỉ số', `${formatNumberOrDash(inv.indexStart)} → ${formatNumberOrDash(inv.indexEnd)}`],
      ['Nước tiêu thụ', `${formatNumber(inv.consumption)} ${inv.unitLabel}`],
    );
  }
  rows.push(['Số tiền', formatMoney(inv.amount)]);
  if (inv.type === 'elec') rows.push(['Hạn chuyển khoản', formatDate(inv.dueDate) || '—']);
  return rows;
}

export function render(container) {
  const { period } = getState();
  let rows = []; // [{ inv, unitName }] sau khi phân tích
  let errors = []; // lỗi phân tích (unrecognized / missing_field)

  // Chưa cấu hình: vẫn cho phân tích thử nhưng không lưu được
  const notConnected = isConfigured() ? null : h('div', { class: 'alert alert-warn' }, icon('warn'),
    h('span', null, 'Chưa kết nối Google Sheets nên chưa thể lưu hoá đơn. ', h('a', { href: '#cau-hinh' }, 'Cấu hình ngay'), '.'));
  // Đã cấu hình nhưng chưa tải được dữ liệu: khoá Lưu để không khớp căn/ghi đè khi danh sách căn còn rỗng
  const notLoaded = h('div', { class: 'alert alert-warn', role: 'status' }, icon('warn'),
    h('span', null, 'Chưa tải được dữ liệu từ Google Sheets nên tạm khoá nút Lưu. ', h('a', { href: '#cau-hinh' }, 'Kiểm tra kết nối'), '.'));

  // ---- Thẻ trái: textarea ----
  const periodLabel = h('strong', null, formatPeriod(period));
  const textarea = h('textarea', {
    id: 'msg-input', class: 'textarea textarea-mono', rows: 10,
    placeholder: 'Dán tin nhắn điện hoặc nước vào đây (có thể dán nhiều tin liên tiếp)…',
  });
  const analyzeBtn = h('button', { type: 'button', class: 'btn' }, h('span', { class: 'btn-label' }, 'Phân tích tin nhắn'));
  const clearBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Xoá nội dung');

  const inputCard = h('div', { class: 'card' },
    h('h2', null, 'Dán tin nhắn'),
    h('p', { class: 'text-sub' }, 'Kỳ đang chọn: ', periodLabel, ' (dùng cho tin nước đứng một mình; tin nước đi kèm tin điện cùng căn lấy kỳ của tin điện)'),
    h('div', { class: 'field mt' },
      h('label', { for: 'msg-input' }, 'Nội dung tin nhắn'),
      textarea,
    ),
    h('div', { class: 'actions mt' }, analyzeBtn, clearBtn),
  );

  // ---- Thẻ phải: kết quả ----
  const resultsBox = h('div', { class: 'stack' });
  const emptyState = () => h('p', { class: 'empty-state' }, 'Chưa có kết quả. Dán tin nhắn rồi bấm “Phân tích tin nhắn”.');
  resultsBox.append(emptyState());

  const summaryLine = h('p', { class: 'text-sub mt', 'aria-live': 'polite' });
  const resultsCard = h('div', { class: 'card' },
    h('h2', null, 'Kết quả nhận diện'),
    h('p', { class: 'text-sub' }, 'Chỉ dán 1 loại tin vẫn lưu được; loại còn lại bổ sung ở lần dán sau.'),
    // Chỉ dòng tóm tắt là aria-live; cả khối kết quả dài không được đọc lại mỗi lần đổi
    summaryLine,
    h('div', { class: 'mt' }, resultsBox),
  );

  // ---- Thẻ tổng + lưu ----
  const totalsList = h('ul', { class: 'totals-list' });
  const grandTotal = h('strong', { class: 'num-xl' }, formatMoney(0));
  const saveBtn = h('button', { type: 'button', class: 'btn', disabled: true }, 'Lưu vào Google Sheets');
  const multiPeriodWarn = h('div', { class: 'alert alert-warn', role: 'status', hidden: true }, icon('warn'),
    h('span', null));
  const totalsCard = h('div', { class: 'card' },
    h('h2', null, 'Tổng cộng theo căn'),
    multiPeriodWarn,
    totalsList,
    h('div', { class: 'total-row' }, h('span', { class: 'text-sub' }, 'Tổng'), grandTotal),
    h('div', { class: 'actions mt' }, saveBtn),
  );

  /**
   * Kỳ ghi nhận của một dòng (mục 6.4): điện lấy kỳ trong tin; nước ưu tiên kỳ của tin điện cùng căn
   * (dán chung một lượt), nếu không có thì dùng kỳ đang chọn.
   * source: 'tin' | 'elec' (theo tin điện cùng căn) | 'selected'.
   */
  function periodOfRow(row) {
    const { inv, unitName } = row;
    if (inv.type === 'elec' && inv.period) return { period: inv.period, source: 'tin' };
    if (inv.type === 'water' && unitName) {
      const e = rows.find((r) => r.inv.type === 'elec' && r.inv.period && r.unitName === unitName);
      if (e) return { period: e.inv.period, source: 'elec' };
    }
    return { period: getState().period, source: 'selected' };
  }

  function updateTotals() {
    rows.forEach((r) => r.paintPeriod?.()); // gán/đổi căn có thể làm đổi kỳ của tin nước
    // Gộp theo (kỳ, căn) để không cộng lẫn hoá đơn của các kỳ khác nhau
    const groups = new Map();
    for (const r of rows) {
      if (!r.unitName) continue;
      const { period: p } = periodOfRow(r);
      const k = `${p}|${r.unitName}`;
      const g = groups.get(k) || { period: p, name: r.unitName, amount: 0 };
      g.amount += r.inv.amount || 0;
      groups.set(k, g);
    }
    const periods = new Set(rows.filter((r) => r.unitName).map((r) => periodOfRow(r).period));
    const multi = periods.size > 1;
    totalsList.replaceChildren();
    let sum = 0;
    for (const g of groups.values()) {
      sum += g.amount;
      totalsList.append(h('li', null,
        h('span', null, multi ? `${g.name} · ${formatPeriod(g.period)}` : g.name),
        h('span', { class: 'num' }, formatMoney(g.amount))));
    }
    if (!groups.size) totalsList.append(h('li', { class: 'text-sub' }, 'Chưa có căn nào được ghi nhận.'));
    grandTotal.textContent = formatMoney(sum);
    multiPeriodWarn.hidden = !multi;
    multiPeriodWarn.lastChild.textContent = multi
      ? `Các hoá đơn sắp lưu thuộc ${periods.size} kỳ khác nhau (${[...periods].sort().map(formatPeriod).join(', ')}). Tổng được tách theo kỳ và căn; “Tổng” bên dưới là tổng mọi kỳ, hãy kiểm tra kỹ trước khi lưu.`
      : '';
    // Chỉ cho lưu khi đã kết nối + đã tải dữ liệu, có kết quả và mọi hoá đơn đã gán căn
    notLoaded.hidden = !isConfigured() || getState().loaded;
    saveBtn.disabled = !isConfigured() || !getState().loaded || !rows.length || rows.some((r) => !r.unitName);
  }

  /** Một thẻ kết quả; dropdown chọn căn cập nhật tại chỗ (không dựng lại để giữ focus). */
  function buildItem(row) {
    const { inv } = row;
    const meta = TYPE_META[inv.type];
    const slot = h('div', { class: 'match-slot' });

    function paintMatch() {
      slot.replaceChildren();
      if (row.unitName) {
        slot.append(h('span', { class: 'chip chip-ok' }, `Khớp căn ${row.unitName}`));
        return;
      }
      const select = h('select', { class: 'select select-sm', 'aria-label': `Chọn căn cho mã ${inv.customerCode}` },
        h('option', { value: '' }, 'Chọn căn…'),
        ...getState().units.map((u) => h('option', { value: u.name }, u.name)),
      );
      select.addEventListener('change', () => {
        row.unitName = select.value;
        if (row.unitName) paintMatch();
        updateTotals();
      });
      slot.append(
        h('div', { class: 'alert alert-danger' }, icon('warn'), h('span', null, 'Chưa khớp căn')),
        select,
      );
    }
    paintMatch();

    const dl = h('dl', { class: 'kv' });
    for (const [label, value] of fieldRows(inv)) {
      dl.append(h('div', null, h('dt', null, label), h('dd', null, value)));
    }
    if (inv.type === 'water') {
      // Kỳ của tin nước phụ thuộc tin điện cùng căn nên vẽ lại được (updateTotals gọi row.paintPeriod)
      const periodDd = h('dd', null);
      dl.append(h('div', null, h('dt', null, 'Kỳ ghi nhận'), periodDd));
      row.paintPeriod = () => {
        const { period, source } = periodOfRow(row);
        periodDd.textContent = `${formatPeriod(period)} (${source === 'elec' ? 'theo tin điện cùng căn' : 'kỳ đang chọn'})`;
      };
      row.paintPeriod();
    }

    const item = h('div', { class: 'result-item' },
      h('div', { class: 'result-head' }, h('span', { class: `chip ${meta.chip}` }, meta.label), slot),
      dl,
    );
    // Kỳ trong tin điện khác kỳ đang chọn: ưu tiên kỳ trong tin (mục 6.4)
    if (inv.type === 'elec' && inv.period && inv.period !== getState().period) {
      item.append(h('p', { class: 'note-warn' },
        `Kỳ trong tin (${formatPeriod(inv.period)}) khác kỳ đang chọn; sẽ dùng kỳ trong tin.`));
    }
    // Số liệu bất thường: cảnh báo, không chặn (mục 10)
    if (inv.amount === 0 || inv.consumption === 0) {
      item.append(h('p', { class: 'note-warn' }, 'Số liệu bất thường (tiêu thụ hoặc số tiền bằng 0), hãy kiểm tra lại.'));
    }
    return item;
  }

  const ERROR_TEXT = {
    unrecognized: 'đoạn tin không khớp mẫu điện hoặc nước.',
    missing_field: 'thiếu trường bắt buộc',
  };
  const FIELD_TEXT = {
    customerCode: 'mã khách hàng', consumption: 'mức tiêu thụ', amount: 'số tiền', period: 'kỳ (ngày kết thúc)',
  };

  /** Dựng lại toàn bộ thẻ kết quả + lỗi từ rows/errors hiện có. */
  function renderItems() {
    resultsBox.replaceChildren();
    if (!rows.length && !errors.length) {
      resultsBox.append(emptyState());
    }
    for (const row of rows) resultsBox.append(buildItem(row));
    summaryLine.textContent = rows.length || errors.length
      ? `Nhận diện được ${rows.length} hoá đơn${errors.length ? `, ${errors.length} đoạn lỗi` : ''}.`
      : '';
    for (const err of errors) {
      const reason = err.reason === 'missing_field'
        ? `thiếu ${FIELD_TEXT[err.field] || err.field}`
        : ERROR_TEXT[err.reason] || 'không đọc được';
      resultsBox.append(h('div', { class: 'result-item result-error' },
        h('strong', null, 'Không nhận diện được'),
        h('p', { class: 'text-sub' }, `Lý do: ${reason}`),
        h('pre', { class: 'snippet' }, err.snippet),
      ));
    }
    updateTotals();
  }

  function showResults(result) {
    rows = result.invoices.map((inv) => {
      const hit = matchUnit(inv.customerCode, inv.type, getState().units);
      return { inv, unitName: hit ? String(hit.name).toUpperCase() : '' };
    });
    errors = result.errors;
    renderItems();
    staggerIn(resultsBox, '.result-item');
  }

  analyzeBtn.addEventListener('click', () => {
    if (!textarea.value.trim()) {
      toast('Hãy dán tin nhắn trước khi phân tích.', 'error');
      textarea.focus();
      return;
    }
    // Parser thuần và đồng bộ; không cần chờ giả lập
    showResults(parseMessages(textarea.value));
  });

  clearBtn.addEventListener('click', () => {
    textarea.value = '';
    rows = [];
    errors = [];
    renderItems();
    textarea.focus();
  });

  saveBtn.addEventListener('click', async () => {
    if (!getState().loaded || !rows.length || rows.some((r) => !r.unitName)) return;
    // Gộp theo key: nếu cùng key xuất hiện hai lần thì bản sau thắng (khớp hành vi server)
    const payload = new Map();
    for (const row of rows) {
      const { inv, unitName } = row;
      const { period } = periodOfRow(row);
      payload.set(invoiceKey(period, unitName, inv.type), invoiceToRow(inv, period, unitName));
    }
    // Xác nhận ghi đè nếu key đã có trong state
    const existing = new Set(getState().invoices.map((i) => invoiceKey(i.period, i.unit, i.type)));
    const dupes = [...payload.keys()].filter((k) => existing.has(k));
    if (dupes.length) {
      const list = dupes.map((k) => k.replace(/\|/g, ' · ')).join('\n');
      if (!window.confirm(`Đã có hoá đơn này, ghi đè?\n\n${list}`)) return;
    }
    setBusy(saveBtn, true);
    try {
      await saveInvoices([...payload.values()]);
    } catch (err) {
      // Giữ nguyên nội dung đã dán và kết quả để người dùng thử lại (mục 10)
      toast(errorMessage(err), 'error');
      setBusy(saveBtn, false);
      updateTotals();
      return;
    }
    toast(`Đã lưu ${payload.size} hoá đơn vào Google Sheets.`, 'ok');
    textarea.value = '';
    rows = [];
    errors = [];
    setBusy(saveBtn, false);
    renderItems();
    await reloadAll();
  });

  renderItems();

  container.append(h('div', { class: 'grid grid-2 grid-top' },
    inputCard,
    h('div', { class: 'stack' }, notConnected, notLoaded, resultsCard, totalsCard),
  ));

  // Đổi kỳ / danh sách căn: chỉ cập nhật phần hiển thị, KHÔNG dựng lại trang để không mất nội dung đã dán
  return subscribe((s, changed) => {
    if (changed.includes('loaded')) updateTotals(); // mở/khoá nút Lưu + cảnh báo theo trạng thái tải
    if (changed.includes('period')) {
      periodLabel.textContent = formatPeriod(s.period);
      if (rows.length) renderItems(); // nhãn kỳ của tin nước phụ thuộc kỳ đang chọn
    }
    if (changed.includes('units') && rows.length) {
      // Danh sách căn mới tải xong: khớp lại các hoá đơn chưa gán căn
      for (const r of rows) {
        if (r.unitName) continue;
        const hit = matchUnit(r.inv.customerCode, r.inv.type, s.units);
        if (hit) r.unitName = String(hit.name).toUpperCase();
      }
      renderItems();
    }
  });
}
