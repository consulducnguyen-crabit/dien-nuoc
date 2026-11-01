// Trang Cấu hình (#cau-hinh), mục 8.4. Căn/tài khoản lưu qua Apps Script; URL + token chỉ ở localStorage.
// Ảnh QR: nén canvas, chia mảnh qr_part_N (xem js/qr.js).
import { h, icon, appendChildren } from '../dom.js';
import { getState, setState, subscribe, loadCredentials } from '../state.js';
import { transferContent } from '../format.js';
import { matchUnit } from '../matcher.js';
import { toast, setBusy } from '../ui.js';
import { qrFromConfig, qrToConfig, isImageDataUrl, QR_MAX_LENGTH } from '../qr.js';
import { ping, saveUnits, saveConfig, saveConnection, isConfigured } from '../api.js';
import { reloadAll, invalidateData, unitToRow, errorMessage } from '../data.js';

// Quy tắc trùng với validate phía Apps Script
const RE_UNIT = /^[A-Z0-9_-]{1,20}$/;
const RE_SUFFIX = /^[A-Za-z0-9-]{0,30}$/;

const CONNECTION_LABEL = {
  none: ['Chưa kết nối', ''],
  unchecked: ['Chưa kiểm tra', ''],
  checking: ['Đang kiểm tra…', ''],
  ok: ['Đã kết nối', 'chip-ok'],
  error: ['Lỗi kết nối', 'chip-danger'],
};

const MAX_QR_BYTES = 2 * 1024 * 1024; // mục 7.2: từ chối file gốc > 2 MB
const QR_MAX_SIDE = 320;

/** Thu nhỏ ảnh về tối đa 320x320 bằng canvas, xuất webp (fallback jpeg) q=0.85 dạng data URL. */
async function compressQr(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = src;
    });
    const scale = Math.min(1, QR_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // nền trắng: QR trong suốt vẫn quét được, jpeg không bị nền đen
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let url = canvas.toDataURL('image/webp', 0.85);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85); // trình duyệt không hỗ trợ webp
    if (!isImageDataUrl(url)) throw new Error('bad data url');
    return url;
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function render(container) {
  const state = getState();

  // ---- Hướng dẫn 3 bước (chỉ khi chưa có URL/token) ----
  const guide = isConfigured() ? null : h('div', { class: 'card card-guide' },
    h('h2', null, 'Bắt đầu: kết nối Google Sheets'),
    h('ol', { class: 'steps' },
      h('li', null, 'Tạo Google Sheet, mở Apps Script và dán mã trong thư mục apps-script/.'),
      h('li', null, 'Đặt Script Property API_TOKEN, chạy setup rồi triển khai Web app.'),
      h('li', null, 'Dán URL Web app và token vào mục “Kết nối Google Sheets” bên dưới, bấm Lưu kết nối.'),
    ),
  );

  // ---- Danh sách căn ----
  let rows = state.units.map((u) => ({ ...u }));
  const tbody = h('tbody');
  const matchOut = h('p', { class: 'match-out', 'aria-live': 'polite' });
  const testInput = h('input', { id: 'test-code', class: 'input', type: 'text', autocomplete: 'off', placeholder: 'Nhập mã KH, ví dụ mã trong tin nhắn' });

  const cellInput = (row, key, label) => {
    const input = h('input', { class: 'input', type: 'text', 'aria-label': label, autocomplete: 'off', value: row[key] || '' });
    input.addEventListener('input', () => { row[key] = input.value; runMatchTest(); });
    return input;
  };

  function paintRows() {
    tbody.replaceChildren(...rows.map((row, i) => h('tr', null,
      h('td', null, cellInput(row, 'name', `Tên căn, dòng ${i + 1}`)),
      h('td', null, cellInput(row, 'elecSuffix', `Mã khớp điện, dòng ${i + 1}`)),
      h('td', null, cellInput(row, 'waterSuffix', `Mã khớp nước, dòng ${i + 1}`)),
      h('td', null, h('button', {
        type: 'button', class: 'icon-btn icon-btn-flat', 'aria-label': `Xoá căn ${row.name || i + 1}`,
        onClick: () => { rows.splice(i, 1); paintRows(); runMatchTest(); },
      }, icon('trash'))),
    )));
  }

  function runMatchTest() {
    const code = testInput.value.trim();
    if (!code) { matchOut.textContent = ''; return; }
    const e = matchUnit(code, 'elec', rows);
    const w = matchUnit(code, 'water', rows);
    matchOut.textContent = `Điện: ${e ? e.name.toUpperCase() : 'không khớp'} · Nước: ${w ? w.name.toUpperCase() : 'không khớp'}`;
  }
  testInput.addEventListener('input', runMatchTest);

  // Chưa tải được dữ liệu từ Sheet (loaded=false): khoá nút lưu để không ghi đè dữ liệu thật bằng form rỗng
  const LOCK_TEXT = 'Chưa tải được dữ liệu từ Google Sheets nên tạm khoá nút lưu (tránh ghi đè dữ liệu thật). Kiểm tra kết nối bên dưới rồi thử lại.';
  const lockNoteUnits = h('p', { class: 'note-warn', role: 'status' });
  const lockNoteBank = h('p', { class: 'note-warn', role: 'status' });
  /** Khoá/mở hai nút lưu theo state.loaded (gọi lại sau mỗi lần setBusy(false) vì setBusy mở nút). */
  function syncLock() {
    const locked = !getState().loaded;
    for (const [btn, note] of [[saveUnitsBtn, lockNoteUnits], [saveBankBtn, lockNoteBank]]) {
      btn.disabled = locked;
      note.textContent = locked ? LOCK_TEXT : '';
      note.hidden = !locked;
    }
  }
  const saveUnitsBtn = h('button', { type: 'button', class: 'btn' }, 'Lưu cấu hình');
  const unitsCard = h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', null, 'Danh sách căn'),
      h('button', {
        type: 'button', class: 'btn btn-secondary btn-sm',
        onClick: () => { rows.push({ name: '', elecSuffix: '', waterSuffix: '' }); paintRows(); },
      }, icon('plus'), 'Thêm căn'),
    ),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'table table-form' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Tên căn'), h('th', { scope: 'col' }, 'Mã khớp điện'),
          h('th', { scope: 'col' }, 'Mã khớp nước'), h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Thao tác')))),
        tbody,
      ),
    ),
    h('div', { class: 'field mt' }, h('label', { for: 'test-code' }, 'Thử khớp mã'), testInput, matchOut),
    h('div', { class: 'actions mt' },
      saveUnitsBtn),
    lockNoteUnits,
  );
  saveUnitsBtn.addEventListener('click', async () => {
    const clean = rows
      .map((r) => ({ name: r.name.trim().toUpperCase(), elecSuffix: r.elecSuffix.trim(), waterSuffix: r.waterSuffix.trim() }))
      .filter((r) => r.name);
    // Validate khớp quy tắc server (tránh gửi đi rồi nhận bad_request)
    if (!clean.length) { toast('Cần ít nhất một căn.', 'error'); return; }
    const bad = clean.find((r) => !RE_UNIT.test(r.name) || !RE_SUFFIX.test(r.elecSuffix) || !RE_SUFFIX.test(r.waterSuffix));
    if (bad) {
      toast(`Căn ${bad.name}: tên chỉ gồm chữ, số, gạch (tối đa 20 ký tự); mã khớp chỉ gồm chữ, số, gạch nối.`, 'error');
      return;
    }
    if (new Set(clean.map((r) => r.name)).size !== clean.length) {
      toast('Tên căn bị trùng, hãy đổi tên.', 'error');
      return;
    }
    setBusy(saveUnitsBtn, true);
    try {
      await saveUnits(clean.map(unitToRow));
      toast('Đã lưu danh sách căn.', 'ok');
      rows = clean.map((r) => ({ ...r }));
      paintRows();
      await reloadAll();
    } catch (err) {
      toast(errorMessage(err), 'error'); // giữ nguyên nội dung đang sửa
    } finally {
      setBusy(saveUnitsBtn, false);
      syncLock();
    }
  });
  paintRows();

  // ---- Tài khoản nhận chuyển khoản ----
  const cfg = state.config;
  const field = (id, label, value, extra = {}) => {
    const input = h('input', { id, class: 'input', type: 'text', autocomplete: 'off', value: value || '', ...extra });
    return { input, node: h('div', { class: 'field' }, h('label', { for: id }, label), input) };
  };
  const fBank = field('cfg-bank', 'Tên ngân hàng', cfg.bank_name);
  const fHolder = field('cfg-holder', 'Chủ tài khoản', cfg.bank_holder);
  const fAcc = field('cfg-account', 'Số tài khoản', cfg.bank_account, { inputmode: 'numeric' });
  const fTpl = field('cfg-template', 'Nội dung chuyển khoản mẫu', cfg.transfer_template || '{căn} T{tháng}/{năm}');
  const tplPreview = h('p', { class: 'text-sub' });
  const updateTpl = () => {
    tplPreview.textContent = `Ví dụ: ${transferContent(fTpl.input.value, 'PB08', getState().period)} (biến: {căn}, {tháng}, {năm})`;
  };
  fTpl.input.addEventListener('input', updateTpl);
  updateTpl();

  // QR: nén bằng canvas -> data URL; chỉ gửi lên Sheet (chia mảnh) khi bấm "Lưu tài khoản"
  let qrUrl = qrFromConfig(cfg); // data URL hiện tại (từ Sheet hoặc vừa chọn)
  let qrDirty = false;           // true khi người dùng đã đổi/xoá QR so với bản đã lưu
  const qrPreview = h('div', { class: 'qr-preview' });
  const qrFile = h('input', { id: 'cfg-qr', class: 'sr-only', type: 'file', accept: 'image/*', tabindex: -1, 'aria-label': 'Chọn ảnh QR' });
  const qrRemove = h('button', { type: 'button', class: 'btn btn-danger btn-sm' }, icon('trash'), 'Xoá QR');
  function paintQr() {
    // src là data URL đã qua isImageDataUrl (qrFromConfig/compressQr) nên an toàn
    qrPreview.replaceChildren(qrUrl
      ? h('img', { src: qrUrl, alt: 'Xem trước mã QR', width: 120, height: 120 })
      : h('span', { class: 'text-sub' }, 'Chưa có ảnh QR'));
    qrRemove.disabled = !qrUrl;
  }
  paintQr();
  qrFile.addEventListener('change', async () => {
    const file = qrFile.files[0];
    qrFile.value = ''; // cho phép chọn lại cùng file
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Hãy chọn một file ảnh.', 'error'); return; }
    if (file.size > MAX_QR_BYTES) { toast('Ảnh QR lớn hơn 2 MB, hãy chọn ảnh nhỏ hơn.', 'error'); return; }
    try {
      const url = await compressQr(file);
      if (url.length > QR_MAX_LENGTH) { toast('Ảnh QR sau khi nén vẫn quá lớn, hãy chọn ảnh nhỏ hơn.', 'error'); return; }
      qrUrl = url;
      qrDirty = true;
      paintQr();
      toast('Đã nén ảnh QR. Bấm “Lưu tài khoản” để lưu.', 'info');
    } catch {
      toast('Không đọc được ảnh QR. Hãy thử file ảnh khác (PNG hoặc JPG).', 'error');
    }
  });
  qrRemove.addEventListener('click', () => {
    qrUrl = '';
    qrDirty = true; // lưu sẽ ghi qr_parts = 0
    paintQr();
  });

  const saveBankBtn = h('button', { type: 'button', class: 'btn' }, 'Lưu tài khoản');
  const bankCard = h('div', { class: 'card' },
    h('h2', null, 'Tài khoản nhận chuyển khoản'),
    h('div', { class: 'form-stack mt' },
      fBank.node, fHolder.node, fAcc.node,
      h('div', null, fTpl.node, tplPreview),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Ảnh QR'),
        h('div', { class: 'qr-row' }, qrPreview,
          h('div', { class: 'stack-sm' },
            h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => qrFile.click() }, icon('upload'), 'Tải ảnh QR lên'),
            qrRemove)),
        qrFile,
      ),
    ),
    h('div', { class: 'actions mt' }, saveBankBtn),
    lockNoteBank,
  );
  saveBankBtn.addEventListener('click', async () => {
    const config = {
      bank_name: fBank.input.value.trim(),
      bank_holder: fHolder.input.value.trim(),
      bank_account: fAcc.input.value.trim(),
      transfer_template: fTpl.input.value.trim() || '{căn} T{tháng}/{năm}',
    };
    if (Object.values(config).some((v) => v.length > 200)) {
      toast('Mỗi trường tối đa 200 ký tự.', 'error');
      return;
    }
    // Chỉ gửi phần QR khi có thay đổi; qr_parts = 0 để server xoá mảnh dư
    if (qrDirty) Object.assign(config, qrToConfig(qrUrl));
    setBusy(saveBankBtn, true);
    try {
      await saveConfig(config);
      qrDirty = false;
      toast('Đã lưu tài khoản nhận tiền.', 'ok');
      await reloadAll();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(saveBankBtn, false);
      syncLock();
    }
  });

  // ---- Kết nối Google Sheets ----
  const creds = loadCredentials();
  const urlInput = h('input', { id: 'cfg-url', class: 'input', type: 'url', autocomplete: 'off', value: creds.url, placeholder: 'https://script.google.com/macros/s/…/exec' });
  const tokenInput = h('input', { id: 'cfg-token', class: 'input', type: 'password', autocomplete: 'off', value: creds.token });
  const statusChip = h('span', { class: 'chip' });
  const saveConnBtn = h('button', { type: 'button', class: 'btn' }, 'Lưu kết nối');
  const testBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Kiểm tra kết nối');
  const paintStatus = (s) => {
    const [text, cls] = CONNECTION_LABEL[s.connection] || CONNECTION_LABEL.none;
    statusChip.className = `chip ${cls}`.trim();
    statusChip.textContent = text;
  };
  paintStatus(state);

  const connCard = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Kết nối Google Sheets'), statusChip),
    h('div', { class: 'form-stack mt' },
      h('div', { class: 'field' }, h('label', { for: 'cfg-url' }, 'URL Apps Script'), urlInput),
      h('div', { class: 'field' }, h('label', { for: 'cfg-token' }, 'Token'), tokenInput),
      h('p', { class: 'text-sub' }, 'Hai giá trị này chỉ lưu trong trình duyệt của bạn (localStorage).'),
    ),
    h('div', { class: 'actions mt' }, saveConnBtn, testBtn),
  );

  /** Lưu URL + token từ ô nhập; trả về true nếu hợp lệ (toast lỗi nếu không). */
  function storeCredentials() {
    const before = loadCredentials();
    try {
      saveConnection(urlInput.value, tokenInput.value);
    } catch (err) {
      toast(errorMessage(err), 'error');
      return false;
    }
    const after = loadCredentials();
    // Đổi URL/token: bỏ dữ liệu của Sheet cũ; form Cấu hình được dựng lại (main.js) khi reloadAll thành công kế tiếp
    if (after.url !== before.url || after.token !== before.token) invalidateData();
    guide?.remove();
    return true;
  }

  saveConnBtn.addEventListener('click', async () => {
    if (!storeCredentials()) return;
    setState({ connection: 'unchecked' });
    toast('Đã lưu thông tin kết nối.', 'ok');
    setBusy(saveConnBtn, true);
    try { await reloadAll(); } finally { setBusy(saveConnBtn, false); }
  });

  testBtn.addEventListener('click', async () => {
    if (!storeCredentials()) return;
    setBusy(testBtn, true);
    setState({ connection: 'checking' });
    try {
      await ping();
      setState({ connection: 'ok' });
      toast('Kết nối thành công.', 'ok');
      await reloadAll();
    } catch (err) {
      setState({ connection: 'error' });
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(testBtn, false);
    }
  });

  // appendChildren bỏ qua guide = null (container.append(null) sẽ chèn chữ "null")
  appendChildren(container, [
    guide,
    unitsCard,
    h('div', { class: 'grid grid-2 grid-top' }, bankCard, connCard),
  ]);

  syncLock();
  return subscribe((s, changed) => {
    if (changed.includes('connection')) paintStatus(s);
    if (changed.includes('loaded')) syncLock();
  });
}
