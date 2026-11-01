# plan.md: Ứng dụng quản lý hoá đơn điện, nước cho khách thuê

> Dành cho Claude Code (VS Code). Hãy **đọc toàn bộ file này trước**, rồi làm tuần tự theo từng Phase ở mục 12. **Dừng lại cuối mỗi Phase**, tóm tắt những gì đã làm và chờ tôi duyệt rồi mới sang Phase tiếp.

## 1. Mục tiêu

Chủ nhà có 3 căn cho thuê: **TD475, TD473, PB08**. Mỗi tháng nhận tin nhắn hoá đơn từ 2 nhà cung cấp khác nhau (điện, nước). Ứng dụng cho phép:

1. Dán nội dung tin nhắn vào một ô, app tự phân tích và ghi nhận hoá đơn vào đúng căn.
2. Thống kê hoá đơn điện, nước theo từng căn và theo tháng.
3. Tạo **ảnh thông báo đóng tiền** (PNG) cho từng căn, kèm thông tin ngân hàng và mã QR để gửi khách thuê.
4. Cấu hình tên căn (để so khớp tin nhắn) và tài khoản ngân hàng nhận tiền.

**Tình huống quan trọng:** điện và nước đến từ 2 nhà cung cấp nên không phải tháng nào cũng có đủ cả hai tại cùng một thời điểm. App phải ghi nhận từng loại độc lập, bổ sung loại còn thiếu ở lần dán sau, và tạo thông báo theo dữ liệu hiện có.

## 2. Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Frontend | Web tĩnh (HTML + CSS + JavaScript ES modules), **không cần build step**, deploy trên **GitHub Pages** |
| Database | **Google Sheets**, truy cập qua **Google Apps Script Web App** (do ta viết, nằm trong thư mục `apps-script/`) |
| Ảnh thông báo | Tạo ngay trên trình duyệt (DOM → PNG), không cần server |
| Hạn đóng tiền khi chỉ có tin nước | Tin nước không có hạn, để ô **trống cho chủ nhà tự chọn ngày** trước khi xuất ảnh |
| Nội dung chuyển khoản mẫu | `{căn} T{tháng}/{năm}`, ví dụ `PB08 T9/2026`; cấu hình được |
| Thông tin ngân hàng | Chủ nhà nhập trong trang cấu hình (tên ngân hàng, chủ tài khoản, số tài khoản, ảnh QR tự upload) |
| Ngôn ngữ giao diện | Tiếng Việt |

## 3. Ràng buộc và bảo mật (bắt buộc tuân thủ)

- Repo GitHub có thể **public**. **Không** commit dữ liệu hoá đơn thật, số tài khoản, URL Apps Script, token, ảnh QR. Dữ liệu mẫu trong test chỉ dùng 2 tin nhắn ở mục 6.4.
- URL Apps Script và token truy cập do chủ nhà nhập ở trang Cấu hình lần đầu, lưu trong `localStorage` của trình duyệt (khoá `hd_api_url`, `hd_api_token`). Không hard-code.
- Apps Script kiểm tra token (lưu ở **Script Properties** tên `API_TOKEN`) cho mọi request; sai token trả lỗi `unauthorized`.
- Không dùng thư viện phía server nào khác ngoài Apps Script.
- Thư viện bên ngoài chỉ gồm `html-to-image` (xuất PNG), nạp từ `https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js` (ghim đúng phiên bản). Mọi thứ khác viết thuần JS (biểu đồ nếu có dùng SVG tự vẽ).
- Font nạp từ Google Fonts (xem mục 4).
- Mã nguồn UI phải truy cập được bằng bàn phím: dùng `<button>`, `<a>`, `<label>` + `<input>` thật; icon-only button có `aria-label`; tương phản chữ tối thiểu 4.5:1.

## 4. Giao diện (theo ảnh tham chiếu "Payment Dashboard")

Phong cách: **sạch, hiện đại, nền xanh periwinkle dịu, thẻ trắng bo góc lớn, đổ bóng mềm, nút bo tròn dạng viên thuốc**, sidebar trắng bên trái, một thẻ nhấn màu xanh navy đậm.

### 4.1 Design tokens (đặt trong `css/tokens.css`)

```css
:root {
  /* nền tổng thể: gradient xanh periwinkle, đậm ở góc trên trái, tím nhạt ở góc dưới phải */
  --bg-from: #5B7BEF;
  --bg-to:   #8E86E6;
  --surface:  #F4F6FF;   /* khung nội dung chính (container lớn bo góc) */
  --card:     #FFFFFF;   /* thẻ */
  --ink:      #1B2150;   /* chữ tiêu đề, navy tối */
  --ink-2:    #5A6285;   /* chữ phụ (đảm bảo >= 4.5:1 trên trắng) */
  --muted:    #8A93B2;   /* chỉ dùng cho icon/nhãn lớn, không dùng cho chữ nhỏ quan trọng */
  --primary:  #4F66E0;   /* nút chính, link, mục sidebar đang chọn */
  --primary-600: #3F54C8;/* hover */
  --primary-50:  #E8ECFE;/* nền chip/nút phụ */
  --navy:     #0E2A7B;   /* thẻ nhấn đậm (tổng tiền) */
  --navy-2:   #1B3FA8;
  --electric: #B26A00;   /* chữ nhãn Điện */
  --electric-bg: #FFF1D6;
  --water:    #1E55C8;   /* chữ nhãn Nước */
  --water-bg: #E3EDFF;
  --ok:       #12805C;   --ok-bg:  #DDF6EA;
  --danger:   #C23A3F;   --danger-bg: #FFE6E7;
  --radius-card: 20px;
  --radius-shell: 28px;
  --radius-pill: 999px;
  --shadow-card: 0 8px 24px rgba(79,102,224,.10);
  --shadow-lift: 0 14px 32px rgba(79,102,224,.18);
  --ease: cubic-bezier(.2,.7,.2,1);
}
```

### 4.2 Font

- **Plus Jakarta Sans** (hỗ trợ tiếng Việt), trọng lượng 400/500/600/700/800. Link Google Fonts có `&subset=vietnamese` hoặc dùng `css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap`.
- Fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.
- Cỡ chữ: tiêu đề trang 28px/700; tiêu đề thẻ 16px/700; số liệu lớn 28–32px/800; nhãn phụ 12–13px/500; nội dung 14px/400.
- Số tiền dùng `font-variant-numeric: tabular-nums`.

### 4.3 Bố cục tổng thể

- `body`: nền gradient `linear-gradient(135deg, var(--bg-from), var(--bg-to))`, kèm các **vòng tròn đồng tâm mờ** ở nền (radial rings, opacity thấp, làm bằng SVG hoặc `radial-gradient` lặp) giống ảnh tham chiếu.
- **Shell**: một khung lớn nền `--surface`, `border-radius: var(--radius-shell)`, `max-width: 1280px`, căn giữa, `margin: 32px auto`, bên trong gồm **Sidebar** (240px) + **Main**.
- **Sidebar** (nền trắng): logo chữ "Hoá đơn **Nhà**" ở trên; menu dọc gồm 4 mục: *Nhập tin nhắn*, *Thống kê*, *Thông báo*, *Cấu hình*. Mục đang chọn: chữ `--ink` đậm, icon `--primary`, thanh dọc 4px màu `--primary` ở mép trái; mục khác chữ `--ink-2`. Cuối sidebar có thẻ gradient nhỏ (giống thẻ "Get a Premium Account") hiển thị trạng thái kết nối Google Sheets ("Đã kết nối" / "Chưa kết nối") và nút "Cấu hình".
- **Main**: hàng đầu có tiêu đề trang (lời chào nhỏ phía trên + tiêu đề lớn bên dưới, ví dụ "Quản lý hoá đơn" / "Nhập tin nhắn"), bên phải là **bộ chọn Kỳ** (thay cho ô search, dạng pill trắng, icon lịch) và nút chuông tuỳ chọn (cảnh báo căn chưa khớp).
- **Mobile (<900px)**: sidebar ẩn, thay bằng thanh điều hướng cố định ở đáy (4 icon + nhãn), shell bỏ bo góc và margin; thẻ xếp 1 cột.

### 4.4 Thành phần

- **Thẻ (card)**: nền trắng, `--radius-card`, padding 20–24px, `--shadow-card`. Không viền.
- **Nút chính**: nền `--primary`, chữ trắng 600, pill, cao 44px, padding ngang 24px; hover: `--primary-600` + `translateY(-1px)` + `--shadow-lift`; active: `translateY(0)`; focus-visible: viền ngoài 3px `rgba(79,102,224,.35)`.
- **Nút phụ**: nền `--primary-50`, chữ `--primary-600`, pill. **Nút nguy hiểm** (Xoá): chữ `--danger`, nền `--danger-bg`.
- **Input/select/textarea**: nền trắng, viền 1px `#D9DEF2`, bo 12px, cao 44px; focus: viền `--primary` + vòng mờ 3px. Textarea dán tin nhắn dùng font mono nhỏ nền `#FAFBFF`.
- **Chip trạng thái**: pill nhỏ. Điện (`--electric` trên `--electric-bg`), Nước (`--water` trên `--water-bg`), Đủ (`--ok`), Thiếu/Lỗi (`--danger`), Chưa có (xám nhạt).
- **Thẻ nhấn navy**: gradient `--navy` → `--navy-2`, chữ trắng, dùng cho "Tổng cần đóng" ở Thống kê và Thông báo; có thể kèm vòng tròn tiến độ (donut) thể hiện số căn đã đủ điện + nước (ví dụ 1/3).
- **Bảng**: header chữ `--ink-2` 12px 600, dòng cách nhau bằng đường kẻ `#EEF0FA`, hover dòng nền `#F7F8FF`; bọc trong khung `overflow-x:auto`.
- **Toast** (góc trên phải): thông báo thành công/lỗi, tự ẩn sau 4s.

### 4.5 Hiệu ứng

- Chuyển trang: các thẻ **fade-up** (opacity 0→1, translateY 12px→0, 360ms `--ease`), xuất hiện lần lượt cách nhau 60ms.
- Hover thẻ: nâng `translateY(-2px)` + `--shadow-lift`, transition 200ms.
- Số liệu lớn **đếm tăng** (count-up 600ms) khi hiện lần đầu.
- Mục sidebar: nền chuyển mượt 150ms; thanh chỉ báo trượt.
- Nút "Phân tích": khi đang xử lý hiện spinner nhỏ; khi xong, các thẻ kết quả hiện lần lượt.
- Tôn trọng `@media (prefers-reduced-motion: reduce)`: tắt toàn bộ animation trên.

## 5. Cấu trúc thư mục

```
/
├── index.html
├── plan.md
├── README.md                 # hướng dẫn cài đặt + deploy (viết ở Phase 6)
├── css/
│   ├── tokens.css
│   ├── base.css              # reset, typography, layout shell
│   └── components.css        # card, button, chip, table, toast, ...
├── js/
│   ├── main.js               # khởi tạo, router theo hash (#nhap, #thong-ke, #thong-bao, #cau-hinh)
│   ├── state.js              # state tập trung + pub/sub đơn giản
│   ├── parser.js             # phân tích tin nhắn (thuần, không phụ thuộc DOM)
│   ├── matcher.js            # khớp mã khách hàng → căn
│   ├── format.js             # định dạng tiền, ngày, số
│   ├── api.js                # gọi Apps Script
│   ├── notice.js             # dựng DOM ảnh thông báo + xuất PNG
│   └── pages/
│       ├── input.js
│       ├── stats.js
│       ├── notice-page.js
│       └── settings.js
├── tests/
│   └── parser.test.js        # chạy bằng `node --test`
├── apps-script/
│   ├── Code.gs
│   └── appsscript.json
└── .gitignore
```

Điều hướng dùng hash (`#thong-ke`...) để chạy được trên GitHub Pages mà không cần cấu hình rewrite.

## 6. Phân tích tin nhắn (`js/parser.js`)

### 6.1 Chuẩn hoá trước khi so khớp

Tạo hàm `normalize(text)`: chuyển chữ thường, bỏ dấu tiếng Việt (NFD + xoá dấu kết hợp, đổi `đ`→`d`), đổi `³`→`3`, gộp khoảng trắng. Dùng bản đã chuẩn hoá để tìm bằng regex, nhưng luôn **lưu lại tin nhắn gốc** (`raw_message`).

### 6.2 Tách tin nhắn

Người dùng có thể dán một hoặc nhiều tin liên tiếp. Tách văn bản thành các đoạn tại mỗi lần xuất hiện của một trong hai dấu hiệu bắt đầu (trên bản chuẩn hoá): `embhy` (tin điện) hoặc `ma khach hang` (tin nước). Phân loại từng đoạn:

- Chứa `ma kh` và `kwh` → **điện** (`elec`).
- Chứa `chi so dau ky` và `m3` → **nước** (`water`).
- Không phân loại được → trả về mục lỗi `unrecognized` kèm đoạn gốc để hiển thị cho người dùng.

### 6.3 Trích xuất trường

**Điện** (trên bản chuẩn hoá):

| Trường | Regex gợi ý | Ví dụ |
|---|---|---|
| Kỳ từ - đến | `tu\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})` | 1/9/2026 – 30/9/2026 |
| Mã KH | `ma\s*kh\s+([a-z0-9]+)` | M688OP3PB08 |
| Điện tiêu thụ (kWh) | `su dung\s+([\d.,]+)\s*kwh` | 1.566 → 1566 |
| Chỉ số cuối kỳ | `chi so cuoi ky\s+([\d.,]+)` | 13.451 → 13451 |
| Số tiền | `so tien\s+([\d.,]+)\s*vnd` | 5.517.569 → 5517569 |
| Hạn chuyển khoản | `truoc ngay\s+(\d{1,2})\/(\d{1,2})\/(\d{4})` | 10/10/2026 |

**Nước** (nhãn có dấu `:` hoặc không):

| Trường | Regex gợi ý (trên bản chuẩn hoá) |
|---|---|
| Mã KH / danh bạ | `(?:ma khach hang\s*\/?\s*danh ba|danh ba)\s*:?\s*([a-z0-9-]+)` |
| Chỉ số đầu kỳ | `chi so dau ky\s*:?\s*([\d.,]+)` |
| Chỉ số cuối kỳ | `chi so cuoi ky\s*:?\s*([\d.,]+)` |
| Sản lượng (m³) | `tong san luong tieu thu\s*:?\s*([\d.,]+)\s*m3` |
| Số tiền | `tong so tien phai thanh toan\s*:?\s*([\d.,]+)\s*(?:vnd|vnđ|d)?` |

Quy tắc số: ở tin nhắn của hai nhà cung cấp này, dấu `.` là **dấu phân cách hàng nghìn** (1.566 kWh = 1566; 5.517.569 = 5517569). Viết hàm `parseVnNumber(str)`: bỏ ký tự đuôi không phải số (dấu `,` `.` ở cuối câu), bỏ mọi dấu `.`, nếu còn dấu `,` thì coi là dấu thập phân.

### 6.4 Kỳ (tháng) ghi nhận

- Điện: `period = YYYY-MM` của **ngày kết thúc** kỳ (30/9/2026 → `2026-09`).
- Nước: tin không ghi kỳ, dùng **kỳ đang chọn** ở bộ chọn Kỳ (mặc định tháng trước của tháng hiện tại; sau khi Lưu tự chuyển sang kỳ vừa lưu; người dùng đổi được trước khi bấm Lưu).
- Nếu tin điện có kỳ khác kỳ đang chọn, ưu tiên kỳ lấy từ tin và hiển thị cảnh báo nhỏ.

### 6.5 Kết quả trả về

```js
{
  invoices: [
    { type: 'elec', customerCode: 'M688OP3PB08', periodFrom: '2026-09-01', periodTo: '2026-09-30',
      period: '2026-09', consumption: 1566, unitLabel: 'kWh', indexEnd: 13451,
      amount: 5517569, dueDate: '2026-10-10', rawMessage: '...' },
    { type: 'water', customerCode: 'PB08', period: null, indexStart: 380, indexEnd: 460,
      consumption: 80, unitLabel: 'm³', amount: 627480, dueDate: null, rawMessage: '...' }
  ],
  errors: [ { reason: 'unrecognized' | 'missing_field', field?: 'amount', snippet: '...' } ]
}
```

Thiếu trường bắt buộc (mã KH, số tiền, tiêu thụ) → đưa vào `errors`, **không** ghi nhận; cho người dùng xem và sửa tay.

### 6.6 Khớp căn (`js/matcher.js`)

- Danh sách căn lấy từ cấu hình: mỗi căn có `name`, `elecSuffix`, `waterSuffix`.
- Khớp **mã KH kết thúc bằng** suffix (không phân biệt hoa thường, bỏ ký tự `-`). Nếu nhiều căn cùng khớp, chọn suffix **dài nhất**.
- Tin điện dùng `elecSuffix`, tin nước dùng `waterSuffix`. Ví dụ: `M688OP3PB08` → `PB08`; nước `PB08` → `PB08`.
- Không khớp căn nào: hiển thị thẻ cảnh báo "Chưa khớp căn" kèm dropdown cho người dùng chọn căn thủ công trước khi lưu.

### 6.7 Test bắt buộc (`tests/parser.test.js`, dùng `node:test` + `node:assert`)

Dùng đúng 2 tin nhắn mẫu sau:

```
EMBHY TB: Tu 1/9/2026 - 30/9/2026, Ma KH M688OP3PB08 su dung 1.566kWh, chi so cuoi ky 13.451, so tien 5.517.569VND. KH chuyen khoan TT truoc ngay 10/10/2026 toi STK: M688OP3PB08, NH Techcombank va tra cuu hoa don tai web: emb.vn. Chi tiet LH: 0925266996. Tran trong!
```

```
• Mã khách hàng / Danh bạ: PB08 (Mã lộ trình: PB-08)
• Chỉ số đầu kỳ: 380
• Chỉ số cuối kỳ: 460
• Tổng sản lượng tiêu thụ: 80 m³
• Tổng số tiền phải thanh toán: 627.480 VNĐ
```

Kỳ vọng:

- Tin điện: `customerCode = 'M688OP3PB08'`, `consumption = 1566`, `indexEnd = 13451`, `amount = 5517569`, `period = '2026-09'`, `dueDate = '2026-10-10'`, khớp căn `PB08`.
- Tin nước: `customerCode = 'PB08'`, `indexStart = 380`, `indexEnd = 460`, `consumption = 80`, `amount = 627480`, khớp căn `PB08`.
- Dán cả hai cùng lúc (cách nhau bằng dòng trống hoặc không) → đúng 2 hoá đơn.
- Chỉ dán tin điện → 1 hoá đơn, không lỗi. Chỉ dán tin nước → 1 hoá đơn, không lỗi.
- Dán văn bản không liên quan → `invoices = []`, 1 lỗi `unrecognized`.
- Tin không dấu và tin có dấu cho kết quả giống nhau; các dấu `•`, `-` đầu dòng không ảnh hưởng.
- Dán lại cùng một tin → khoá upsert trùng (xem mục 7).
- Thêm test cho `parseVnNumber`: `'1.566' → 1566`, `'5.517.569VND.'` đã được regex cắt đúng, `'13.451,' → 13451`.

## 7. Google Sheets và Apps Script

### 7.1 Cấu trúc Sheet (tự tạo khi chạy `setup`)

**`Units`**: `unit_id` | `name` | `elec_suffix` | `water_suffix` | `sort`

**`Invoices`**: `key` | `period` | `unit` | `type` | `customer_code` | `period_from` | `period_to` | `index_start` | `index_end` | `consumption` | `unit_label` | `amount` | `due_date` | `raw_message` | `created_at` | `updated_at`

- `key = period|unit|type` (ví dụ `2026-09|PB08|elec`). Mỗi (kỳ, căn, loại) chỉ có **một** dòng: ghi lại thì **upsert** (cập nhật dòng cũ, giữ `created_at`, đổi `updated_at`).

**`Config`**: `key` | `value`, gồm: `bank_name`, `bank_holder`, `bank_account`, `transfer_template` (mặc định `{căn} T{tháng}/{năm}`), `qr_parts` (số mảnh), `qr_part_0`, `qr_part_1`, ...

### 7.2 Lưu ảnh QR

Một ô Google Sheets chứa tối đa 50.000 ký tự. Vì vậy:

1. Phía trình duyệt: nhận file ảnh, **thu nhỏ bằng canvas** tối đa 320×320, xuất `image/webp` (hoặc `image/jpeg` nếu không hỗ trợ) chất lượng ~0.85 thành data URL.
2. Cắt chuỗi data URL thành các mảnh ≤ 40.000 ký tự, gửi lên và lưu vào `qr_part_0..n`; ghi `qr_parts = n+1`. Khi đọc thì ghép lại.
3. Từ chối file gốc > 2 MB, báo lỗi rõ ràng bằng tiếng Việt.

### 7.3 API (`apps-script/Code.gs`)

Triển khai **Web app**: *Execute as: Me*, *Who has access: Anyone*. Mọi request đều phải kèm `token` khớp `API_TOKEN` trong Script Properties.

- Client gọi bằng `fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({...}) })`. Dùng `text/plain` để tránh preflight CORS. Phản hồi luôn là JSON qua `ContentService`.
- Các action (trường `action` trong body):

| action | Mô tả |
|---|---|
| `ping` | Kiểm tra kết nối + token |
| `getAll` | Trả về `{ units, config, invoices }` (invoices có thể lọc theo `period`) |
| `saveInvoices` | Nhận mảng hoá đơn, upsert theo `key`, trả về số dòng thêm/cập nhật |
| `saveUnits` | Ghi đè danh sách căn |
| `saveConfig` | Ghi cặp key/value vào `Config` (kể cả `qr_part_*`) |
| `deleteInvoice` | Xoá một dòng theo `key` |
| `setup` | Tạo sheet và tiêu đề cột nếu chưa có, seed 3 căn mặc định (TD475, TD473, PB08) |

- Dùng `LockService.getScriptLock()` khi ghi để tránh xung đột.
- Lỗi trả `{ ok:false, error:'<mã lỗi>' }` với các mã: `unauthorized`, `bad_request`, `server_error`.
- Hướng dẫn cài đặt Apps Script ghi trong README (Phase 6): tạo Google Sheet → Tiện ích mở rộng → Apps Script → dán `Code.gs` → đặt Script Property `API_TOKEN` → chạy `setup` → Deploy Web app → copy URL.

### 7.4 Phía client (`js/api.js`)

- Hàm `call(action, payload)` đọc URL/token từ `localStorage`; timeout 20s; báo lỗi thân thiện (mất mạng, sai token, chưa cấu hình).
- Tải dữ liệu khi mở app và sau mỗi lần lưu; hiển thị skeleton/shimmer trong lúc tải.

## 8. Các màn hình

Giữ đúng cấu trúc đã duyệt trong mockup, áp dụng giao diện mục 4.

### 8.1 Nhập tin nhắn (`#nhap`)

- Thẻ trái: textarea dán tin nhắn + nút **Phân tích tin nhắn** (chính) + **Xoá nội dung** (phụ).
- Cột phải: **kết quả nhận diện**: mỗi hoá đơn là một thẻ (chip Điện/Nước, chip "Khớp căn X" hoặc cảnh báo + dropdown chọn căn), liệt kê các trường đã đọc; có dòng ghi chú: "Chỉ dán 1 loại tin vẫn lưu được; loại còn lại bổ sung ở lần dán sau."
- Thẻ cuối: tổng cộng theo căn đang hiển thị + nút **Lưu vào Google Sheets**. Lưu thành công → toast, xoá vùng kết quả, giữ nguyên kỳ.
- Nếu hoá đơn cùng (kỳ, căn, loại) đã tồn tại: hiện xác nhận "Đã có hoá đơn này, ghi đè?" trước khi upsert.
- Lỗi phân tích (`errors`): thẻ đỏ nhạt hiển thị đoạn gốc và lý do.

### 8.2 Thống kê (`#thong-ke`)

- Chú thích trạng thái: *Đủ điện + nước*, *Chỉ có điện*, *Chỉ có nước*, *Chưa có tin nhắn*.
- Mỗi căn một thẻ: chip trạng thái, khối Điện và khối Nước (nếu có), tổng; nút **Tạo thông báo** (chuyển sang `#thong-bao` với căn đã chọn). Căn chưa có dữ liệu: thẻ viền nét đứt, nút "Dán tin nhắn".
- Thẻ navy "Tổng cần đóng tháng này" (tổng mọi căn) + donut số căn đã đủ điện + nước.
- Bảng tổng hợp theo tháng: Căn, Điện (kWh), Tiền điện, Nước (m³), Tiền nước, Tổng, Hạn TT điện, Trạng thái. Căn thiếu loại nào hiển thị `—` ở loại đó. Nút **Xuất CSV** (tạo file tại client, BOM UTF-8 để Excel đọc đúng tiếng Việt).
- Bộ chọn Kỳ ở header đổi dữ liệu hiển thị.
- (Tuỳ chọn, chỉ làm khi tôi yêu cầu) biểu đồ đường tổng tiền theo tháng.

### 8.3 Thông báo (`#thong-bao`)

- Chọn **căn** và **kỳ**; xem trước ảnh thông báo; nút **Tải ảnh PNG**, **Sao chép ảnh**.
- Nội dung ảnh (rộng cố định 420px, xuất ở `pixelRatio: 2`):
  1. Dải tiêu đề gradient xanh: "THÔNG BÁO ĐÓNG TIỀN" / "Căn PB08 · Tháng 9/2026".
  2. Nếu có điện: khối **Tiền điện** (chip Điện): kỳ từ–đến, chỉ số cuối kỳ, tiêu thụ kWh, thành tiền.
  3. Nếu có nước: khối **Tiền nước** (chip Nước): chỉ số đầu → cuối, tiêu thụ m³, thành tiền.
  4. **Tổng cần đóng** (thẻ navy, số lớn) = cộng các khối đang có; kèm dòng **Hạn đóng**.
  5. Khối **Chuyển khoản tới**: tên ngân hàng, chủ tài khoản, số tài khoản, nội dung chuyển khoản (theo `transfer_template`), và **ảnh QR** bên phải.
- Quy tắc theo dữ liệu: đủ điện + nước → hiện cả hai; chỉ điện → chỉ khối điện; chỉ nước → chỉ khối nước; không có gì → báo "Chưa có hoá đơn kỳ này", vô hiệu hoá nút xuất.
- **Hạn đóng**: có điện → mặc định lấy hạn từ tin điện; chỉ có nước → ô chọn ngày bắt buộc (input date) trước khi xuất, chưa chọn thì nút xuất bị khoá và hiện gợi ý. Cho phép chủ nhà đổi hạn trong mọi trường hợp.
- Chưa cấu hình ngân hàng/QR: hiện cảnh báo vàng kèm link tới `#cau-hinh`; vẫn cho xuất nhưng khối ngân hàng hiển thị đúng phần đã có (không để chữ `[...]`).
- Xuất ảnh bằng `html-to-image` (`toPng`), nền trắng, đợi font tải xong (`document.fonts.ready`) trước khi chụp. Sao chép ảnh bằng `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`; nếu trình duyệt không hỗ trợ thì tự chuyển sang tải file. Tên file: `thong-bao_{căn}_{YYYY-MM}.png`.

### 8.4 Cấu hình (`#cau-hinh`)

- **Danh sách căn**: bảng sửa trực tiếp: Tên căn, Mã khớp điện, Mã khớp nước; thêm/xoá căn; **Lưu cấu hình**. Có ô **Thử khớp mã** (nhập mã KH, hiện căn khớp).
- **Tài khoản nhận chuyển khoản**: Tên ngân hàng, Chủ tài khoản, Số tài khoản, Nội dung chuyển khoản mẫu (hỗ trợ biến `{căn}`, `{tháng}`, `{năm}`), **Tải ảnh QR lên** (xem trước, nút xoá), **Lưu tài khoản**.
- **Kết nối Google Sheets**: ô URL Apps Script, ô token, nút **Kiểm tra kết nối** (gọi `ping`), chip trạng thái. Hai giá trị này chỉ lưu `localStorage`.
- Lần đầu mở app khi chưa có URL/token: chuyển thẳng tới `#cau-hinh` kèm hướng dẫn ngắn 3 bước.

## 9. Định dạng và quy ước

- Tiền: `new Intl.NumberFormat('vi-VN')` + ` ₫` (ví dụ `5.517.569 ₫`).
- Ngày hiển thị `d/m/yyyy`; lưu trong Sheet dạng `YYYY-MM-DD`; kỳ lưu `YYYY-MM`, hiển thị "Tháng 9/2026".
- Số kWh, m³ hiển thị với dấu chấm ngăn nghìn như tin nhắn gốc.
- Mã căn (`TD475`, `TD473`, `PB08`) luôn in hoa.
- Comment trong code bằng tiếng Việt, tên biến/hàm bằng tiếng Anh.
- Dùng typographic apostrophe/quotes đúng ngôn ngữ cho text hiển thị; không dùng emoji trong giao diện, dùng icon SVG inline.

## 10. Xử lý lỗi và trường hợp biên

- Mất mạng/Apps Script lỗi: toast lỗi, giữ nguyên nội dung đã dán, không mất dữ liệu người dùng vừa nhập.
- Dán trùng: upsert (mục 8.1).
- Tin điện của căn lạ (mã không khớp): vẫn parse, cho chọn căn thủ công hoặc nhắc thêm căn mới ở Cấu hình.
- Một căn có điện kỳ này nhưng nước chưa về: trạng thái "Chỉ có điện", thông báo chỉ gồm điện; khi dán tin nước sau đó, thông báo tự thành "đủ điện + nước".
- Số liệu bất thường (tiêu thụ = 0, số tiền = 0): cảnh báo, không chặn.
- Dung lượng QR sau khi nén quá lớn (> 200.000 ký tự): yêu cầu chọn ảnh nhỏ hơn.

## 11. Tiêu chí nghiệm thu

1. `node --test` pass toàn bộ test ở mục 6.7.
2. Dán 2 tin mẫu → thấy 2 hoá đơn khớp căn PB08, tổng `6.145.049 ₫`, lưu thành công vào Google Sheet, mở lại app vẫn thấy dữ liệu.
3. Chỉ dán tin điện (kỳ khác) rồi tháng sau bổ sung tin nước: dữ liệu ghép đúng vào cùng kỳ/căn, không tạo dòng trùng.
4. Thông báo hiển thị đúng 3 biến thể: đủ điện + nước; chỉ điện; chỉ nước (có bắt buộc chọn hạn đóng).
5. Xuất PNG đọc rõ chữ tiếng Việt có dấu, QR quét được; "Sao chép ảnh" dán được vào Zalo/Messenger hoặc tải về nếu trình duyệt không hỗ trợ.
6. Sai token hoặc chưa cấu hình: app báo lỗi dễ hiểu, không crash.
7. Giao diện đúng tokens/hiệu ứng mục 4, dùng được trên điện thoại (bố cục mobile mục 4.3), có `prefers-reduced-motion`.
8. Không có dữ liệu thật hoặc bí mật nào trong repo.

## 12. Lộ trình thực hiện (dừng và chờ tôi duyệt sau mỗi Phase)

- **Phase 0, khởi tạo:** tạo cấu trúc thư mục mục 5, `.gitignore`, `index.html` khung, nạp font, `tokens.css`, `base.css`. Chạy thử bằng `python3 -m http.server`.
- **Phase 1, parser + test:** viết `parser.js`, `matcher.js`, `format.js` và `tests/parser.test.js`; chạy `node --test` cho đến khi pass hết.
- **Phase 2, khung giao diện:** shell, sidebar, router hash, kỳ chọn, thành phần dùng chung (card, button, chip, table, toast), hiệu ứng mục 4.5, responsive. Các trang để dữ liệu mẫu cố định (chưa nối Sheet).
- **Phase 3, backend:** viết `Code.gs` + `appsscript.json`, `api.js`; hướng dẫn tôi triển khai và chạy `setup`; kiểm tra `ping`, `getAll`, `saveInvoices`.
- **Phase 4, nối dữ liệu thật:** hoàn thiện 4 trang theo mục 8, gồm trạng thái "thiếu loại", upsert và xác nhận ghi đè, xuất CSV, cấu hình căn.
- **Phase 5, ảnh thông báo + ngân hàng:** form ngân hàng, upload và nén QR (chia mảnh), `notice.js`, xuất/sao chép PNG, 3 biến thể.
- **Phase 6, deploy:** viết `README.md` (cài đặt Sheet + Apps Script, cách lấy URL/token, cách nhập ở Cấu hình, bật GitHub Pages bằng *Settings → Pages → Deploy from a branch → main / (root)*), kiểm tra bằng checklist mục 11.

## 13. Việc không làm trong phạm vi này

- Không có đăng nhập người dùng riêng, không gửi thông báo tự động qua Zalo/SMS/email.
- Không theo dõi trạng thái "đã thanh toán" (có thể thêm sau).
- Không lấy hoá đơn tự động từ nhà cung cấp; chỉ phân tích tin nhắn người dùng dán vào.
