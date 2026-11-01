// Giả lập Apps Script (không chạm Google Sheets thật) + cấu hình kết nối giả cho trang.
const API_URL = 'https://script.google.com/macros/s/E2E_TEST/exec';

/** Kỳ mặc định của app = tháng trước (khớp state.js) */
export function defaultPeriod(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Dựng trang với Sheet giả. Trả về { calls } để kiểm tra action nào đã được gọi.
 * Dữ liệu: 3 căn; TD475 có nước kỳ mặc định (chưa thông báo); TD473 có nước (đã thông báo).
 */
export async function openApp(page, hash = '#thong-ke') {
  const period = defaultPeriod();
  const db = {
    units: [
      { name: 'TD475', elec_suffix: 'TD475', water_suffix: 'TD475', sort: 1 },
      { name: 'TD473', elec_suffix: 'TD473', water_suffix: 'TD473', sort: 2 },
      { name: 'PB08', elec_suffix: 'PB08', water_suffix: 'PB08', sort: 3 },
    ],
    config: { bank_name: 'TEST' },
    invoices: [
      { key: `${period}|TD475|water`, period, unit: 'TD475', type: 'water', consumption: 22, unit_label: 'm³', amount: 172557, notified_at: '' },
      { key: `${period}|TD473|water`, period, unit: 'TD473', type: 'water', consumption: 8, unit_label: 'm³', amount: 66400, notified_at: '2026-01-01T00:00:00' },
    ],
  };
  const calls = [];
  await page.route(API_URL, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body.action);
    let data = { ok: true };
    if (body.action === 'getAll') data = { ok: true, units: db.units, config: db.config, invoices: db.invoices };
    if (body.action === 'deleteInvoice') db.invoices = db.invoices.filter((i) => i.key !== body.key);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.addInitScript(([url]) => {
    localStorage.setItem('hd_api_url', url);
    localStorage.setItem('hd_api_token', 'e2e-token');
  }, [API_URL]);
  await page.goto(`/index.html${hash}`);
  return { calls, period, db };
}
