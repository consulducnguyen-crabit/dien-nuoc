/**
 * Backend Google Apps Script cho ứng dụng hoá đơn điện, nước.
 * Script gắn (container-bound) với Google Sheet; dữ liệu nằm ở 3 sheet: Units, Invoices, Config.
 *
 * Bảo mật:
 *  - Token đặt ở Script Properties với tên API_TOKEN (KHÔNG hard-code trong file này).
 *  - Mọi request POST đều phải kèm "token" khớp API_TOKEN, sai/thiếu -> { ok:false, error:'unauthorized' }.
 *  - Mọi chuỗi ghi vào Sheet được đặt định dạng text ('@') nên Sheets không diễn giải thành công thức/ngày.
 *
 * Quy ước dữ liệu: các object trả về / nhận vào dùng đúng tên cột snake_case của Sheet (mục 7.1 plan.md).
 */

// ===== Hằng số =====
var SHEET_UNITS = 'Units';
var SHEET_INVOICES = 'Invoices';
var SHEET_CONFIG = 'Config';

var UNIT_HEADERS = ['unit_id', 'name', 'elec_suffix', 'water_suffix', 'sort'];
var INVOICE_HEADERS = [
  'key', 'period', 'unit', 'type', 'customer_code', 'period_from', 'period_to',
  'index_start', 'index_end', 'consumption', 'unit_label', 'amount', 'due_date',
  'raw_message', 'created_at', 'updated_at', 'notified_at'  // notified_at đặt CUỐI để Sheet cũ tương thích
];
var MAX_NOTIFY_KEYS = 20;
var CONFIG_HEADERS = ['key', 'value'];

// Các cột số của Invoices/Units: định dạng số '0.###', còn lại ép text.
var NUMERIC_COLS = {
  index_start: true, index_end: true, consumption: true, amount: true, sort: true
};

var CONFIG_KEYS = ['bank_name', 'bank_holder', 'bank_account', 'transfer_template', 'qr_parts'];
var DEFAULT_TRANSFER_TEMPLATE = '{căn} T{tháng}/{năm}';
var DEFAULT_UNITS = [
  { name: 'TD475', elec_suffix: 'TD475', water_suffix: 'TD475' },
  { name: 'TD473', elec_suffix: 'TD473', water_suffix: 'TD473' },
  { name: 'PB08', elec_suffix: 'PB08', water_suffix: 'PB08' }
];

var MAX_BODY_LEN = 1000000;     // giới hạn kích thước body (ký tự)
// Riêng action ocrImage: ảnh base64 tới ~2,5 triệu ký tự (+ phần bao JSON/token)
var MAX_OCR_BASE64_LEN = 2500000;
var MAX_OCR_BODY_LEN = 2600000;
var OCR_MIMES = { 'image/jpeg': true, 'image/png': true, 'image/webp': true };
var MAX_INVOICES_PER_CALL = 200;
var MAX_UNITS = 50;
var MAX_QR_PARTS = 10;          // 10 mảnh x 40.000 ký tự > 200.000 ký tự cho phép ở client
var MAX_QR_PART_LEN = 45000;    // dưới giới hạn 50.000 ký tự/ô
var LOCK_WAIT_MS = 20000;

// ===== Điểm vào =====

/** GET: không lộ dữ liệu, chỉ cho biết dịch vụ đang chạy. */
function doGet() {
  return json_({ ok: false, error: 'unauthorized', ready: true });
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!isAuthorized_(body.token)) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    var action = body.action;
    var handlers = {
      ping: handlePing_,
      getAll: handleGetAll_,
      saveInvoices: handleSaveInvoices_,
      saveUnits: handleSaveUnits_,
      saveConfig: handleSaveConfig_,
      deleteInvoice: handleDeleteInvoice_,
      markNotified: handleMarkNotified_,
      ocrImage: handleOcrImage_,
      setup: handleSetup_
    };
    if (typeof action !== 'string' || !handlers.hasOwnProperty(action)) {
      throw badRequest_('unknown action');
    }
    var result = handlers[action](body);
    result.ok = true;
    return json_(result);
  } catch (err) {
    // Chỉ ghi log nội bộ (không chứa token/payload), không trả stack cho client.
    var code = err && err.code === 'bad_request' ? 'bad_request' : 'server_error';
    if (code === 'server_error') {
      console.error('server_error: ' + (err && err.message ? err.message : err));
    }
    // Chỉ ocrImage (đã qua kiểm token) mới trả detail/hint để người dùng biết nguyên nhân thật.
    if (code === 'server_error' && err && err.ocrDetail) {
      return json_({ ok: false, error: 'server_error', detail: err.ocrDetail, hint: err.ocrHint || '' });
    }
    return json_({ ok: false, error: code });
  }
}

/** Chạy tay từ trình soạn thảo Apps Script để tạo sheet (không cần token). */
function setup() {
  return withLock_(function () { return setupSheets_(); });
}

// ===== Tiện ích chung =====

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function badRequest_(msg) {
  var e = new Error(msg);
  e.code = 'bad_request';
  return e;
}

function parseBody_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') throw badRequest_('empty body');
  var len = e.postData.contents.length;
  // Body lớn chỉ dành cho ocrImage: chặn sớm (trước khi parse) mọi body quá trần; body > MAX_BODY_LEN
  // mà không nhắc tới ocrImage bị loại ngay, rồi kiểm lại chính xác theo body.action sau khi parse.
  if (len > MAX_OCR_BODY_LEN) throw badRequest_('body too large');
  if (len > MAX_BODY_LEN && e.postData.contents.indexOf('ocrImage') === -1) throw badRequest_('body too large');
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (x) {
    throw badRequest_('invalid json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest_('invalid body');
  if (len > MAX_BODY_LEN && body.action !== 'ocrImage') throw badRequest_('body too large');
  return body;
}

/** So sánh token theo thời gian không phụ thuộc vị trí khác biệt (tránh rò thông tin qua timing). */
function isAuthorized_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected || typeof token !== 'string') return false;
  var diff = expected.length ^ token.length;
  var n = Math.max(expected.length, token.length);
  for (var i = 0; i < n; i++) {
    diff |= (expected.charCodeAt(i) || 0) ^ (token.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS); // quá hạn sẽ ném lỗi -> server_error
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getSs_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  var sheet = getSs_().getSheetByName(name);
  if (!sheet) throw new Error('missing sheet ' + name + ' (chưa chạy setup)');
  return sheet;
}

function nowStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', "yyyy-MM-dd'T'HH:mm:ss");
}

// Cột kỳ (yyyy-MM) và cột ngày (yyyy-MM-dd): nếu Sheets lỡ chuyển thành Date thì chuẩn hoá lại khi đọc.
var PERIOD_COLS = { period: true };
var DATE_COLS = { period_from: true, period_to: true, due_date: true };

/** Chuẩn hoá giá trị ô đọc ra: Date -> chuỗi theo tên cột, null -> ''. */
function cell_(v, header) {
  if (v instanceof Date) {
    var fmt = PERIOD_COLS[header] ? 'yyyy-MM' : 'yyyy-MM-dd';
    return Utilities.formatDate(v, 'Asia/Ho_Chi_Minh', fmt);
  }
  return v === null || v === undefined ? '' : v;
}

/** Đặt định dạng cho cả cột: text ('@') trừ cột số. Chống Sheets tự đổi kiểu / diễn giải công thức. */
function applyColumnFormats_(sheet, headers) {
  var rows = sheet.getMaxRows();
  for (var c = 0; c < headers.length; c++) {
    sheet.getRange(1, c + 1, rows, 1).setNumberFormat(NUMERIC_COLS[headers[c]] ? '0.###' : '@');
  }
}

/**
 * Ghi một khối giá trị từ A2. Thứ tự: đặt định dạng text '@' TRƯỚC, rồi setValues, rồi mới xoá dòng dư
 * (ghi trước, xoá sau: nếu lỗi giữa chừng thì không mất toàn bộ dữ liệu cũ).
 * Chuỗi bắt đầu bằng = + - @ được lưu nguyên text (không thêm tiền tố nên đọc lại không đổi giá trị).
 */
function writeBlock_(sheet, headers, rows) {
  var oldLast = sheet.getLastRow();
  if (rows.length) {
    var needRows = rows.length + 1;
    if (sheet.getMaxRows() < needRows) {
      sheet.insertRowsAfter(sheet.getMaxRows(), needRows - sheet.getMaxRows());
    }
    var range = sheet.getRange(2, 1, rows.length, headers.length);
    var fmtRow = headers.map(function (h) { return NUMERIC_COLS[h] ? '0.###' : '@'; });
    range.setNumberFormats(rows.map(function () { return fmtRow; }));
    range.setValues(rows);
    guardFormulas_(range, rows, headers);
  }
  // Chỉ xoá phần dòng dư phía dưới khối vừa ghi
  var newLast = rows.length + 1;
  if (oldLast > newLast) {
    sheet.getRange(newLast + 1, 1, oldLast - newLast, headers.length).clearContent();
  }
}

/**
 * Phòng thủ: nếu ô text bắt đầu bằng = + - @ mà vẫn bị Sheets coi là công thức thì ghi lại dưới dạng rich text
 * (luôn là text thuần). Chưa kiểm chứng trên Sheets thật, xem README.
 */
function guardFormulas_(range, rows, headers) {
  var formulas = range.getFormulas();
  for (var r = 0; r < rows.length; r++) {
    for (var c = 0; c < headers.length; c++) {
      if (formulas[r][c] && !NUMERIC_COLS[headers[c]] && typeof rows[r][c] === 'string') {
        range.getCell(r + 1, c + 1).setRichTextValue(
          SpreadsheetApp.newRichTextValue().setText(rows[r][c]).build());
      }
    }
  }
}

/** Chỉ số (0-based) các tiêu đề trong `headers` mà hàng tiêu đề hiện tại `head` còn thiếu/trống. Hàm thuần. */
function missingHeaderIdx_(head, headers) {
  var out = [];
  for (var i = 0; i < headers.length; i++) {
    if (head[i] === undefined || head[i] === null || head[i] === '') out.push(i);
  }
  return out;
}

/**
 * Sheet Invoices cũ (chưa có cột notified_at): tự thêm tiêu đề cột còn thiếu, chèn cột nếu sheet hẹp hơn,
 * đặt định dạng text '@'. Idempotent. PHẢI gọi trước mọi lần đọc/ghi Invoices (đọc vượt số cột sẽ ném lỗi).
 * Gọi bên trong withLock_ (hoặc qua ensureInvoiceColumnsLocked_).
 */
function ensureInvoiceColumns_(sheet) {
  var n = INVOICE_HEADERS.length;
  if (sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());
  var head = sheet.getRange(1, 1, 1, n).getValues()[0];
  var missing = missingHeaderIdx_(head, INVOICE_HEADERS);
  missing.forEach(function (i) {
    sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat(NUMERIC_COLS[INVOICE_HEADERS[i]] ? '0.###' : '@');
    sheet.getRange(1, i + 1).setValue(INVOICE_HEADERS[i]).setFontWeight('bold');
  });
}

/** Dùng cho đường đọc (getAll): chỉ xin khoá khi thật sự thiếu cột để không làm chậm lần đọc thường. */
function ensureInvoiceColumnsLocked_(sheet) {
  var n = INVOICE_HEADERS.length;
  var head = sheet.getMaxColumns() < n ? [] : sheet.getRange(1, 1, 1, n).getValues()[0];
  if (missingHeaderIdx_(head, INVOICE_HEADERS).length) {
    withLock_(function () { ensureInvoiceColumns_(sheet); });
  }
}

/**
 * notified_at sau khi upsert: giữ giá trị cũ nếu amount và consumption không đổi; đổi một trong hai
 * (hoá đơn thay đổi, cần thông báo lại) hoặc bản mới thì ''. oldRow là hàng cũ theo INVOICE_HEADERS (hoặc null).
 */
function keepNotifiedAt_(oldRow, inv) {
  if (!oldRow) return '';
  var ia = INVOICE_HEADERS.indexOf('amount');
  var ic = INVOICE_HEADERS.indexOf('consumption');
  var same = String(oldRow[ia]) === String(inv.amount) && String(oldRow[ic]) === String(inv.consumption);
  return same ? (oldRow[INVOICE_HEADERS.indexOf('notified_at')] || '') : '';
}

function readRows_(sheet, headers) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, headers.length).getValues().map(function (r) {
    return r.map(function (v, i) { return cell_(v, headers[i]); });
  });
}

// ===== Validate =====

var RE_PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
var RE_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
var RE_UNIT = /^[A-Z0-9_-]{1,20}$/;
var RE_SUFFIX = /^[A-Za-z0-9-]{0,30}$/;
var RE_KEY = /^\d{4}-(0[1-9]|1[0-2])\|[A-Z0-9_-]{1,20}\|(elec|water)$/;

function isPlainObject_(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function reqString_(v, maxLen, allowEmpty) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw badRequest_('expected string');
  if (v.length > maxLen) throw badRequest_('string too long');
  if (!allowEmpty && v === '') throw badRequest_('empty string');
  return v;
}

function optNumber_(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1e12) throw badRequest_('bad number');
  return v;
}

function optDate_(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || !RE_DATE.test(v)) throw badRequest_('bad date');
  return v;
}

function validateInvoice_(inv) {
  if (!isPlainObject_(inv)) throw badRequest_('invoice must be object');
  var period = reqString_(inv.period, 7);
  if (!RE_PERIOD.test(period)) throw badRequest_('bad period');
  var unit = reqString_(inv.unit, 20).toUpperCase();
  if (!RE_UNIT.test(unit)) throw badRequest_('bad unit');
  var type = inv.type;
  if (type !== 'elec' && type !== 'water') throw badRequest_('bad type');
  return {
    key: period + '|' + unit + '|' + type, // key luôn tính ở server, bỏ qua key client gửi
    period: period,
    unit: unit,
    type: type,
    customer_code: reqString_(inv.customer_code, 50, true),
    period_from: optDate_(inv.period_from),
    period_to: optDate_(inv.period_to),
    index_start: optNumber_(inv.index_start),
    index_end: optNumber_(inv.index_end),
    consumption: optNumber_(inv.consumption),
    unit_label: reqString_(inv.unit_label, 10, true),
    amount: optNumber_(inv.amount),
    due_date: optDate_(inv.due_date),
    raw_message: reqString_(inv.raw_message, 5000, true)
  };
}

function validateUnit_(u, idx) {
  if (!isPlainObject_(u)) throw badRequest_('unit must be object');
  var name = reqString_(u.name, 20).toUpperCase();
  if (!RE_UNIT.test(name)) throw badRequest_('bad unit name');
  var elec = reqString_(u.elec_suffix, 30, true);
  var water = reqString_(u.water_suffix, 30, true);
  if (!RE_SUFFIX.test(elec) || !RE_SUFFIX.test(water)) throw badRequest_('bad suffix');
  var sort = u.sort === undefined || u.sort === null || u.sort === '' ? idx + 1 : u.sort;
  if (typeof sort !== 'number' || !isFinite(sort) || sort < 0 || sort > 100000) throw badRequest_('bad sort');
  return { unit_id: name, name: name, elec_suffix: elec, water_suffix: water, sort: sort };
}

/** Kiểm tra một cặp config; trả về chuỗi value đã chuẩn hoá. */
function validateConfigPair_(key, value) {
  if (typeof key !== 'string') throw badRequest_('bad config key');
  var m = /^qr_part_(\d{1,2})$/.exec(key);
  if (m) {
    if (parseInt(m[1], 10) >= MAX_QR_PARTS) throw badRequest_('qr part index too large');
    return reqString_(value, MAX_QR_PART_LEN, true);
  }
  if (CONFIG_KEYS.indexOf(key) === -1) throw badRequest_('config key not allowed');
  if (key === 'qr_parts') {
    var n = typeof value === 'string' && /^\d{1,2}$/.test(value) ? parseInt(value, 10) : value;
    if (typeof n !== 'number' || n !== Math.floor(n) || n < 0 || n > MAX_QR_PARTS) {
      throw badRequest_('bad qr_parts');
    }
    return String(n);
  }
  return reqString_(value, 200, true);
}

// ===== Handlers =====

function handlePing_() {
  return { pong: true };
}

function handleGetAll_(body) {
  var period = body.period;
  if (period !== undefined && period !== null && period !== '') {
    if (typeof period !== 'string' || !RE_PERIOD.test(period)) throw badRequest_('bad period');
  } else {
    period = '';
  }

  var units = readRows_(getSheet_(SHEET_UNITS), UNIT_HEADERS)
    .filter(function (r) { return r[1] !== ''; })
    .map(function (r) { return rowToObj_(UNIT_HEADERS, r); })
    .sort(function (a, b) { return (Number(a.sort) || 0) - (Number(b.sort) || 0); });

  var config = {};
  readRows_(getSheet_(SHEET_CONFIG), CONFIG_HEADERS).forEach(function (r) {
    if (r[0] !== '') config[String(r[0])] = String(r[1]);
  });

  var invSheet = getSheet_(SHEET_INVOICES);
  ensureInvoiceColumnsLocked_(invSheet);
  var invoices = readRows_(invSheet, INVOICE_HEADERS)
    .filter(function (r) { return r[0] !== '' && (!period || r[1] === period); })
    .map(function (r) { return rowToObj_(INVOICE_HEADERS, r); });

  return { units: units, config: config, invoices: invoices };
}

function rowToObj_(headers, row) {
  var o = {};
  for (var i = 0; i < headers.length; i++) o[headers[i]] = row[i];
  return o;
}

function handleSaveInvoices_(body) {
  var list = body.invoices;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_INVOICES_PER_CALL) {
    throw badRequest_('invoices must be non-empty array');
  }
  // Validate toàn bộ trước khi lấy khoá/ghi; trùng key trong cùng lần gửi: bản sau thắng.
  var byKey = {};
  var order = [];
  list.forEach(function (raw) {
    var inv = validateInvoice_(raw);
    if (!byKey.hasOwnProperty(inv.key)) order.push(inv.key);
    byKey[inv.key] = inv;
  });

  return withLock_(function () {
    var sheet = getSheet_(SHEET_INVOICES);
    ensureInvoiceColumns_(sheet);
    var rows = readRows_(sheet, INVOICE_HEADERS);
    var rowIndex = {};
    rows.forEach(function (r, i) { rowIndex[r[0]] = i; });

    var ts = nowStr_();
    var added = 0, updated = 0;
    order.forEach(function (key) {
      var inv = byKey[key];
      var idx = rowIndex.hasOwnProperty(key) ? rowIndex[key] : -1;
      var created = idx >= 0 ? rows[idx][INVOICE_HEADERS.indexOf('created_at')] || ts : ts; // giữ created_at cũ
      inv.created_at = created;
      inv.updated_at = ts;
      inv.notified_at = keepNotifiedAt_(idx >= 0 ? rows[idx] : null, inv); // client không gửi notified_at, server tự giữ/xoá
      var row = INVOICE_HEADERS.map(function (h) { return inv[h]; });
      if (idx >= 0) {
        rows[idx] = row;
        updated++;
      } else {
        rowIndex[key] = rows.length;
        rows.push(row);
        added++;
      }
    });
    writeBlock_(sheet, INVOICE_HEADERS, rows);
    return { added: added, updated: updated };
  });
}

function handleSaveUnits_(body) {
  var list = body.units;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_UNITS) {
    throw badRequest_('units must be non-empty array');
  }
  var seen = {};
  var rows = list.map(function (raw, i) {
    var u = validateUnit_(raw, i);
    if (seen[u.name]) throw badRequest_('duplicate unit');
    seen[u.name] = true;
    return UNIT_HEADERS.map(function (h) { return u[h]; });
  });
  return withLock_(function () {
    writeBlock_(getSheet_(SHEET_UNITS), UNIT_HEADERS, rows);
    return { count: rows.length };
  });
}

function handleSaveConfig_(body) {
  var cfg = body.config;
  if (!isPlainObject_(cfg)) throw badRequest_('config must be object');
  var keys = Object.keys(cfg);
  if (keys.length === 0 || keys.length > MAX_QR_PARTS + CONFIG_KEYS.length) throw badRequest_('bad config size');
  var clean = {};
  keys.forEach(function (k) { clean[k] = validateConfigPair_(k, cfg[k]); });

  return withLock_(function () {
    var sheet = getSheet_(SHEET_CONFIG);
    var current = {};
    var order = [];
    readRows_(sheet, CONFIG_HEADERS).forEach(function (r) {
      var k = String(r[0]);
      if (k === '') return;
      if (!current.hasOwnProperty(k)) order.push(k);
      current[k] = String(r[1]);
    });
    keys.forEach(function (k) {
      if (!current.hasOwnProperty(k)) order.push(k);
      current[k] = clean[k];
    });

    // Khi qr_parts giảm (hoặc về 0): xoá các qr_part_<n> với n >= qr_parts để không còn mảnh dư.
    if (current.hasOwnProperty('qr_parts')) {
      var limit = parseInt(current.qr_parts, 10) || 0;
      order = order.filter(function (k) {
        var m = /^qr_part_(\d+)$/.exec(k);
        if (m && parseInt(m[1], 10) >= limit) {
          delete current[k];
          return false;
        }
        return true;
      });
    }

    var rows = order.map(function (k) { return [k, current[k]]; });
    writeBlock_(sheet, CONFIG_HEADERS, rows);
    return { count: rows.length };
  });
}

function handleDeleteInvoice_(body) {
  var key = body.key;
  if (typeof key !== 'string' || !RE_KEY.test(key)) throw badRequest_('bad key');
  return withLock_(function () {
    var sheet = getSheet_(SHEET_INVOICES);
    ensureInvoiceColumns_(sheet);
    var rows = readRows_(sheet, INVOICE_HEADERS);
    var kept =rows.filter(function (r) { return r[0] !== key; });
    var deleted = rows.length - kept.length;
    if (deleted > 0) writeBlock_(sheet, INVOICE_HEADERS, kept);
    return { deleted: deleted };
  });
}

/** Đánh dấu / bỏ đánh dấu "đã thông báo" cho tối đa 20 hoá đơn: notified_at = giờ hiện tại hoặc ''. */
function handleMarkNotified_(body) {
  var keys = body.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_NOTIFY_KEYS) throw badRequest_('bad keys');
  keys.forEach(function (k) {
    if (typeof k !== 'string' || !RE_KEY.test(k)) throw badRequest_('bad key');
  });
  if (typeof body.notified !== 'boolean') throw badRequest_('bad notified');
  return withLock_(function () {
    var sheet = getSheet_(SHEET_INVOICES);
    ensureInvoiceColumns_(sheet);
    var rows = readRows_(sheet, INVOICE_HEADERS);
    var ni = INVOICE_HEADERS.indexOf('notified_at');
    var want = {};
    keys.forEach(function (k) { want[k] = true; });
    var ts = body.notified ? nowStr_() : '';
    var updated = 0;
    rows.forEach(function (r) {
      if (want.hasOwnProperty(r[0])) { r[ni] = ts; updated++; }
    });
    if (updated > 0) writeBlock_(sheet, INVOICE_HEADERS, rows);
    return { updated: updated };
  });
}

/** Kiểm tra chữ ký (magic bytes) của ảnh khớp mime khai báo; bytes là mảng có dấu từ base64Decode. */
function imageSignatureOk_(bytes, mime) {
  function at(i) { return (bytes[i] + 256) % 256; }
  if (bytes.length < 12) return false;
  if (mime === 'image/jpeg') return at(0) === 0xFF && at(1) === 0xD8 && at(2) === 0xFF;
  if (mime === 'image/png') return at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4E && at(3) === 0x47;
  // webp: 'RIFF' .... 'WEBP'
  return at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50;
}

/**
 * OCR ảnh bằng Google Drive (Drive advanced service v2, cần bật trong appsscript.json).
 * Ảnh chỉ tồn tại tạm trong Drive của chủ Sheet; file tạm luôn bị xoá trong finally, kể cả khi lỗi.
 * Không ghi log nội dung ảnh/văn bản.
 */
function handleOcrImage_(body) {
  var mime = body.mime;
  var image = body.image;
  if (typeof mime !== 'string' || !OCR_MIMES.hasOwnProperty(mime)) throw badRequest_('bad mime');
  if (typeof image !== 'string' || image.length === 0 || image.length > MAX_OCR_BASE64_LEN) {
    throw badRequest_('bad image size');
  }
  if (image.length % 4 !== 0 || !/^[A-Za-z0-9+\/]+={0,2}$/.test(image)) throw badRequest_('bad base64');
  var bytes;
  try {
    bytes = Utilities.base64Decode(image);
  } catch (x) {
    throw badRequest_('bad base64');
  }
  if (!imageSignatureOk_(bytes, mime)) throw badRequest_('mime mismatch');

  try {
    return { text: runDriveOcr_(Utilities.newBlob(bytes, mime, 'ocr'), mime) };
  } catch (err) {
    // Gắn mã phân loại + message đã làm sạch để doPost trả cho client (không chứa dữ liệu ảnh).
    var e2 = new Error('ocr failed');
    e2.code = 'server_error';
    e2.ocrDetail = classifyOcrError_(err);
    e2.ocrHint = sanitizeOcrMessage_(err);
    console.error('ocr ' + e2.ocrDetail + ': ' + e2.ocrHint);
    throw e2;
  }
}

/** Upload blob lên Drive với OCR, đọc văn bản từ Doc tạm; file tạm luôn bị xoá trong finally. */
function runDriveOcr_(blob, mime) {
  var MAX_ATTEMPTS = 3;
  for (var i = 0; ; i++) {
    try {
      return runDriveOcrOnce_(blob, mime); // file tạm của lần này đã được dọn trong finally trước khi retry
    } catch (err) {
      // Chỉ retry lỗi giới hạn tốc độ/lỗi tạm; quota ngày, quyền, bad request ném ngay.
      if (i >= MAX_ATTEMPTS - 1 || !isRetryableOcrError_(err)) throw err;
      Utilities.sleep(1000 * Math.pow(2, i)); // 1s, 2s => tổng chờ 3s
    }
  }
}

/** Lỗi tạm thời (giới hạn tốc độ/backend) đáng thử lại; quota ngày thật thì không. */
var OCR_RATE_LIMIT_RE_ = /rate limit|user rate|too many requests|backend error|internal error|timed out/i;
function isRetryableOcrError_(err) {
  var m = String(err && err.message ? err.message : err);
  if (/daily limit|quota exceeded/i.test(m)) return false;
  return OCR_RATE_LIMIT_RE_.test(m);
}

function runDriveOcrOnce_(blob, mime) {
  var fileId = null;
  try {
    var title = 'ocr-tmp-' + Utilities.getUuid();
    var file = Drive.Files.insert({ title: title, mimeType: mime }, blob, { ocr: true, ocrLanguage: 'vi' });
    fileId = file.id;
    var text = DocumentApp.openById(fileId).getBody().getText();
    return String(text || '');
  } finally {
    if (fileId) {
      try {
        Drive.Files.remove(fileId); // xoá hẳn, không để lại thùng rác
      } catch (x) {
        try { DriveApp.getFileById(fileId).setTrashed(true); } catch (y) {
          console.error('ocr cleanup failed: ' + (y && y.message ? y.message : y));
        }
      }
    }
  }
}

/** Phân loại lỗi Drive/Document theo message (best-effort, không phụ thuộc cứng vào ngôn ngữ). */
function classifyOcrError_(err) {
  var m = String(err && err.message ? err.message : err);
  if (/Drive is not defined/i.test(m)) return 'drive_not_enabled';
  if (/authorization|permission|scope|access not granted/i.test(m)) return 'no_permission';
  // Quota ngày thật phải xét trước: "Daily Limit Exceeded" không phải lỗi tốc độ tạm thời.
  if (/daily limit|quota exceeded/i.test(m)) return 'quota';
  if (OCR_RATE_LIMIT_RE_.test(m)) return 'rate_limited';
  if (/quota|limit exceeded/i.test(m)) return 'quota';
  if (/ocr|invalid|argument|mime/i.test(m)) return 'drive_rejected';
  return 'ocr_failed';
}

/** Làm sạch message gốc: bỏ URL, chuỗi dài giống token/ID, cắt 200 ký tự. */
function sanitizeOcrMessage_(err) {
  var m = String(err && err.message ? err.message : err);
  m = m.replace(/https?:\/\/\S+/gi, '[url]').replace(/[A-Za-z0-9_\-+\/=]{25,}/g, '[id]');
  return m.substring(0, 200);
}

/**
 * Chạy tay trong trình soạn thảo (không cần token): chọn hàm testOcr rồi bấm Run,
 * xem kết quả/lỗi thật ở "Execution log". Lần đầu sẽ hiện hộp thoại cấp quyền Drive/Documents.
 */
function testOcr() {
  // PNG 1x1 hợp lệ; chỉ để kiểm tra Drive API + quyền, văn bản đọc ra có thể rỗng.
  var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(png), 'image/png', 'ocr-test');
    var text = runDriveOcr_(blob, 'image/png');
    Logger.log('OCR OK. Drive API + quyền hoạt động. Văn bản đọc được: "' + text + '"');
  } catch (err) {
    Logger.log('OCR LỖI [' + classifyOcrError_(err) + ']: ' + (err && err.message ? err.message : err));
  }
}

function handleSetup_() {
  return withLock_(function () { return setupSheets_(); });
}

/** Tạo sheet + tiêu đề nếu chưa có (idempotent); seed 3 căn và transfer_template mặc định khi còn trống. */
function setupSheets_() {
  var ss = getSs_();
  var defs = [
    [SHEET_UNITS, UNIT_HEADERS],
    [SHEET_INVOICES, INVOICE_HEADERS],
    [SHEET_CONFIG, CONFIG_HEADERS]
  ];
  var created = [];
  defs.forEach(function (d) {
    var sheet = ss.getSheetByName(d[0]);
    if (!sheet) {
      sheet = ss.insertSheet(d[0]);
      created.push(d[0]);
    }
    if (d[0] === SHEET_INVOICES) ensureInvoiceColumns_(sheet); // Sheet cũ thiếu cột notified_at
    applyColumnFormats_(sheet, d[1]);
    var head = sheet.getRange(1, 1, 1, d[1].length);
    head.setNumberFormat('@').setValues([d[1]]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  });

  var unitsSheet = ss.getSheetByName(SHEET_UNITS);
  var seeded = false;
  if (unitsSheet.getLastRow() < 2) {
    var rows = DEFAULT_UNITS.map(function (u, i) {
      return [u.name, u.name, u.elec_suffix, u.water_suffix, i + 1];
    });
    writeBlock_(unitsSheet, UNIT_HEADERS, rows);
    seeded = true;
  }

  var cfgSheet = ss.getSheetByName(SHEET_CONFIG);
  var cfgRows = readRows_(cfgSheet, CONFIG_HEADERS);
  var hasTemplate = cfgRows.some(function (r) { return r[0] === 'transfer_template'; });
  if (!hasTemplate) {
    cfgRows.push(['transfer_template', DEFAULT_TRANSFER_TEMPLATE]);
    writeBlock_(cfgSheet, CONFIG_HEADERS, cfgRows);
  }
  return { created: created, seeded: seeded };
}
