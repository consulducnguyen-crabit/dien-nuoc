// Test parser/matcher/format. Chạy: `node --test`
// Dữ liệu mẫu chỉ gồm 2 tin ở plan.md mục 6.7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, parseVnNumber, parseMessages } from '../js/parser.js';
import { matchUnit } from '../js/matcher.js';
import { formatMoney, formatDate, formatPeriod, formatNumber, invoiceKey, transferContent } from '../js/format.js';

const ELEC = 'EMBHY TB: Tu 1/9/2026 - 30/9/2026, Ma KH M688OP3PB08 su dung 1.566kWh, chi so cuoi ky 13.451, so tien 5.517.569VND. KH chuyen khoan TT truoc ngay 10/10/2026 toi STK: M688OP3PB08, NH Techcombank va tra cuu hoa don tai web: emb.vn. Chi tiet LH: 0925266996. Tran trong!';
const WATER = `• Mã khách hàng / Danh bạ: PB08 (Mã lộ trình: PB-08)
• Chỉ số đầu kỳ: 380
• Chỉ số cuối kỳ: 460
• Tổng sản lượng tiêu thụ: 80 m³
• Tổng số tiền phải thanh toán: 627.480 VNĐ`;

const UNITS = [
  { name: 'TD475', elecSuffix: 'TD475', waterSuffix: 'TD475' },
  { name: 'TD473', elecSuffix: 'TD473', waterSuffix: 'TD473' },
  { name: 'PB08', elecSuffix: 'PB08', waterSuffix: 'PB08' },
];

test('parseVnNumber', () => {
  assert.equal(parseVnNumber('1.566'), 1566);
  assert.equal(parseVnNumber('5.517.569VND.'), 5517569);
  assert.equal(parseVnNumber('13.451,'), 13451);
  assert.equal(parseVnNumber('12,5'), 12.5);
  assert.equal(parseVnNumber('abc'), null);
});

test('normalize bỏ dấu, đ, ³, gộp khoảng trắng', () => {
  assert.equal(normalize('  Tổng  sản lượng  Đ 80 m³ '), 'tong san luong d 80 m3');
});

test('tin điện mẫu', () => {
  const { invoices, errors } = parseMessages(ELEC);
  assert.equal(errors.length, 0);
  assert.equal(invoices.length, 1);
  const i = invoices[0];
  assert.equal(i.type, 'elec');
  assert.equal(i.customerCode, 'M688OP3PB08');
  assert.equal(i.periodFrom, '2026-09-01');
  assert.equal(i.periodTo, '2026-09-30');
  assert.equal(i.period, '2026-09');
  assert.equal(i.consumption, 1566);
  assert.equal(i.unitLabel, 'kWh');
  assert.equal(i.indexEnd, 13451);
  assert.equal(i.amount, 5517569);
  assert.equal(i.dueDate, '2026-10-10');
  assert.equal(i.rawMessage, ELEC);
  assert.equal(matchUnit(i.customerCode, 'elec', UNITS).name, 'PB08');
});

test('tin nước mẫu', () => {
  const { invoices, errors } = parseMessages(WATER);
  assert.equal(errors.length, 0);
  assert.equal(invoices.length, 1);
  const i = invoices[0];
  assert.equal(i.type, 'water');
  assert.equal(i.customerCode, 'PB08');
  assert.equal(i.period, null);
  assert.equal(i.indexStart, 380);
  assert.equal(i.indexEnd, 460);
  assert.equal(i.consumption, 80);
  assert.equal(i.unitLabel, 'm³');
  assert.equal(i.amount, 627480);
  assert.equal(i.dueDate, null);
  assert.equal(matchUnit(i.customerCode, 'water', UNITS).name, 'PB08');
});

for (const [label, sep] of [['cách nhau dòng trống', '\n\n'], ['dính liền', '\n']]) {
  test(`dán cả hai tin (${label}) -> đúng 2 hoá đơn, tổng 6.145.049 ₫`, () => {
    for (const text of [ELEC + sep + WATER, WATER + sep + ELEC]) {
      const { invoices, errors } = parseMessages(text);
      assert.equal(errors.length, 0);
      assert.deepEqual(invoices.map((x) => x.type).sort(), ['elec', 'water']);
      const total = invoices.reduce((s, x) => s + x.amount, 0);
      assert.equal(total, 6145049);
      assert.equal(formatMoney(total), '6.145.049 ₫');
      // rawMessage mỗi tin không lẫn tin kia
      assert.ok(!invoices.find((x) => x.type === 'elec').rawMessage.includes('Chỉ số đầu kỳ'));
      assert.ok(!invoices.find((x) => x.type === 'water').rawMessage.includes('EMBHY'));
    }
  });
}

test('văn bản lạ / rỗng', () => {
  const r = parseMessages('Xin chào, hôm nay trời đẹp');
  assert.deepEqual(r.invoices, []);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].reason, 'unrecognized');
  assert.equal(r.errors[0].snippet, 'Xin chào, hôm nay trời đẹp');
  assert.deepEqual(parseMessages('   '), { invoices: [], errors: [] });
});

test('marker nhưng không phân loại được -> unrecognized', () => {
  const r = parseMessages('EMBHY TB: thong bao bao tri he thong');
  assert.equal(r.invoices.length, 0);
  assert.equal(r.errors[0].reason, 'unrecognized');
});

test('thiếu trường bắt buộc -> missing_field, không ghi nhận', () => {
  const r = parseMessages(ELEC.replace('so tien 5.517.569VND', 'so tien'));
  assert.equal(r.invoices.length, 0);
  assert.equal(r.errors[0].reason, 'missing_field');
  assert.equal(r.errors[0].field, 'amount');
  assert.ok(r.errors[0].snippet.startsWith('EMBHY'));
});

test('có dấu / không dấu cho kết quả giống nhau; bỏ qua • và -', () => {
  const noAccent = `Ma khach hang / Danh ba: PB08 (Ma lo trinh: PB-08)
Chi so dau ky: 380
Chi so cuoi ky: 460
Tong san luong tieu thu: 80 m3
Tong so tien phai thanh toan: 627.480 VND`;
  const dashed = WATER.replaceAll('•', '-');
  const strip = (r) => r.invoices.map(({ rawMessage, ...rest }) => rest);
  const a = strip(parseMessages(WATER));
  assert.deepEqual(strip(parseMessages(noAccent)), a);
  assert.deepEqual(strip(parseMessages(dashed)), a);
  assert.deepEqual(strip(parseMessages(WATER.replaceAll('•', ''))), a);
});

test('dán lại cùng tin -> khoá upsert trùng', () => {
  const keyOf = (text) => {
    const [inv] = parseMessages(text).invoices;
    const unit = matchUnit(inv.customerCode, inv.type, UNITS).name;
    return invoiceKey(inv.period ?? '2026-09', unit, inv.type);
  };
  assert.equal(keyOf(ELEC), '2026-09|PB08|elec');
  assert.equal(keyOf(ELEC), keyOf(ELEC));
  assert.equal(keyOf(WATER), '2026-09|PB08|water');
  assert.equal(keyOf(WATER), keyOf(WATER));
  assert.notEqual(keyOf(ELEC), keyOf(WATER));
});

test('matcher: suffix dài nhất, bỏ "-", không phân biệt hoa thường', () => {
  const units = [
    { name: 'A', elecSuffix: '8', waterSuffix: 'pb-08' },
    { name: 'PB08', elecSuffix: 'PB08', waterSuffix: 'PB08' },
  ];
  assert.equal(matchUnit('m688op3pb08', 'elec', units).name, 'PB08');
  assert.equal(matchUnit('PB-08', 'water', units).name, 'A');
  assert.equal(matchUnit('XYZ', 'elec', units), null);
  assert.equal(matchUnit('', 'elec', units), null);
  // elecSuffix và waterSuffix độc lập
  assert.equal(matchUnit('xx8', 'water', units), null);
});

test('kỳ điện chấp nhận en dash / em dash', () => {
  for (const dash of ['–', '—']) {
    const { invoices, errors } = parseMessages(ELEC.replace('1/9/2026 - 30/9/2026', `1/9/2026 ${dash} 30/9/2026`));
    assert.equal(errors.length, 0);
    assert.equal(invoices[0].periodFrom, '2026-09-01');
    assert.equal(invoices[0].period, '2026-09');
  }
});

test('ranh giới tin: rawMessage điện không dính "•", tin nước giữ "• " đầu dòng', () => {
  const { invoices } = parseMessages(`${ELEC}\n\n${WATER}`);
  const elec = invoices.find((x) => x.type === 'elec');
  const water = invoices.find((x) => x.type === 'water');
  assert.ok(!elec.rawMessage.includes('•'));
  assert.ok(elec.rawMessage.endsWith('Tran trong!'));
  assert.ok(water.rawMessage.startsWith('• Mã khách hàng'));
});

test('tiêu đề đứng trước tin nước được gộp vào tin, không báo lỗi giả', () => {
  const { invoices, errors } = parseMessages(`Hoá đơn nước tháng 9\n${WATER}`);
  assert.equal(errors.length, 0);
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].type, 'water');
  assert.equal(invoices[0].amount, 627480);
  assert.ok(invoices[0].rawMessage.startsWith('Hoá đơn nước tháng 9'));
});

test('formatNumber thủ công: nghìn, thập phân, âm, không hợp lệ', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(1234567), '1.234.567');
  assert.equal(formatNumber(12.5), '12,5');
  assert.equal(formatNumber(-1234), '-1.234');
  assert.equal(formatNumber('abc'), '0');
});

test('format', () => {
  assert.equal(formatMoney(5517569), '5.517.569 ₫');
  assert.equal(formatNumber(1566), '1.566');
  assert.equal(formatDate('2026-10-10'), '10/10/2026');
  assert.equal(formatDate('2026-09-01'), '1/9/2026');
  assert.equal(formatPeriod('2026-09'), 'Tháng 9/2026');
  assert.equal(invoiceKey('2026-09', 'pb08', 'elec'), '2026-09|PB08|elec');
  assert.equal(transferContent('{căn} T{tháng}/{năm}', 'pb08', '2026-09'), 'PB08 T9/2026');
});
