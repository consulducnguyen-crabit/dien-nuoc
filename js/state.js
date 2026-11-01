// State tập trung + pub/sub đơn giản. Các trang đọc dữ liệu từ đây (Phase 4 chỉ cần ghi dữ liệu thật vào state).

import { previousPeriod } from './format.js';

export const STORAGE_URL = 'hd_api_url';
export const STORAGE_TOKEN = 'hd_api_token';

/** Kỳ mặc định khi mở app: THÁNG TRƯỚC của tháng hiện tại, dạng 'YYYY-MM' (theo giờ máy; xuất tháng sau cho tháng trước). */
export function defaultPeriod() {
  const d = new Date();
  return previousPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
}

const state = {
  units: [],            // [{ name, elecSuffix, waterSuffix }]
  config: {},           // bank_name, bank_holder, bank_account, transfer_template, ...
  invoices: [],         // hoá đơn của mọi kỳ đã tải
  notifiedRev: 0, // tăng mỗi lần chỉ đổi cờ 'đã thông báo' (router không dựng lại cả trang)
  period: defaultPeriod(),
  selectedUnit: '',     // căn đang chọn (Thống kê -> Thông báo)
  // 'none' | 'unchecked' | 'checking' | 'ok' | 'error'
  connection: 'none',
  loading: false,       // đang tải getAll (hiện skeleton)
  loaded: false,        // đã tải thành công ít nhất một lần
};

const listeners = new Set();

export function getState() {
  return state;
}

/** Gộp patch vào state; chỉ báo cho subscriber khi có khoá thật sự đổi. */
export function setState(patch) {
  const changed = [];
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] !== value) {
      state[key] = value;
      changed.push(key);
    }
  }
  if (changed.length) {
    for (const fn of [...listeners]) fn(state, changed);
  }
}

/** Đăng ký lắng nghe; trả về hàm huỷ đăng ký. fn(state, changedKeys). */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** URL + token Apps Script lưu trong localStorage (không hard-code). */
export function loadCredentials() {
  try {
    return {
      url: localStorage.getItem(STORAGE_URL) || '',
      token: localStorage.getItem(STORAGE_TOKEN) || '',
    };
  } catch {
    return { url: '', token: '' }; // localStorage bị chặn (chế độ riêng tư...)
  }
}
