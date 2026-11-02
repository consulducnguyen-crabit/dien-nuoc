// Dựng DOM ảnh thông báo (rộng cố định 420px) + xuất/sao chép PNG bằng html-to-image (nạp lười từ CDN).
import { h } from './dom.js';
import { narrowSummary } from './summary.js';
import { formatMoney, formatNumber, formatNumberOrDash, formatDate, formatPeriod, transferContent } from './format.js';

// Ghim đúng phiên bản (mục 3 của plan)
const HTML_TO_IMAGE_URL = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
let loader = null;

/** Nạp html-to-image một lần bằng thẻ script; lỗi thì ném Error để trang báo toast. */
export function loadHtmlToImage() {
  if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
  if (!loader) {
    const s = document.createElement('script');
    loader = new Promise((resolve, reject) => {
      s.src = HTML_TO_IMAGE_URL;
      s.async = true;
      s.onload = () => (window.htmlToImage ? resolve(window.htmlToImage) : reject(new Error('missing global')));
      s.onerror = () => reject(new Error('load failed'));
      document.head.append(s);
    }).catch((err) => { loader = null; s.remove(); throw err; }); // cho phép thử lại lần sau
  }
  return loader;
}

/** Chụp node thông báo thành data URL PNG (đợi font, pixelRatio 2, nền trắng). */
export async function renderNoticePng(node) {
  const lib = await loadHtmlToImage();
  await document.fonts.ready;
  return lib.toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: false });
}

/** Tên file: thong-bao_{CĂN}_{YYYY-MM}[_dien|_nuoc].png (chỉ giữ ký tự an toàn; only để trống = ảnh gộp). */
export function noticeFileName(unit, period, only) {
  const safe = String(unit).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const suffix = only === 'elec' ? '_dien' : only === 'water' ? '_nuoc' : '';
  return `thong-bao_${safe}_${period}${suffix}.png`;
}

export function downloadDataUrl(dataUrl, fileName) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
}

/** Điện thoại/máy tính bảng: clipboard ảnh không dán được vào Zalo/Messenger nên chuyển sang tải file về. */
export function isMobileDevice() {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPadOS giả danh Mac
}

/**
 * Sao chép PNG vào clipboard. Nhận Promise<dataUrl> (hoặc dataUrl) và PHẢI được gọi đồng bộ trong handler click:
 * Safari chỉ cho clipboard.write khi gọi trong cử chỉ người dùng, nên ClipboardItem nhận Promise<Blob>
 * thay vì chờ chụp ảnh xong rồi mới ghi. Trả về true nếu thành công, false nếu không hỗ trợ/bị từ chối/ảnh lỗi
 * (để nơi gọi chuyển sang tải file).
 */
export async function copyPngToClipboard(dataUrlOrPromise) {
  if (isMobileDevice()) return false;
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  try {
    const blobPromise = Promise.resolve(dataUrlOrPromise).then(async (dataUrl) => {
      if (!dataUrl) throw new Error('no image');
      return (await fetch(dataUrl)).blob(); // data URL của chính mình, không ra mạng
    });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
    return true;
  } catch {
    return false;
  }
}

function kvRow(label, value) {
  return h('div', { class: 'notice-row' }, h('span', null, label), h('strong', { class: 'num' }, value));
}

/** Huy hiệu hạn đóng: tờ lịch (tháng/ngày/năm) + ngày đầy đủ; chưa chọn ngày thì hiện mờ, không nổi bật. */
function dueBadge(dueDate) {
  const m = String(dueDate ?? '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const text = formatDate(dueDate);
  return h('div', { class: m ? 'notice-due' : 'notice-due is-empty' },
    h('div', { class: 'notice-cal' },
      h('i', null, m ? `THÁNG ${Number(m[2])}` : 'THÁNG —'),
      h('b', null, m ? String(Number(m[3])) : '?'),
      h('em', null, m ? m[1] : '—'),
    ),
    h('div', { class: 'notice-due-txt' },
      h('small', null, 'HẠN ĐÓNG TIỀN'),
      h('b', null, text || 'chưa chọn'),
    ),
  );
}

/**
 * @param {object} o
 * @param {object} o.summary  kết quả summarizeUnit()
 * @param {string} o.period   'YYYY-MM' của kỳ đang chọn (cũng là kỳ hiển thị trên ảnh)
 * @param {string} o.dueDate  'YYYY-MM-DD' hoặc ''
 * @param {object} o.config   bank_name, bank_holder, bank_account, transfer_template
 * @param {string} [o.qrDataUrl] data URL ảnh QR (chỉ nhận data:image/)
 * @param {'elec'|'water'} [o.only] chỉ dựng khối của loại này và tính tổng riêng loại đó; bỏ trống = gộp như cũ
 */
export function buildNoticeNode({ summary: fullSummary, period, dueDate, config = {}, qrDataUrl = '', only }) {
  const summary = narrowSummary(fullSummary, only);
  const { elec, water } = summary;
  // Ô Kỳ = kỳ của hoá đơn: tiêu đề và nội dung CK dùng đúng kỳ này
  const shownPeriod = period;
  const node = h('div', { class: 'notice' },
    h('div', { class: 'notice-head' },
      h('p', { class: 'notice-title' }, 'THÔNG BÁO ĐÓNG TIỀN'),
      h('p', null, `Căn ${summary.unit} · ${formatPeriod(shownPeriod)}`),
    ),
  );

  if (elec) {
    node.append(h('div', { class: 'notice-block' },
      h('div', { class: 'notice-block-head' }, h('span', { class: 'chip chip-elec' }, 'Điện'), h('strong', null, 'Tiền điện')),
      kvRow('Kỳ', `${formatDate(elec.periodFrom) || '—'} – ${formatDate(elec.periodTo) || '—'}`),
      kvRow('Chỉ số cuối kỳ', formatNumberOrDash(elec.indexEnd)),
      kvRow('Tiêu thụ', `${formatNumber(elec.consumption)} ${elec.unitLabel}`),
      kvRow('Thành tiền', formatMoney(elec.amount)),
    ));
  }
  if (water) {
    node.append(h('div', { class: 'notice-block' },
      h('div', { class: 'notice-block-head' }, h('span', { class: 'chip chip-water' }, 'Nước'), h('strong', null, 'Tiền nước')),
      kvRow('Chỉ số', `${formatNumberOrDash(water.indexStart)} → ${formatNumberOrDash(water.indexEnd)}`),
      kvRow('Tiêu thụ', `${formatNumber(water.consumption)} ${water.unitLabel}`),
      kvRow('Thành tiền', formatMoney(water.amount)),
    ));
  }

  node.append(h('div', { class: 'notice-total' },
    h('span', null, 'Tổng cần đóng'),
    h('strong', { class: 'num-xl' }, formatMoney(summary.total)),
    dueBadge(dueDate),
  ));

  // Khối ngân hàng: chỉ hiện phần đã có, không để placeholder trống
  const bankRows = [
    ['Ngân hàng', config.bank_name],
    ['Chủ tài khoản', config.bank_holder],
    ['Số tài khoản', config.bank_account],
  ].filter(([, v]) => v);
  const content = transferContent(config.transfer_template, summary.unit, shownPeriod);
  const lines = h('div', { class: 'notice-bank-lines' },
    ...bankRows.map(([l, v]) => kvRow(l, v)),
    kvRow('Nội dung', content),
  );
  if (!bankRows.length) lines.append(h('p', { class: 'text-sub' }, 'Chưa cấu hình tài khoản nhận tiền.'));

  const bank = h('div', { class: 'notice-bank' },
    h('div', { class: 'notice-bank-info' }, h('strong', null, 'Chuyển khoản tới'), lines),
  );
  if (qrDataUrl.startsWith('data:image/')) {
    bank.append(h('img', { class: 'notice-qr', src: qrDataUrl, alt: 'Mã QR chuyển khoản', width: 120, height: 120 }));
  }
  node.append(bank);
  return node;
}
