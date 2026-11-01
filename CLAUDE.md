# Quy tắc riêng của dự án

## Kiểm tra sau khi sửa code

Sau mỗi lần sửa code, bước tự kiểm tra (bước 5 trong quy trình chung) PHẢI gồm:

1. `npm test` (test đơn vị, `node --test tests`).
2. `npm run test:e2e` (Playwright, thư mục `e2e/`): chạy khi đổi giao diện, JS ở `js/`, CSS hoặc luồng dữ liệu. Chỉ sửa tài liệu thì có thể bỏ qua.
3. Đổi hành vi hoặc thêm tính năng giao diện thì bổ sung/cập nhật test trong `e2e/` cho phần đó.

Test lỗi thì sửa rồi chạy lại, không báo "xong" khi chưa pass. Ghi kết quả (số test pass/fail) vào báo cáo cuối.
