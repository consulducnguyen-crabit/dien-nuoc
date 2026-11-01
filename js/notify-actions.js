// Thao tác "tạo ảnh thông báo + đánh dấu đã thông báo" dùng chung cho trang Nhập và Thống kê.
// Cờ nằm ở notifiedAt của từng hoá đơn (lưu trong Sheet) nên mọi nơi đọc cùng một nguồn.
import { h, svg } from './dom.js';
import { getState, setState } from './state.js';
import { defaultDueDate } from './format.js';
import { toast, setBusy } from './ui.js';
import { summarizeUnit } from './summary.js';
import {
  buildNoticeNode, renderNoticePng, noticeFileName, downloadDataUrl, copyPngToClipboard,
} from './notice.js';
import { qrFromConfig } from './qr.js';
import { markNotified, ApiError } from './api.js';
import { withNotified, errorMessage } from './data.js';

export const KIND_NAME = { elec: 'điện', water: 'nước' };

/** Icon "sao chép" (hai tờ giấy) cho nút trong ô. */
export function copyIcon() {
  return svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' },
    svg('rect', { x: 9, y: 9, width: 11, height: 11, rx: 2, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
    svg('path', { d: 'M5 15V6a2 2 0 0 1 2-2h9', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

// Khoá hoá đơn đang tạo ảnh: nút bị khoá kể cả khi giao diện vẽ lại giữa chừng
const busy = new Set();
export const isBusy = (inv) => !!inv?.key && busy.has(inv.key);

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

/** Lưu "đã thông báo" lên Sheet rồi cập nhật state. Lỗi không làm mất ảnh đã tạo (chỉ báo, trạng thái giữ nguyên). */
export async function persistNotified(keys) {
  const list = (keys || []).filter(Boolean);
  if (!list.length) return;
  try {
    await markNotified(list, true);
    setState({
      invoices: withNotified(getState().invoices, list, new Date().toISOString()),
      notifiedRev: getState().notifiedRev + 1,
    });
  } catch (err) {
    toast(err instanceof ApiError && err.code === 'bad_request'
      ? 'Cần cập nhật Apps Script (dán lại Code.gs và Deploy phiên bản mới) để lưu trạng thái "Đã thông báo". Ảnh vẫn dùng bình thường.'
      : `Chưa lưu được trạng thái "Đã thông báo": ${errorMessage(err)}`, 'error');
  }
}

/** Bấm nút: tạo ảnh riêng loại `kind`, sao chép (hoặc tải file nếu không được) rồi đánh dấu đã thông báo. */
export async function copyKindNotice(btn, unit, kind, inv, onDone = () => {}) {
  if (!inv?.key || busy.has(inv.key)) return;
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
    await persistNotified([inv.key]);
  } finally {
    busy.delete(inv.key);
    setBusy(btn, false);
    onDone();
  }
}
