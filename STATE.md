# STATE.md: trạng thái phiên làm việc

Cập nhật lần cuối: 2026-11-06. Commit gần nhất: `60374ee` (nhánh `main`, đã push lên `origin/main`).
Repo: https://github.com/consulducnguyen-crabit/dien-nuoc. Trang chạy trên GitHub Pages (main / root).

## 0. Chốt phiên (2026-11-06)

- Git: `main` khớp `origin/main` tại `60374ee` (đã push: nút cài ứng dụng PWA). Cây làm việc sạch, trừ thư mục `.playwright-mcp/` (ảnh chụp QA, không commit; có thể xoá hoặc thêm vào `.gitignore`).
- Test: `npm test` 60/60 pass; `npm run test:e2e` 22/22 pass. Không có việc dở dang, không có agent nào còn chạy.
- Việc làm đầu tiên ở phiên sau: thử PWA trên máy thật (iPhone: thêm vào MH chính, nút tải ảnh PNG/CSV ở chế độ app, mất cấu hình thì dùng ô dán liên kết cài nhanh; Android: hộp cài + icon). Nếu tải ảnh trên iOS hỏng thì làm Web Share API. Sau đó xem mục 4 (Apps Script cần dán lại và Deploy New version).
- Việc nhẹ còn mở từ review: chặn `beforeinstallprompt` thật của Edge trong test "có beforeinstallprompt"; thêm test tràn ngang cho `#thong-ke`; icon/tên "RentMaster" nên chốt trước khi cài trên iPhone (iOS không tự cập nhật).

## 1. Tổng quan

Ứng dụng web tĩnh quản lý hoá đơn điện, nước cho 3 căn (TD475, TD473, PB08). Đặc tả gốc ở [plan.md](plan.md), hướng dẫn cài đặt ở [README.md](README.md).
Dữ liệu nằm trong Google Sheets, truy cập qua Apps Script Web App ([apps-script/Code.gs](apps-script/Code.gs)). Không có dữ liệu thật hay bí mật trong repo.

## 2. Đã hoàn thành

- Phase 0 đến 6 của plan.md (khung, parser + test, giao diện, backend, nối dữ liệu, ảnh thông báo + QR, README).
- Nhập hoá đơn bằng 2 tab ở trang Nhập: dán tin nhắn (điện) và tải ảnh hoá đơn (nước, OCR qua Google Drive trong Apps Script). Thẻ kết quả từ ảnh cho sửa tay trước khi lưu.
- Liên kết cài nhanh cấu hình (`#cai-nhanh=...`) để nhập URL + token trên thiết bị khác.
- Thẻ "Hoá đơn kỳ ..." ở đầu trang Nhập: ma trận căn x Điện/Nước, xanh là đã có, đỏ là chưa có. Ô xanh có nút sao chép ảnh thông báo riêng từng loại, sau đó hiện "Đã thông báo" (lưu cột `notified_at` trong Sheet).
- Kỳ: ô Kỳ là kỳ của hoá đơn, mặc định là tháng trước, tự chuyển sang kỳ vừa lưu sau khi Lưu. Ảnh thông báo hiển thị đúng kỳ đó, hạn đóng mặc định là ngày 10 của tháng kế tiếp.
- Đồng bộ "Đã thông báo" giữa Nhập, Thống kê, Thông báo (từng loại điện/nước; logic chung ở js/notify-actions.js). Thống kê: mỗi khối Điện/Nước có trạng thái + nút sao chép. Thông báo: chọn Gộp/Chỉ điện/Chỉ nước, Tải PNG và Sao chép đều gắn cờ. state.notifiedRev báo router không dựng lại cả trang. Đã commit `f5055c8`; chưa kiểm tra trên trình duyệt thật.
- Giao diện (phiên gần nhất): ảnh thông báo có huy hiệu "Hạn đóng" vàng cam kèm tờ lịch (`dueBadge()` trong js/notice.js, mờ khi chưa chọn ngày); trang Thống kê bỏ dòng chú thích trạng thái và cột "Trạng thái" của bảng tổng hợp (CSV vẫn còn cột này); thêm `favicon.svg` hình căn nhà (chưa có apple-touch-icon PNG cho iOS). Commit `4c86f52`, `1836702`, `4ea2050`, `0d96fb3`.
- Cài như ứng dụng (PWA, chưa commit): `manifest.webmanifest` (tên dưới icon "RentMaster", standalone, start_url/scope `./`), icon PNG ở `icons/` + `apple-touch-icon.png` (sinh bằng `tools/gen-icons.mjs`), meta iOS/Android + `viewport-fit=cover` + safe-area CSS. Thẻ `#install-card` đầu trang Cấu hình (module `js/pwa-install.js`: nhận diện installed/prompt/ios/inapp/other, bắt `beforeinstallprompt` từ main.js). Ô `#cfg-quick-paste` để dán liên kết cài nhanh ngay trong app (vì app iOS ở màn hình chính có localStorage riêng). `confirmDialog` có thêm `hideCancel`. Không dùng service worker. Sửa kèm: `.table-wrap{position:relative}` để `sr-only` trong bảng không làm trang tràn ngang trên mobile. Chưa thử trên iPhone/Android thật; cần thử tải ảnh PNG/CSV khi chạy chế độ app trên iOS (nếu hỏng thì dùng Web Share API).
- Mobile (container thẻ dưới 460px): ô "Đã thông báo" ở thẻ Hoá đơn kỳ hiện dấu ✓✓ + số tiền thay cho chữ (CSS trong `css/components.css`; không có số tiền thì giữ chữ nhờ class `track-word-keep` ở `js/pages/input-tracker.js`). Màn rộng giữ nguyên. Có test e2e ở `e2e/copy-notice.spec.js`.
- Graphify: đồ thị cấu trúc ở `graphify-out/` chỉ nằm trên máy local, đã gỡ khỏi repo và có trong `.gitignore` (commit `ec970df`); không commit/push thư mục này.

## 3. Kiểm tra gần nhất

- `npm test` (`node --test tests`): 60/60 pass. `npm run test:e2e`: 23/23 pass (thêm 9 test PWA ở `e2e/pwa-install.spec.js` + 1 test ô dán URL không hợp lệ + 1 test ô đã thông báo trên mobile).
- Cú pháp `js/**/*.js` và `Code.gs` (chép sang .js tạm rồi `node --check`): sạch.
- Chưa có kiểm thử tự động trên trình duyệt (Playwright MCP không kết nối). Đã chụp thử thẻ theo dõi bằng Edge headless với dữ liệu giả.

## 4. Việc người dùng cần làm hoặc còn mở

1. Apps Script: dán lại `Code.gs` và `appsscript.json` mới nhất, rồi Deploy bằng New version. Cần để dùng được `markNotified` (trạng thái Đã thông báo) và OCR có retry. Sheet cũ tự thêm cột `notified_at`.
2. Điện thoại có thể đang giữ bản JS cũ trong bộ nhớ đệm; xoá dữ liệu trang web hoặc mở lại bằng liên kết cài nhanh.
3. Chưa kiểm chứng trên thiết bị thật: OCR với ảnh khác bố cục, sao chép ảnh vào clipboard trên Safari, QR quét được sau khi nén, chất lượng font tiếng Việt trong PNG.
4. Chưa kiểm chứng trên Sheets thật: chuỗi bắt đầu bằng `=` trong ô text (README có mục thử `=1+1`), thêm cột trên Sheet cũ.
5. (Đã xong) `graphify-out/` đã gỡ khỏi repo và thêm vào `.gitignore`. Lịch sử git cũ vẫn còn chứa nó; chưa viết lại lịch sử.
6. Plan.md và test dùng 2 tin mẫu có mã `M688OP3PB08` và số `0925266996`; repo đã public. Nếu đó là giá trị thật thì nên thay bằng giá trị giả (chưa làm).

## 5. Môi trường máy này

- Node: `C:\Program Files\nodejs\node.exe` (v26.13.0, chưa có trong PATH của terminal đang mở). Chạy test: `& "C:\Program Files\nodejs\node.exe" --test`.
- Git: `C:\Program Files\Git\cmd\git.exe`. Lệnh `git push` in dòng tiến trình ra stderr nên PowerShell báo `NativeCommandError`, nhưng push vẫn thành công.
- Graphify: `C:\Users\Windows\.local\bin\graphify.exe`. Cập nhật đồ thị: `graphify.exe update .` sau mỗi lần sửa code.
- Chạy cục bộ: `python -m http.server 8080` rồi mở http://localhost:8080.

## 6. Quy ước làm việc với người dùng (từ CLAUDE.md toàn cục)

- Giao tiếp hoàn toàn bằng tiếng Việt; comment trong code bằng tiếng Việt, tên biến/hàm bằng tiếng Anh.
- Luồng sửa code: phân tích, phản biện rủi ro, đề xuất, chờ duyệt, sửa, tự kiểm tra (logic, luồng dữ liệu, bảo mật), lặp đến khi hết lỗi.
- KHÔNG tự commit hoặc push; chỉ làm khi người dùng đồng ý rõ ràng. Mỗi lần commit phải chạy test trước.
- Chỉ dev-implementer được ghi file trong pipeline agent; reviewer và analyst chỉ đọc. Agent con thường không có shell nên điều phối phải tự chạy `node --check` và `node --test` sau mỗi lần agent báo xong.

## 7. Cấu trúc nhanh

- `index.html`, `css/` (tokens, base, components).
- `js/`: `main.js` (router hash, khởi động), `state.js`, `data.js`, `api.js`, `parser.js`, `matcher.js`, `format.js`, `summary.js`, `notice.js`, `qr.js`, `imageprep.js`, `quicksetup.js`, `ui.js`, `dom.js`.
- `js/pages/`: `input.js`, `input-tracker.js`, `stats.js`, `notice-page.js`, `settings.js`.
- `apps-script/`: `Code.gs`, `appsscript.json` (khai báo `oauthScopes` và dịch vụ Drive v2).
- `tests/`: parser, qr, format, water-receipt, ocr-error, summary, notified, quicksetup.
