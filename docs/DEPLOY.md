# Triển khai EcoLoop

EcoLoop gồm web React và server Node lưu ảnh có chữ ký ví. Cần host chạy Node hoặc Docker và ổ đĩa bền vững; chỉ đưa thư mục dist lên static hosting sẽ thiếu API ảnh và cấu hình.

## Contract chung

`config/app.json` chứa địa chỉ contract Fuji hiện tại. Server cung cấp qua `/api/config`; mọi trình duyệt ưu tiên cấu hình này thay cho địa chỉ cũ trong localStorage. Giao diện kiểm tra bytecode trước khi tải dữ liệu của ví. Không cần triển khai lại contract cho bản cập nhật giao diện này.

Operator chỉnh `collectionName` và `collectionInstructions` trong file để đưa tên, địa chỉ thực, lịch tiếp nhận và thông tin liên hệ. Đây là thông tin hướng dẫn hiện tại, không phải dữ liệu điểm thu gom được ghi trên chain cho từng yêu cầu. Có thể ghi đè địa chỉ contract bằng `ECOLOOP_ADDRESS` trên server; không nhập private key để chạy web.

## Docker

```sh
docker build -t ecoloop .
docker run --name ecoloop -p 4174:4174 -v ecoloop-data:/data -e APP_ORIGIN=https://your-domain.example ecoloop
```

Thay APP_ORIGIN bằng tên miền HTTPS thực. Khi chạy thử Docker qua localhost, dùng `APP_ORIGIN=http://127.0.0.1:4174`. Đặt reverse proxy HTTPS trước server trên môi trường public. Có thể dùng PORT do nền tảng cấp; mount ổ đĩa vào DATA_DIR (mặc định /data trong image). Sao lưu ổ đĩa vì ảnh không lưu trên chain. Dữ liệu demo chỉ nằm trong trình duyệt của người xem, không thay đổi trạng thái contract.

Dockerfile được chuẩn bị cho triển khai; cần tự build thử trên máy có Docker trước khi đưa lên host.

## Chạy Node

```sh
npm ci
npm run build
npm start
```

Cấu hình HOST=0.0.0.0, APP_ORIGIN, PORT và DATA_DIR trong môi trường hosting. VITE_CHAIN_ID và VITE_RPC_URL phải đồng nhất lúc build và chạy. Local Fuji mặc định dùng chain 43113.

## Checklist demo

1. Mở URL ở hai hồ sơ trình duyệt có Core; cả hai tự nhận cùng contract.
2. Ví quản trị cấp COLLECTOR_ROLE cho ví thu gom. Cả ví gửi và ví duyệt cần AVAX Fuji.
3. Ví người dùng gửi ảnh mới; kiểm tra ảnh trùng bị báo trước khi ký upload.
4. Ví thu gom chọn vai trò Thu gom, xem ảnh, cân thực tế và duyệt yêu cầu của ví khác.
5. Ví người dùng xem ECO, đổi quà đủ điểm, sao chép mã ECO-xxxx.
6. Ví thu gom đối chiếu mã, địa chỉ ví nhận và tên quà, giao quà rồi xác nhận. Mã công khai không phải mật khẩu nhận quà.

## Giới hạn

Xác minh vật liệu và khối lượng vẫn dựa vào đơn vị thu gom. Hai ví thông đồng chưa được ngăn bằng bằng chứng vật lý. Lịch sử yêu cầu đọc theo lô 100, nút tải thêm mở rộng dữ liệu; mục tra giao dịch trong chi tiết chỉ tra 3.000 block gần nhất và có liên kết explorer cho lịch sử cũ. Chưa có tài trợ gas, quản lý nhiều điểm thu gom hay đối tác quà thực tế.

Bản cập nhật không tự tạo tài khoản hosting hay tên miền. Chỉ báo là đã public khi nền tảng hosting trả về URL triển khai thành công.
