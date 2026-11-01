// Trang Thông báo (#thong-bao), mục 8.3. Xem trước theo 3 biến thể, tải/sao chép PNG.
import { h, icon } from '../dom.js';
import { getState, setState } from '../state.js';
import { defaultDueDate } from '../format.js';
import { toast, setBusy, renderDataGate } from '../ui.js';
import { summarizeUnit } from '../summary.js';
import {
  buildNoticeNode, loadHtmlToImage, renderNoticePng, noticeFileName, downloadDataUrl, copyPngToClipboard,
} from '../notice.js';
import { qrFromConfig } from '../qr.js';
import { persistNotified } from '../notify-actions.js';

export function render(container) {
  if (renderDataGate(container, getState())) return;
  const { units, period, config } = getState();
  const wanted = getState().selectedUnit;
  let unitName = units.some((u) => u.name === wanted) ? wanted : units[0]?.name || '';
  let summary = null;
  // Ảnh hiển thị đúng kỳ đang chọn; hạn mặc định = ngày 10 của THÁNG KẾ TIẾP sau kỳ (bỏ qua hạn trong tin điện)
  const shownPeriod = period;
  const defaultDue = defaultDueDate(period);
  let dueEdited = false; // đã tự sửa tay thì không ghi đè khi đổi căn

  const unitSelect = h('select', { id: 'notice-unit', class: 'select' },
    ...units.map((u) => h('option', { value: u.name, selected: u.name === unitName }, u.name)));
  // Loại thông báo: gộp hoặc riêng điện / riêng nước (thường mỗi loại đến vào thời điểm khác nhau)
  let only = ''; // '' = gộp
  const kindSelect = h('select', { id: 'notice-kind', class: 'select' });
  const dueInput = h('input', { id: 'notice-due', class: 'input', type: 'date' });
  const hint = h('p', { class: 'text-sub', 'aria-live': 'polite' });
  const dlBtn = h('button', { type: 'button', class: 'btn' }, icon('download'), 'Tải ảnh PNG');
  const copyBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, icon('copy'), 'Sao chép ảnh');
  const stage = h('div', { class: 'notice-stage' });

  const qrDataUrl = qrFromConfig(config); // đã kiểm tra data:image/, '' nếu chưa có/thiếu mảnh
  const bankMissing = !config.bank_name || !config.bank_account || !qrDataUrl;
  const warn = bankMissing
    ? h('div', { class: 'alert alert-warn' }, icon('warn'),
      h('span', null, 'Chưa đủ thông tin ngân hàng hoặc ảnh QR, ảnh thông báo chỉ hiện phần đã có. ', h('a', { href: '#cau-hinh' }, 'Cấu hình ngay'), '.'))
    : null;

  /** Chỉ liệt kê loại đang có hoá đơn (thẻ động theo số liệu); kèm dấu nếu loại đó đã thông báo. */
  function fillKinds() {
    const opts = [];
    if (summary.elec && summary.water) opts.push(['', 'Điện + nước']);
    if (summary.elec) opts.push(['elec', `Chỉ điện${summary.elec.notifiedAt ? ' (đã thông báo)' : ''}`]);
    if (summary.water) opts.push(['water', `Chỉ nước${summary.water.notifiedAt ? ' (đã thông báo)' : ''}`]);
    if (!opts.some(([v]) => v === only)) {
      // Mặc định: loại chưa thông báo đầu tiên, nếu không có thì loại đầu tiên
      const pending = opts.find(([v]) => v && !summary[v].notifiedAt);
      only = (pending || opts[0] || ['', ''])[0];
    }
    kindSelect.replaceChildren(...opts.map(([v, t]) => h('option', { value: v, selected: v === only }, t)));
  }

  /** Hoá đơn nằm trong ảnh đang xem (để gắn cờ đã thông báo). */
  const shownKeys = () => [only !== 'water' ? summary.elec?.key : null, only !== 'elec' ? summary.water?.key : null].filter(Boolean);

  /** Dựng lại xem trước + khoá/mở nút theo dữ liệu (không dựng lại ô điều khiển để giữ focus). */
  function refresh() {
    summary = summarizeUnit({ name: unitName }, getState().invoices, period);
    stage.replaceChildren();
    const none = summary.status === 'none';
    fillKinds();
    const needDue = !none && !dueInput.value; // chỉ xảy ra khi người dùng xoá trống ô hạn
    if (none) {
      stage.append(h('p', { class: 'empty-state' }, 'Chưa có hoá đơn kỳ này.'));
      hint.textContent = '';
    } else {
      stage.append(buildNoticeNode({ summary, period, dueDate: dueInput.value, config, qrDataUrl, only: only || undefined }));
      hint.textContent = needDue ? 'Hạn đóng đang trống, hãy chọn ngày trước khi xuất ảnh.' : '';
    }
    dueInput.disabled = none;
    kindSelect.disabled = none;
    // Vô hiệu hoá nút xuất khi chưa có hoá đơn hoặc ô hạn đóng bị xoá trống
    dlBtn.disabled = none || needDue;
    copyBtn.disabled = none || needDue;
  }

  function onUnitChange() {
    unitName = unitSelect.value;
    setState({ selectedUnit: unitName });
    // Đặt lại hạn mặc định (ngày 10 tháng kế tiếp) trừ khi người dùng đã tự sửa tay
    if (!dueEdited) dueInput.value = defaultDue;
    refresh();
  }
  unitSelect.addEventListener('change', onUnitChange);
  kindSelect.addEventListener('change', () => { only = kindSelect.value; refresh(); });
  dueInput.addEventListener('input', () => { dueEdited = true; refresh(); });
  /** Chụp ảnh thông báo đang xem trước; trả về data URL hoặc null (đã toast lỗi). */
  async function capture() {
    const node = stage.querySelector('.notice');
    if (!node) return null;
    try {
      return await renderNoticePng(node);
    } catch {
      toast('Không tạo được ảnh. Kiểm tra kết nối Internet (cần tải thư viện xuất ảnh) rồi thử lại.', 'error');
      return null;
    }
  }
  // Tên file theo kỳ hiển thị trên ảnh cho khớp nội dung
  const fileName = () => noticeFileName(unitName, shownPeriod, only || undefined);

  dlBtn.addEventListener('click', async () => {
    const keys = shownKeys(); // chốt ngay lúc bấm: đổi căn/loại trong lúc chụp không làm gắn cờ nhầm
    setBusy(dlBtn, true);
    try {
      const url = await capture();
      if (url) {
        downloadDataUrl(url, fileName());
        toast('Đã tải ảnh thông báo.', 'ok');
        await persistNotified(keys);
      }
    } finally { setBusy(dlBtn, false); refresh(); }
  });
  copyBtn.addEventListener('click', async () => {
    const keys = shownKeys();
    setBusy(copyBtn, true);
    try {
      // Khởi động chụp và gọi clipboard.write ngay (đồng bộ trong click) với Promise; await sau đó
      const urlPromise = capture();
      const copied = await copyPngToClipboard(urlPromise);
      const url = await urlPromise;
      if (!url) return;
      if (copied) {
        toast('Đã sao chép ảnh, có thể dán vào Zalo hoặc Messenger.', 'ok');
      } else {
        // Trình duyệt không hỗ trợ/từ chối quyền clipboard: tự tải file thay thế
        downloadDataUrl(url, fileName());
        toast('Trình duyệt không cho sao chép ảnh nên đã tải file về máy.', 'info');
      }
      await persistNotified(keys);
    } finally { setBusy(copyBtn, false); refresh(); }
  });
  // Nạp sẵn thư viện xuất ảnh khi vào trang (lỗi thì báo lại lúc bấm xuất)
  loadHtmlToImage().catch(() => {});

  dueInput.value = defaultDue;

  container.append(
    h('div', { class: 'grid grid-2 grid-top notice-layout' },
      h('div', { class: 'stack' },
        h('div', { class: 'card' },
          h('h2', null, 'Tuỳ chọn thông báo'),
          h('div', { class: 'field mt' }, h('label', { for: 'notice-unit' }, 'Căn'), unitSelect),
          h('div', { class: 'field mt' }, h('label', { for: 'notice-kind' }, 'Loại thông báo'), kindSelect),
          h('div', { class: 'field mt' }, h('label', { for: 'notice-due' }, 'Hạn đóng'), dueInput, hint),
          h('div', { class: 'actions mt' }, dlBtn, copyBtn),
        ),
        warn,
      ),
      h('div', { class: 'card' },
        h('h2', null, 'Xem trước'),
        h('div', { class: 'mt' }, stage),
      ),
    ),
  );
  refresh();
}
