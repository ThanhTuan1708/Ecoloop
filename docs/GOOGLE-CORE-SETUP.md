# Google và Core trên giao diện web

Giao diện web thống nhất `/` (EcoLoopWeb.tsx) kết nối ví thật qua `src/useWalletSession.ts`. Không tự đăng nhập, không dùng email/địa chỉ ví mẫu, không cấp 180 điểm mẫu. Chuyển vai trò chỉ đổi giao diện, không đổi tài khoản hoặc cấp quyền trong contract. Tải lại trang cần bấm kết nối lại; SDK Google có thể sử dụng phiên Google còn hiệu lực.

## Bật Google

1. Đăng nhập https://thirdweb.com/dashboard và tạo dự án của bạn.
2. Bật In-App Wallet / Google cho dự án. Cho phép origin `http://127.0.0.1:4174`; nếu dùng `localhost`, thêm `http://localhost:4174`. Khi deploy, thêm origin HTTPS thật.
3. Lấy **Client ID công khai**, tạo `.env.local` ở thư mục dự án:

```dotenv
VITE_THIRDWEB_CLIENT_ID=YOUR_PUBLIC_CLIENT_ID
VITE_SPONSOR_GAS=false
```

4. Chạy `npm run build`, rồi mở lại trang và tải lại bằng Ctrl+F5. Vite đọc Client ID lúc build. Không đưa Secret Key hoặc private key vào biến VITE_.
5. Bấm Đăng nhập → Tiếp tục với Google và hoàn tất cửa sổ Google. Địa chỉ hiển thị được lấy từ ví nhúng thật của SDK; email chỉ hiển thị nếu SDK trả về.

Tài liệu SDK: https://portal.thirdweb.com/react/v5/in-app-wallet/build-your-own-ui

## Core

Mở app trong Chrome/Edge có Core, bấm Đăng nhập → Core. Chấp thuận kết nối và chuyển sang Avalanche Fuji. Khi đổi account trong extension, app yêu cầu kết nối lại để tránh sử dụng tài khoản cũ. Ngắt kết nối trong app không thu hồi quyền website trong extension; có thể thu hồi quyền trong Core.

## Gas và giới hạn

- Mặc định ví Google dùng EOA, cần AVAX testnet khi gửi giao dịch. Google và Core có thể là hai địa chỉ khác nhau.
- Chỉ bật `VITE_SPONSOR_GAS=true` sau khi cấu hình và kiểm tra paymaster EIP-4337 trên Fuji. Không hứa gas miễn phí khi nhà cung cấp chưa chấp thuận. Chuyển sang smart account thay đổi địa chỉ ví Google; không tự chuyển số dư.
- Chưa có Client ID nên chưa kiểm chứng OAuth với tài khoản Google thật. Không có đường lui đăng nhập demo.
- Giao diện sàn mới đã dùng Pickup và pickupClient để gọi contract/API thật. Đăng lô, nhận việc, cân, xác nhận và đổi ECO nằm trong giao diện mới. `/legacy` tự chuyển về `/`, không tải màn hình cũ.
- Contract thu gom V2 phải được triển khai/kích hoạt một lần tại Thiết lập bằng ví quản trị; app không tự ký hoặc tự triển khai. ECO V1 vẫn tồn tại trên contract cũ, không tự di chuyển hoặc gộp với ECO V2.
- Kết nối ví không phải một phiên đăng nhập server có cookie. Backend hiện có yêu cầu chữ ký cho từng thao tác; không tin địa chỉ/email do frontend tự gửi để cấp quyền.
