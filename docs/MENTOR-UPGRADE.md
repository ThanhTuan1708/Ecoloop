# EcoLoop — cập nhật theo buổi mentor

## Đã triển khai trong mã nguồn

- Trang **Thu gom tận nơi**: một lô gồm nhựa, giấy, kim loại và thủy tinh; tổng tối đa 1.000 kg. Ảnh đại diện cả lô, từng loại có khối lượng dự kiến riêng.
- Bản đồ OpenStreetMap/Leaflet, bộ lọc lô của tôi/việc đã nhận/lô đang mở, khoảng cách và bán kính 500 m, 1, 2, 5 km. Tọa độ công khai làm tròn khoảng 1 km: khoảng cách chỉ gần đúng, không phải định tuyến đường bộ. Bản đồ cần Internet.
- Contract `EcoLoopPickup`: đăng lô → collector nhận việc → cân thực tế và đề xuất → chủ lô chấp thuận → mint ECO. Chỉ hai địa chỉ độc lập; người khác không thể chấp thuận thay. Không mint khi mới nhận việc hoặc đề xuất. Hai giao dịch on-chain là hai sự đồng ý, không phải một checkbox giả lập bảo mật.
- Chủ lô có thể yêu cầu cân lại. Đề xuất hết hạn sau 7 ngày. Collector trả việc; chủ lô mở lại việc quá 7 ngày. Chủ lô hủy khi đang mở. Những thao tác phục hồi vẫn dùng được khi tạm dừng.
- Liên hệ/địa chỉ/khung giờ lưu trên server, không đưa lên chain. Chủ lô và collector được giao việc đang hoạt động mới đọc được; chữ ký một lần, gắn chain/contract/nội dung, có thời hạn. Ảnh V2 có cùng giới hạn quyền đọc. Dữ liệu không được mã hóa trên đĩa: người quản trị máy vẫn có quyền truy cập `.data`; cần bảo vệ và sao lưu thư mục này.
- Quản trị cấp/thu hồi quyền và tạm dừng V2; ECO V2 có danh mục quà và biên nhận riêng. Không chuyển hay xóa token/lịch sử V1.
- Giao diện responsive, demo hai vai trò, trạng thái đang ký, lưu hash giao dịch để tiếp tục kiểm tra sau khi reload.

## Dùng thử local ngay

1. Chạy `npm run build`, sau đó `npm start`; mở http://127.0.0.1:4174.
2. Chọn **Trải nghiệm bản demo → Thu gom tận nơi**.
3. Chọn **Người thu gom**, chọn lô mẫu, **Nhận thu gom**, nhập kết quả cân rồi gửi.
4. Chuyển **Chủ lô**, chọn **Lô của tôi**, kiểm tra khối lượng, tích xác nhận và nhận ECO demo. Có thể thử yêu cầu cân lại trước khi đồng ý.
5. **Đăng lô thu gom** để thử nhiều vật liệu và chọn khu vực trên bản đồ. Ảnh/liên hệ demo không được upload.

## Kích hoạt Fuji bằng Core

Contract V1 đang hoạt động không có hàm thu gom mới và không thể nâng cấp tại chỗ. Bản này giữ V1 nguyên vẹn và thêm contract V2 riêng. **Số dư, quyền collector, danh mục quà của V1 không tự chuyển sang V2.** Không nên hứa tự động chuyển token hoặc thay hệ thống khi chưa có kế hoạch migration được thống nhất.

1. Kết nối ví quản trị của contract hiện tại, chọn **Thu gom tận nơi**.
2. Đọc thông báo, tích đồng ý tạo contract V2 và bấm **Triển khai bằng ví quản trị**. Core yêu cầu ký giao dịch Fuji, dùng AVAX testnet. Không gửi private key cho app/server.
3. Khi địa chỉ hiện ra, bấm **Kích hoạt dùng chung**, ký thông điệp. Server kiểm tra bytecode đúng và quyền quản trị ở cả V1/V2 trước khi cập nhật `config/app.json.pickupContract`.
4. Nếu đóng trang trong lúc chờ, mở lại Thu gom và **Kiểm tra giao dịch**. Không triển khai lại. Có thể dán địa chỉ V2 đã triển khai vào ô kích hoạt.
5. Cấp quyền **V2** cho ví collector khác. Chrome và Edge đọc cùng cấu hình server; nhấn Làm mới khi cần.
6. Chủ lô đăng ảnh và thông tin bàn giao. Ví ký quyền lưu ảnh, ký thông tin liên hệ, rồi ký giao dịch tạo lô. Collector nhận lô, xem liên hệ riêng, tới cân và gửi kết quả. Chủ lô kiểm tra rồi xác nhận bằng ví của mình.
7. Đổi ECO V2 trong phần cuối trang Thu gom; ECO V1 vẫn đổi ở trang Đổi quà cũ.

**Chưa triển khai V2 lên Fuji trong lần cập nhật này:** cần người dùng ký bằng Core. Kiểm thử hợp đồng đã chạy trên EVM local, không thay thế một audit độc lập.

## Google, ví nhúng và tài trợ gas

Đã có adapter thirdweb Google → EIP-1193 dùng chung với lớp ví hiện tại. Mặc định nút bị vô hiệu hóa vì chưa có Client ID; Core vẫn dùng được. Không có tài khoản hoặc khóa bí mật nào được tự tạo.

1. Tạo dự án thirdweb, bật Google/in-app wallet và allowlist origin local. Xem [tài liệu in-app wallet](https://portal.thirdweb.com/react/v5/in-app-wallet/build-your-own-ui).
2. Thêm **public** `VITE_THIRDWEB_CLIENT_ID` vào `.env.local`, build lại và khởi động lại server. Tuyệt đối không đặt secret key vào biến `VITE_*`.
3. Mặc định `VITE_SPONSOR_GAS=false`: ví Google là EOA, cần AVAX testnet. Đây là một địa chỉ khác ví Core.
4. Nếu muốn sponsor, cấu hình smart-account/paymaster trên Fuji, giới hạn contract/hàm, mức phí, ngân sách và rate limit ở dashboard trước. Sau đó đặt `VITE_SPONSOR_GAS=true`, build lại. Code dùng EIP-4337, không giả định Fuji hỗ trợ EIP-7702.
5. **Chọn chế độ trước khi onboarding:** chuyển EOA sang smart account làm thay đổi địa chỉ ví Google. Không tự di chuyển số dư. Sponsor chỉ áp dụng ví Google/smart account khi paymaster chấp thuận, không tài trợ ví Core.
6. Server kiểm tra chữ ký EOA hoặc contract-wallet bằng `publicClient.verifyMessage`. Phải kiểm thử thêm chữ ký EIP-1271/EIP-6492, Google popup trên mobile và paymaster trên Fuji với cấu hình thực tế. Những luồng dịch vụ này chưa thể kiểm chứng khi chưa có Client ID.

## Kiểm chứng và giới hạn còn lại

- `npm test`: 17 kiểm thử qua (16 bài toàn bộ suite, rồi thêm kiểm thử kích hoạt và chạy lại 2 bài API V2), bao gồm các kiểm thử cũ và V2 (phân quyền, nhận trùng, xác nhận hai phía, phát thưởng một lần, tranh chấp, hết hạn, tạm dừng, ảnh/liên hệ riêng tư, chữ ký chống replay và lưu qua restart, quyền kích hoạt contract chung).
- `npm run build`: TypeScript và production build qua.
- UI demo đã thử nhận việc → thay khối lượng → gửi đề xuất → chủ lô xác nhận; kiểm tra viewport 390×844 và desktop.
- Danh sách đọc 100 lô gần nhất, có tải thêm; bộ lọc chỉ áp dụng các lô đã tải. Đổi quà V2 hiển thị tối đa 50 biên nhận gần nhất. Chưa có indexer, push notification, tối ưu tuyến đường hoặc xử lý tranh chấp bằng con người.
- Vai trò collector vẫn dựa trên quản trị tin cậy; blockchain không chứng minh vật liệu đã được cân thật. Phải có quy trình xác minh điểm thu gom.
- Phụ thuộc thirdweb hiện kéo theo cảnh báo `npm audit`. Đã chạy bản vá tương thích (`npm audit fix`), còn 36 cảnh báo (25 high, 11 moderate) ở thời điểm kiểm tra; không dùng `--force` hạ/nâng major phá API. Phải rà lại dependency, threat model và audit trước public production. Bản hiện tại giữ local/testnet theo yêu cầu.
- Không tự xây Avalanche L1: đoạn audio không xác định rõ đây là yêu cầu. Chưa triển khai public hosting.
