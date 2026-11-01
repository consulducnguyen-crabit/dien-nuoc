// Lớp dữ liệu: nối api.js với state. Chuyển đổi snake_case (Sheet) <-> camelCase (UI).
import { getAll, isConfigured, ApiError } from './api.js';
import { setState } from './state.js';
import { toast } from './ui.js';

// Ô số trống trong Sheet trả về '' -> null để UI/summary xử lý nhất quán
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v) => (v === null || v === undefined ? '' : String(v));

export function unitFromRow(r) {
  return { name: str(r.name).toUpperCase(), elecSuffix: str(r.elec_suffix), waterSuffix: str(r.water_suffix) };
}

export function unitToRow(u, idx) {
  return { name: u.name, elec_suffix: u.elecSuffix, water_suffix: u.waterSuffix, sort: idx + 1 };
}

export function invoiceFromRow(r) {
  return {
    key: str(r.key),
    period: str(r.period),
    unit: str(r.unit).toUpperCase(),
    type: r.type,
    customerCode: str(r.customer_code),
    periodFrom: str(r.period_from),
    periodTo: str(r.period_to),
    indexStart: num(r.index_start),
    indexEnd: num(r.index_end),
    consumption: num(r.consumption),
    unitLabel: str(r.unit_label),
    amount: num(r.amount),
    dueDate: str(r.due_date),
    rawMessage: str(r.raw_message),
  };
}

/** camelCase (+ period, unit đã xác định) -> object snake_case gửi saveInvoices. */
export function invoiceToRow(inv, period, unit) {
  return {
    period,
    unit,
    type: inv.type,
    customer_code: inv.customerCode || '',
    period_from: inv.periodFrom || '',
    period_to: inv.periodTo || '',
    index_start: inv.indexStart ?? null,
    index_end: inv.indexEnd ?? null,
    consumption: inv.consumption ?? null,
    unit_label: inv.unitLabel || '',
    amount: inv.amount ?? null,
    due_date: inv.dueDate || '',
    raw_message: String(inv.rawMessage || '').slice(0, 5000), // server giới hạn 5000 ký tự
  };
}

/** Thông điệp thân thiện từ lỗi bất kỳ (ApiError đã có tiếng Việt). */
export function errorMessage(err) {
  return err instanceof ApiError ? err.message : 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.';
}

let loadSeq = 0;

/**
 * Tải units/config/invoices từ Google Sheets vào state.
 * Trả về true nếu thành công. Chưa cấu hình: dọn state rỗng, không gọi mạng, không toast.
 * Lỗi: toast thông điệp ApiError; giữ dữ liệu cũ trong state.
 */
export async function reloadAll() {
  const mySeq = ++loadSeq; // request mới nhất thắng; kết quả request cũ bị bỏ
  if (!isConfigured()) {
    setState({ units: [], config: {}, invoices: [], loading: false, loaded: false, connection: 'none' });
    return false;
  }
  setState({ loading: true });
  try {
    const data = await getAll();
    if (mySeq !== loadSeq) return false; // đã có request mới hơn (hoặc dữ liệu bị huỷ): không ghi đè, không tắt loading của request mới
    setState({
      units: (data.units || []).map(unitFromRow),
      config: data.config && typeof data.config === 'object' ? data.config : {},
      invoices: (data.invoices || []).map(invoiceFromRow),
      loading: false,
      loaded: true,
      connection: 'ok',
    });
    return true;
  } catch (err) {
    if (mySeq !== loadSeq) return false; // lỗi của request cũ: bỏ qua
    setState({ loading: false, connection: 'error' });
    toast(errorMessage(err), 'error');
    return false;
  }
}

/**
 * Huỷ mọi request đang bay và xoá dữ liệu đã tải (dùng khi đổi URL/token để không dùng dữ liệu của Sheet cũ).
 * loaded về false nên các nút lưu bị khoá cho tới lần reloadAll thành công kế tiếp.
 */
export function invalidateData() {
  loadSeq++;
  setState({ units: [], config: {}, invoices: [], loading: false, loaded: false });
}
