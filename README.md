# Quản lý hoá đơn điện, nước cho khách thuê

Ứng dụng web tĩnh (chạy trên GitHub Pages), lưu dữ liệu vào Google Sheet của bạn thông qua Google Apps Script. Dán tin nhắn hoá đơn điện/nước, app tự phân tích, thống kê và tạo ảnh thông báo gửi khách.

Cấu trúc: `index.html`, `css/`, `js/`, `apps-script/` (gồm `Code.gs`, `appsscript.json`), `tests/`.

## 1. Tạo Google Sheet

1. Vào https://sheets.google.com, đăng nhập tài khoản Google của bạn.
2. Chọn **Trống (Blank)** để tạo bảng tính mới, đặt tên tuỳ ý (ví dụ "Dien Nuoc").

## 2. Dán mã Apps Script

1. Trong Google Sheet: menu **Tiện ích mở rộng (Extensions)** -> **Apps Script**.
2. Ở file `Code.gs` mặc định: xoá hết nội dung, rồi dán toàn bộ nội dung file `apps-script/Code.gs` của dự án.
3. Bấm biểu tượng bánh răng **Project Settings** (Cài đặt dự án), tick **Show "appsscript.json" manifest file in editor** (Hiển thị tệp kê khai).
4. Quay lại **Editor**, mở file `appsscript.json`, xoá nội dung cũ và dán nội dung file `apps-script/appsscript.json` của dự án.
5. Bấm **Lưu** (biểu tượng đĩa mềm hoặc Ctrl+S).

## 3. Đặt mã bí mật `API_TOKEN`

1. Vào **Project Settings** -> kéo xuống **Script Properties** -> **Add script property**.
2. Property: `API_TOKEN`. Value: một chuỗi ngẫu nhiên thật dài (ít nhất 32 ký tự gồm chữ hoa, chữ thường, số). Có thể dùng trình tạo mật khẩu của trình duyệt hoặc trình quản lý mật khẩu.
3. Không dùng chuỗi dễ đoán (tên, ngày sinh, "123456"...). Không ghi token vào file nào trong dự án và không đưa lên GitHub.
4. Bấm **Save script properties**. Hãy lưu token ở nơi an toàn, bạn sẽ cần dán vào app ở bước 6.

## 4. Chạy hàm `setup` một lần

1. Ở Editor, chọn hàm **`setup`** trong ô danh sách hàm cạnh nút **Run**.
2. Bấm **Run (Chạy)**. Lần đầu Google yêu cầu cấp quyền: **Review permissions** -> chọn tài khoản -> nếu hiện cảnh báo "Google hasn't verified this app" chọn **Advanced** -> **Go to ... (unsafe)** -> **Allow**. (Đây là script do chính bạn viết, chạy trên Sheet của bạn.)
3. Quay lại Google Sheet, sẽ thấy các sheet và tiêu đề cột được tạo, cùng 3 căn mặc định.

## 5. Triển khai Web app

1. Bấm **Deploy** -> **New deployment**.
2. Bấm biểu tượng bánh răng cạnh "Select type" -> chọn **Web app**.
3. Thiết lập:
   - **Execute as**: **Me** (tài khoản của bạn)
   - **Who has access**: **Anyone**
4. Bấm **Deploy**, cấp quyền nếu được hỏi.
5. Copy **Web app URL** (dạng `https://script.google.com/macros/s/.../exec`, phải kết thúc bằng `/exec`).

Lưu ý quan trọng: mỗi lần sửa `Code.gs`, bạn phải **Deploy -> Manage deployments -> biểu tượng bút chì -> Version: New version -> Deploy**. Nếu không, URL vẫn chạy mã cũ. (Chọn "Anyone" vẫn an toàn vì mọi yêu cầu đều phải kèm `API_TOKEN`.)

### Trạng thái "Đã thông báo" (cập nhật từ bản cũ)

Ở trang Nhập, mỗi ô hoá đơn đã có (xanh) có nút sao chép ảnh thông báo riêng điện/nước; sau khi sao chép hoặc tải ảnh, ô chuyển sang "Đã thông báo" và được lưu vào Sheet (cột `notified_at`). Để dùng được:

1. Dán lại toàn bộ `apps-script/Code.gs` mới.
2. **Deploy -> Manage deployments -> biểu tượng bút chì -> Version: New version -> Deploy** (URL giữ nguyên).

Sheet `Invoices` cũ tự được thêm cột `notified_at` ở lần gọi kế tiếp (không cần sửa tay). Khi sửa số tiền hoặc lượng tiêu thụ của một hoá đơn đã thông báo, trạng thái tự về "chưa thông báo". Nếu chưa cập nhật Apps Script, app báo "Cần cập nhật Apps Script" nhưng vẫn sao chép/tải ảnh bình thường (chỉ không lưu được trạng thái).

### Bật đọc ảnh hoá đơn nước (OCR qua Google Drive)

Tab **Tải ảnh hoá đơn** ở trang Nhập cần Drive API. Khi cập nhật từ bản cũ:

1. Dán `apps-script/Code.gs` mới và `apps-script/appsscript.json` mới (bật **Show "appsscript.json" manifest file** trong Project Settings để sửa file này). File manifest đã khai báo dịch vụ nâng cao `Drive` (v2).
2. Chạy hàm bất kỳ (ví dụ `setup`) một lần để Google hiện hộp thoại cấp thêm quyền Drive/Documents, chọn **Allow**.
3. **Deploy -> Manage deployments -> biểu tượng bút chì -> Version: New version -> Deploy** (URL giữ nguyên).

Lưu ý: ảnh được gửi tới Google Drive của chủ Sheet để nhận diện chữ rồi bị xoá ngay (không lưu ở đâu khác). Kết quả OCR có thể sai nên luôn kiểm tra lại các trường trước khi lưu. Nếu app báo không đọc được ảnh, kiểm tra lại các bước trên và Drive API đã bật cho dự án.

#### Nếu đọc ảnh lỗi

1. Trong editor Apps Script chọn hàm `testOcr` rồi bấm **Run** (không cần token); cấp quyền nếu được hỏi. Xem kết quả/lỗi thật ở **Execution log**.
2. Sau khi sửa, luôn **Deploy > Manage deployments > Edit > New version**.
3. Mã lỗi app hiển thị: `drive_not_enabled` = chưa bật Drive API v2; `no_permission` = chưa cấp quyền Drive/Documents; `rate_limited` = Google giới hạn tốc độ tạm thời (server đã tự thử lại 3 lần), đợi vài chục giây rồi bấm **Đọc ảnh** lại; `quota` = hết hạn mức theo ngày, không thử lại được ngay, hạn mức reset sau khoảng 24 giờ; mọi thông báo đều kèm "Chi tiết từ Google" là lỗi gốc đã làm sạch; `drive_rejected`/`ocr_failed` = Google từ chối ảnh (kèm chi tiết gốc, thử ảnh khác).

## 6. Kết nối app với Google Sheet

1. Mở app (xem bước 8 hoặc 9), vào màn **Cấu hình**.
2. Ở mục **Kết nối Google Sheets**: dán URL `/exec` và token ở bước 3.
3. Bấm **Kiểm tra kết nối**. Chip trạng thái chuyển sang thành công là xong.

### Liên kết cài nhanh cho điện thoại

Để khỏi gõ URL và token trên điện thoại:

1. Trên máy tính đã kết nối xong, vào **Cấu hình** > **Kết nối Google Sheets** > bấm **Tạo liên kết cài nhanh**, rồi **Sao chép liên kết**.
2. Chuyển liên kết sang điện thoại bằng cách an toàn (ví dụ tự gửi qua ghi chú riêng tư), mở bằng trình duyệt: app tự lưu cấu hình và xoá token khỏi thanh địa chỉ.
3. Sau đó dùng app bình thường. Có thể lưu liên kết làm dấu trang hoặc "Thêm vào màn hình chính" để cài lại khi mất dữ liệu trình duyệt.

Lưu ý: liên kết chứa token (nằm sau dấu `#` nên không gửi lên máy chủ), nên KHÔNG gửi vào nhóm chat hay nơi công khai. Nếu liên kết bị lộ: vào Apps Script > Project Settings > Script Properties, đổi giá trị `API_TOKEN` sang chuỗi mới, rồi nhập lại token mới ở mọi thiết bị (liên kết cũ sẽ không còn dùng được).

## 7. Nhập dữ liệu ban đầu

Trong màn **Cấu hình**:
1. **Danh sách căn**: sửa tên căn, mã khớp điện, mã khớp nước; thêm/xoá căn; bấm **Lưu cấu hình**.
2. **Tài khoản nhận chuyển khoản**: nhập tên ngân hàng, chủ tài khoản, số tài khoản, nội dung chuyển khoản mẫu (hỗ trợ `{căn}`, `{tháng}`, `{năm}`).
3. **Tải ảnh QR lên** (ảnh sẽ được nén tự động; nếu quá lớn thì chọn ảnh nhỏ hơn), rồi bấm **Lưu tài khoản**.

## 8. Bật GitHub Pages

1. Đưa mã nguồn lên một repo GitHub (nhánh `main`). Xem mục Bảo mật trước khi đẩy.
2. Vào repo -> **Settings** -> **Pages**.
3. **Source**: **Deploy from a branch**; **Branch**: `main`, thư mục `/ (root)`; bấm **Save**.
4. Chờ 1-2 phút, địa chỉ app hiện ở đầu trang Pages (dạng `https://<tên-bạn>.github.io/<tên-repo>/`).

## 9. Chạy thử trên máy và chạy test

Chạy app cục bộ (chọn một cách), rồi mở http://localhost:8000 (hoặc cổng do `serve` báo):

```
python -m http.server 8000
```
hoặc
```
npx serve .
```

Chạy test (cần Node.js 18 trở lên):

```
node --test
```

## 10. Bảo mật

- Không commit URL Apps Script, token, ảnh QR, số tài khoản hay dữ liệu thật vào repo. Toàn bộ dữ liệu thật chỉ nằm trong Google Sheet của bạn.
- URL và token chỉ được lưu trong `localStorage` của trình duyệt bạn dùng; nhập lại trên mỗi thiết bị. Không dùng máy công cộng.
- Token nằm ở Script Properties, không nằm trong `Code.gs`. Nếu nghi lộ token: đổi `API_TOKEN` mới ở Script Properties và nhập lại vào app.
- Chia sẻ Google Sheet chỉ với người cần thiết.

## 11. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân / Cách xử lý |
|---|---|
| Báo `unauthorized` | Token trong app khác `API_TOKEN` ở Script Properties (thừa/thiếu ký tự, khoảng trắng). Dán lại cho đúng. |
| Lỗi CORS, hoặc nhận HTML (trang đăng nhập Google) thay vì JSON | Web app chưa deploy với **Who has access: Anyone**, hoặc dùng sai URL (phải là URL `/exec`, không phải `/dev`). Deploy lại đúng cài đặt. |
| Sửa `Code.gs` rồi mà không có tác dụng | Quên Deploy phiên bản mới (xem bước 5). |
| Báo chưa cấu hình / mất mạng | Kiểm tra đã nhập URL + token ở Cấu hình và có kết nối Internet; thử lại. |
| Ảnh PNG xuất ra lỗi font hoặc không có dấu | Chờ font tải xong rồi xuất lại; tải lại trang và kiểm tra mạng (font nạp từ Internet). |
| Nút "Sao chép ảnh" không hoạt động | Trình duyệt/ngữ cảnh không hỗ trợ clipboard ảnh (cần HTTPS hoặc localhost, và trình duyệt mới). Dùng nút tải ảnh về rồi gửi thủ công. |
| Không lưu được ảnh QR | Ảnh sau nén vượt giới hạn; chọn ảnh nhỏ hơn. |

## 12. Checklist nghiệm thu

- [ ] `node --test` pass toàn bộ test parser.
- [ ] Dán 2 tin mẫu: thấy 2 hoá đơn khớp căn PB08, tổng `6.145.049 ₫`, lưu thành công vào Google Sheet, mở lại app vẫn thấy dữ liệu.
- [ ] Chỉ dán tin điện (kỳ khác), tháng sau bổ sung tin nước: dữ liệu ghép đúng cùng kỳ/căn, không tạo dòng trùng.
- [ ] Thông báo đúng 3 biến thể: đủ điện + nước; chỉ điện; chỉ nước (bắt buộc chọn hạn đóng).
- [ ] Xuất PNG đọc rõ tiếng Việt có dấu, QR quét được; "Sao chép ảnh" dán được vào Zalo/Messenger, hoặc tải về nếu trình duyệt không hỗ trợ.
- [ ] Sai token hoặc chưa cấu hình: app báo lỗi dễ hiểu, không crash.
- [ ] Giao diện đúng thiết kế, dùng tốt trên điện thoại, có `prefers-reduced-motion`.
- [ ] Không có dữ liệu thật hoặc bí mật nào trong repo.
- [ ] Chống công thức ở Apps Script: dùng một Sheet thử, lưu một hoá đơn có `raw_message` là `=1+1` (và `+1`, `-1`, `@a`), mở lại Sheet: ô phải hiện đúng chữ `=1+1` (không phải `2`) và app đọc lại đúng nguyên văn. Mã server đặt định dạng `@` trước khi ghi và có bước dự phòng rich text, nhưng chưa được kiểm chứng trên Google Sheets thật.
- [ ] URL kết nối phải có dạng `https://script.google.com/macros/s/<id>/exec` (URL Workspace dạng `/a/macros/<domain>/s/...` bị từ chối).
