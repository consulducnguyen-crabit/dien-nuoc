// Trang Thông báo (#thong-bao), mục 8.3. Xem trước theo 3 biến thể, tải/sao chép PNG.
import { h, icon } from '../dom.js';
import { getState, setState } from '../state.js';
import { formatPeriod, previousPeriod } from '../format.js';
import { toast, setBusy, renderDataGate } from '../ui.js';
import { summarizeUnit } from '../summary.js';
import {
  buildNoticeNode, loadHtmlToImage, renderNoticePng, noticeFileName, downloadDataUrl, copyPngToClipboard,
} from '../notice.js';
import { qrFromConfig } from '../qr.js';

export function render(container) {
  if (renderDataGate(container, getState())) return;
  const { units, invoices, period, config } = getState();
  const wanted = getState().selectedUnit;
  let unitName = units.some((u) => u.name === wanted) ? wanted : units[0]?.name || '';
  let summary = null;
  // Thông báo hiển thị tháng trước kỳ chọn; hạn mặc định luôn là ngày 10 của kỳ ĐANG CHỌN (bỏ qua hạn trong tin điện)
  const shownPeriod = previousPeriod(period) || period;
  const defaultDue = /^\d{4}-\d{2}$/.test(period) ? `${period}-10` : '';
  let dueEdited = false; // đã tự sửa tay thì không ghi đè khi đổi căn
  const periodShort = (p) => formatPeriod(p).replace('Tháng ', '');

  const unitSelect = h('select', { id: 'notice-unit', class: 'select' },
    ...units.map((u) => h('option', { value: u.name, selected: u.name === unitName }, u.name)));
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

  /** Dựng lại xem trước + khoá/mở nút theo dữ liệu (không dựng lại ô điều khiển để giữ focus). */
  function refresh() {
    summary = summarizeUnit({ name: unitName }, invoices, period);
    stage.replaceChildren();
    const none = summary.status === 'none';
    const needDue = !none && !dueInput.value; // chỉ xảy ra khi người dùng xoá trống ô hạn
    if (none) {
      stage.append(h('p', { class: 'empty-state' }, 'Chưa có hoá đơn kỳ này.'));
      hint.textContent = '';
    } else {
      stage.append(buildNoticeNode({ summary, period, dueDate: dueInput.value, config, qrDataUrl }));
      hint.textContent = needDue
        ? 'Hạn đóng đang trống, hãy chọn ngày trước khi xuất ảnh.'
        : 'Mặc định là ngày 10 của kỳ đang chọn, có thể đổi nếu cần.';
    }
    dueInput.disabled = none;
    // Vô hiệu hoá nút xuất khi chưa có hoá đơn hoặc ô hạn đóng bị xoá trống
    dlBtn.disabled = none || needDue;
    copyBtn.disabled = none || needDue;
  }

  function onUnitChange() {
    unitName = unitSelect.value;
    setState({ selectedUnit: unitName });
    // Đặt lại hạn mặc định (ngày 10 của kỳ chọn) trừ khi người dùng đã tự sửa tay
    if (!dueEdited) dueInput.value = defaultDue;
    refresh();
  }
  unitSelect.addEventListener('change', onUnitChange);
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
  // Tên file theo tháng hiển thị trên ảnh (tháng trước kỳ chọn) cho khớp nội dung
  const fileName = () => noticeFileName(unitName, shownPeriod);

  dlBtn.addEventListener('click', async () => {
    setBusy(dlBtn, true);
    try {
      const url = await capture();
      if (url) { downloadDataUrl(url, fileName()); toast('Đã tải ảnh thông báo.', 'ok'); }
    } finally { setBusy(dlBtn, false); refresh(); }
  });
  copyBtn.addEventListener('click', async () => {
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
          h('p', { class: 'text-sub' }, `Kỳ chọn ${periodShort(period)} → thông báo tiền ${periodShort(shownPeriod)} (đổi ở bộ chọn Kỳ phía trên)`),
          h('div', { class: 'field mt' }, h('label', { for: 'notice-unit' }, 'Căn'), unitSelect),
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
