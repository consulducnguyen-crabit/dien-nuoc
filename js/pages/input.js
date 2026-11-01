// Trang Nhập tin nhắn (#nhap), mục 8.1. Phase 2: kết quả "phân tích" là dữ liệu mẫu cố định.
// Phase 4 chỉ cần thay makeSampleParseResult() bằng parseMessages() + matchUnit().
import { h, icon } from '../dom.js';
import { getState, setState, subscribe } from '../state.js';
import { formatMoney, formatNumber, formatNumberOrDash, formatDate, formatPeriod, invoiceKey } from '../format.js';
import { toast, setBusy, staggerIn } from '../ui.js';
import { parseMessages, parseWaterReceiptText, parseVnNumber } from '../parser.js';
import { matchUnit } from '../matcher.js';
import { saveInvoices, ocrImage, isConfigured } from '../api.js';
import { validateImageFile, prepareImage, ImageError } from '../imageprep.js';
import { reloadAll, invoiceToRow, errorMessage } from '../data.js';
import { mountTracker } from './input-tracker.js';

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

  const pastePanel = h('div', { role: 'tabpanel', id: 'panel-paste', 'aria-labelledby': 'tab-paste', class: 'mt' },
    h('div', { class: 'field' },
      h('label', { for: 'msg-input' }, 'Nội dung tin nhắn'),
      textarea,
    ),
    h('div', { class: 'actions mt' }, analyzeBtn, clearBtn),
  );

  // ---- Tab "Tải ảnh hoá đơn" (nước, OCR qua Google Drive) ----
  const fileInput = h('input', { type: 'file', id: 'receipt-file', class: 'input', accept: 'image/*' });
  const captureChk = h('input', { type: 'checkbox', id: 'receipt-capture' });
  const preview = h('img', { class: 'receipt-preview', alt: 'Xem trước ảnh hoá đơn nước đã chọn', hidden: true });
  const readBtn = h('button', { type: 'button', class: 'btn', disabled: true }, h('span', { class: 'btn-label' }, 'Đọc ảnh'));
  const removeImgBtn = h('button', { type: 'button', class: 'btn btn-secondary', disabled: true }, 'Bỏ ảnh');
  const imgStatus = h('p', { class: 'text-sub mt', role: 'status', 'aria-live': 'polite' });
  const imgBlockNote = h('p', { class: 'note-warn' });
  const imagePanel = h('div', { role: 'tabpanel', id: 'panel-image', 'aria-labelledby': 'tab-image', class: 'mt', hidden: true },
    h('div', { class: 'field' },
      h('label', { for: 'receipt-file' }, 'Ảnh hoá đơn nước (JPEG, PNG, WebP; tối đa 8 MB)'),
      fileInput,
    ),
    h('div', { class: 'check-row mt' }, captureChk, h('label', { for: 'receipt-capture' }, 'Mở camera sau khi chọn (trên điện thoại)')),
    h('div', { class: 'mt' }, preview),
    h('div', { class: 'actions mt' }, readBtn, removeImgBtn),
    imgBlockNote,
    imgStatus,
    h('p', { class: 'text-sub mt' }, 'Ảnh được gửi tới Google Drive của chủ Sheet để nhận diện chữ rồi xoá ngay. Kết quả có thể sai, hãy kiểm tra lại trước khi lưu.'),
  );

  // ---- Tablist ----
  const TABS = [
    { id: 'paste', label: 'Dán tin nhắn', panel: pastePanel },
    { id: 'image', label: 'Tải ảnh hoá đơn', panel: imagePanel },
  ];
  const tabEls = TABS.map((t) => h('button', {
    type: 'button', role: 'tab', id: `tab-${t.id}`, class: 'tab', 'aria-controls': `panel-${t.id}`,
  }, t.label));
  function selectTab(i, focus) {
    TABS.forEach((t, k) => {
      const on = k === i;
      tabEls[k].setAttribute('aria-selected', String(on));
      tabEls[k].tabIndex = on ? 0 : -1; // roving tabindex: chỉ tab đang chọn nằm trong thứ tự Tab
      t.panel.hidden = !on; // chỉ ẩn, không dựng lại nên nội dung đã dán/ảnh đã chọn được giữ nguyên
    });
    if (focus) tabEls[i].focus();
  }
  tabEls.forEach((el, i) => {
    el.addEventListener('click', () => selectTab(i, false));
    el.addEventListener('keydown', (ev) => {
      const n = TABS.length;
      const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[ev.key];
      if (next === undefined) return;
      ev.preventDefault();
      selectTab(next, true);
    });
  });
  selectTab(0, false);

  const inputCard = h('div', { class: 'card' },
    h('h2', null, 'Nhập hoá đơn'),
    h('p', { class: 'text-sub' }, 'Kỳ đang chọn: ', periodLabel, ' (dùng cho hoá đơn nước đứng một mình; tin nước đi kèm tin điện cùng căn lấy kỳ của tin điện; ảnh nước có ghi kỳ thì lấy kỳ trong ảnh)'),
    h('div', { class: 'tablist mt', role: 'tablist', 'aria-label': 'Cách nhập hoá đơn' }, ...tabEls),
    pastePanel,
    imagePanel,
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
   * source: 'tin' | 'image' (theo tiêu đề ảnh, có thể do người dùng sửa) | 'elec' (theo tin điện cùng căn) | 'selected'.
   */
  function periodOfRow(row) {
    const { inv, unitName } = row;
    if (inv.type === 'elec' && inv.period) return { period: inv.period, source: 'tin' };
    if (inv.type === 'water' && inv.fromImage && inv.period) return { period: inv.period, source: 'image' };
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
    saveBtn.disabled = !isConfigured() || !getState().loaded || !rows.length
      || rows.some((r) => !r.unitName || rowIncomplete(r));
    rows.forEach((r) => r.paintNotes?.());
    updateImageControls();
  }

  // Hoá đơn từ ảnh phải đủ mã KH, tiêu thụ, tổng tiền (người dùng có thể đã xoá khi sửa tay)
  function rowIncomplete(r) {
    const { inv } = r;
    return !!inv.fromImage && (!inv.customerCode || inv.consumption == null || inv.amount == null);
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

    if (inv.fromImage) return buildImageItem(row, meta, slot, paintMatch);

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

  let fieldSeq = 0; // id duy nhất cho label/input của các thẻ ảnh

  /**
   * Thẻ kết quả của hoá đơn đọc từ ảnh: OCR dễ sai nên mọi trường cho sửa tay trước khi Lưu.
   * Sửa tại chỗ (không dựng lại thẻ) để giữ focus; giá trị ghi thẳng vào row.inv.
   */
  function buildImageItem(row, meta, slot, paintMatch) {
    const { inv } = row;
    const uid = `rc${++fieldSeq}`;
    const grid = h('div', { class: 'edit-grid' });
    const addField = (key, label, value, { type = 'text', inputmode, onInput, onChange } = {}) => {
      const input = h('input', { class: 'input input-sm', id: `${uid}-${key}`, type, inputmode, value });
      if (onInput) input.addEventListener('input', () => { onInput(input.value); updateTotals(); });
      if (onChange) input.addEventListener('change', () => onChange(input.value));
      grid.append(h('div', { class: 'field' }, h('label', { for: `${uid}-${key}` }, label), input));
    };
    const numToStr = (v) => (v == null ? '' : String(v));
    const toNum = (s) => (s.trim() === '' ? null : parseVnNumber(s));

    addField('code', 'Mã khách hàng', inv.customerCode || '', {
      onInput: (v) => { inv.customerCode = v.trim().toUpperCase(); },
      // Đổi mã: khớp lại căn (chỉ khi người dùng sửa xong để không nhảy căn khi đang gõ)
      onChange: () => {
        const hit = inv.customerCode ? matchUnit(inv.customerCode, inv.type, getState().units) : null;
        row.unitName = hit ? String(hit.name).toUpperCase() : '';
        paintMatch();
        updateTotals();
      },
    });
    addField('start', 'Chỉ số cũ', numToStr(inv.indexStart), { inputmode: 'decimal', onInput: (v) => { inv.indexStart = toNum(v); } });
    addField('end', 'Chỉ số mới', numToStr(inv.indexEnd), { inputmode: 'decimal', onInput: (v) => { inv.indexEnd = toNum(v); } });
    addField('cons', 'Tiêu thụ (m³)', numToStr(inv.consumption), { inputmode: 'decimal', onInput: (v) => { inv.consumption = toNum(v); } });
    addField('amount', 'Tổng tiền (đ)', numToStr(inv.amount), { inputmode: 'numeric', onInput: (v) => { inv.amount = toNum(v); } });
    addField('period', 'Kỳ (tháng)', inv.period || '', {
      type: 'month',
      onInput: (v) => { inv.period = /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null; inv.periodSource = inv.period ? 'image' : null; },
    });

    const periodNote = h('p', { class: 'text-sub' });
    const notes = h('div', null);
    row.paintPeriod = () => {
      const { period: p, source } = periodOfRow(row);
      periodNote.textContent = `Kỳ ghi nhận: ${formatPeriod(p)} (${source === 'image' ? 'theo ảnh' : source === 'elec' ? 'theo tin điện cùng căn' : 'kỳ đang chọn'})`;
    };
    row.paintNotes = () => {
      notes.replaceChildren();
      for (const w of inv.warnings || []) notes.append(h('p', { class: 'note-warn' }, w));
      if (rowIncomplete(row)) notes.append(h('p', { class: 'note-warn' }, 'Cần có mã khách hàng, tiêu thụ và tổng tiền mới lưu được.'));
      if (inv.amount === 0 || inv.consumption === 0) {
        notes.append(h('p', { class: 'note-warn' }, 'Số liệu bất thường (tiêu thụ hoặc số tiền bằng 0), hãy kiểm tra lại.'));
      }
    };
    row.paintPeriod();
    row.paintNotes();

    return h('div', { class: 'result-item' },
      h('div', { class: 'result-head' }, h('span', { class: `chip ${meta.chip}` }, meta.label), slot),
      h('div', { class: 'alert alert-warn' }, icon('warn'), h('span', null, 'Đọc từ ảnh — hãy kiểm tra lại')),
      h('div', { class: 'mt' }, grid),
      periodNote,
      notes,
    );
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

  // ---- Ảnh hoá đơn: chọn -> xem trước -> đọc (OCR) -> dùng chung vùng kết quả ----
  let previewUrl = null; // object URL của ảnh đang xem trước; phải thu hồi khi bỏ/đổi/rời trang
  let reading = false;

  function revokePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.removeAttribute('src');
    preview.hidden = true;
  }

  function updateImageControls() {
    // Đọc ảnh cần gọi Apps Script: chưa cấu hình / chưa tải xong dữ liệu thì khoá và giải thích
    const blocked = !isConfigured() ? 'Cần kết nối Google Sheets (trang Cấu hình) mới đọc được ảnh.'
      : !getState().loaded ? 'Đang chờ tải dữ liệu từ Google Sheets, chưa thể đọc ảnh.' : '';
    imgBlockNote.textContent = blocked;
    imgBlockNote.hidden = !blocked;
    readBtn.disabled = reading || !!blocked || !previewUrl;
    removeImgBtn.disabled = reading || !previewUrl;
  }

  function clearImage() {
    revokePreview();
    fileInput.value = '';
    imgStatus.textContent = '';
    updateImageControls();
  }

  captureChk.addEventListener('change', () => {
    if (captureChk.checked) fileInput.setAttribute('capture', 'environment');
    else fileInput.removeAttribute('capture');
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    revokePreview();
    imgStatus.textContent = '';
    if (file) {
      try {
        validateImageFile(file);
        previewUrl = URL.createObjectURL(file);
        preview.src = previewUrl;
        preview.hidden = false;
      } catch (err) {
        fileInput.value = '';
        toast(err instanceof ImageError ? err.message : 'Không dùng được ảnh này.', 'error');
      }
    }
    updateImageControls();
  });

  removeImgBtn.addEventListener('click', clearImage);

  readBtn.addEventListener('click', async () => {
    if (reading || !previewUrl) return;
    reading = true;
    updateImageControls();
    setBusy(readBtn, true);
    imgStatus.textContent = 'Đang đọc ảnh…';
    try {
      const { base64, mime } = await prepareImage(previewUrl);
      const { text } = await ocrImage(base64, mime);
      const result = parseWaterReceiptText(text);
      showResults(result);
      imgStatus.textContent = result.invoices.length
        ? 'Đã đọc xong. Hãy kiểm tra và sửa các trường ở phần Kết quả nhận diện.'
        : 'Đọc xong nhưng chưa nhận diện được hoá đơn nước (xem phần Kết quả nhận diện).';
    } catch (err) {
      // Giữ ảnh đã chọn để thử lại
      // Thông báo dài/cụ thể hiện cả ở vùng aria-live (textContent, không innerHTML) lẫn toast.
      const msg = err instanceof ImageError ? err.message : errorMessage(err);
      imgStatus.textContent = 'Không đọc được ảnh. ' + msg;
      toast(msg, 'error');
    } finally {
      reading = false;
      setBusy(readBtn, false);
      updateImageControls();
    }
  });

  clearBtn.addEventListener('click', () => {
    textarea.value = '';
    rows = [];
    errors = [];
    renderItems();
    textarea.focus();
  });

  saveBtn.addEventListener('click', async () => {
    if (!getState().loaded || !rows.length || rows.some((r) => !r.unitName || rowIncomplete(r))) return;
    // Gộp theo key: nếu cùng key xuất hiện hai lần thì bản sau thắng (khớp hành vi server)
    const payload = new Map();
    let latestPeriod = ''; // kỳ mới nhất trong lượt lưu: sau khi lưu sẽ chuyển ô Kỳ sang kỳ này
    for (const row of rows) {
      const { inv, unitName } = row;
      const { period } = periodOfRow(row);
      if (period > latestPeriod) latestPeriod = period; // 'YYYY-MM' so sánh chuỗi đúng thứ tự thời gian
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
    toast(`Đã lưu ${payload.size} hoá đơn vào Google Sheets. Đang xem kỳ ${formatPeriod(latestPeriod)}.`, 'ok');
    textarea.value = '';
    clearImage();
    rows = [];
    errors = [];
    setBusy(saveBtn, false);
    renderItems();
    // Chuyển kỳ sang kỳ vừa lưu (main.js đồng bộ ô Kỳ ở header; Thống kê/Thông báo dựng lại theo kỳ mới), rồi tải lại dữ liệu
    if (latestPeriod) setState({ period: latestPeriod });
    await reloadAll();
  });

  renderItems();

  // Thẻ theo dõi ở trên cùng, tự cập nhật độc lập (xem input-tracker.js)
  const unmountTracker = mountTracker(container);

  container.append(h('div', { class: 'grid grid-2 grid-top' },
    inputCard,
    h('div', { class: 'stack' }, notConnected, notLoaded, resultsCard, totalsCard),
  ));

  // Đổi kỳ / danh sách căn: chỉ cập nhật phần hiển thị, KHÔNG dựng lại trang để không mất nội dung đã dán
  const unsubscribe = subscribe((s, changed) => {
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
  // Rời trang: huỷ đăng ký state và thu hồi object URL của ảnh xem trước
  return () => {
    unsubscribe?.();
    unmountTracker();
    revokePreview();
  };
}
