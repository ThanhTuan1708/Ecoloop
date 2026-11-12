# EcoLoop: một giao diện web

- Entry: `src/main.tsx` → `src/EcoLoopWeb.tsx`. Mọi URL `/legacy` được chuyển về `/`, giữ query/hash. Không import App/legacyMain/EcoLoopPrototype trong bundle chạy.
- Giao diện xanh–cam, sidebar desktop, điều hướng mobile; đăng nhập Google/Core dùng `useWalletSession`.
- `Pickup.tsx` dùng các trang home/orders/wallet/rewards/settings, hiển thị lưới hoặc bản đồ, tìm kiếm, lọc vật liệu và khoảng cách gần đúng. Vai trò UI không cấp quyền contract.
- `pickupClient.ts` và API hiện có thực hiện đăng nhiều vật liệu, tải ảnh/liên hệ riêng tư, nhận việc, đề xuất số cân, đồng thuận chủ lô, tranh chấp, hủy/trả việc, đổi và giao quà bằng giao dịch thật.
- Ví và quà trong web mới dùng ECO của contract Thu gom V2. ECO cũ không bị xóa và không tự chuyển. Chưa hỗ trợ thanh toán tiền mặt on-chain.
- Không sinh lô mẫu, tài khoản mẫu, chữ ký hoặc TxHash giả. Ảnh trong danh sách công khai là biểu tượng vật liệu; ảnh thật chỉ chủ lô/người nhận việc được tải qua xác thực.
- Contract V2 chưa có trong config hiện tại. Ví quản trị vào Thiết lập, triển khai V2 bằng ví, rồi Kích hoạt dùng chung. Các bước ký do người dùng thực hiện. Backend kiểm tra quyền quản trị cả hai contract.
- Google vẫn cần thirdweb Client ID; hướng dẫn trong GOOGLE-CORE-SETUP.md. Không bật paymaster nếu chưa cấu hình.

Kiểm chứng: production build, kiểm thử contract thu gom, API riêng tư/kích hoạt và wallet session. UI được kiểm tra đường dẫn cũ, thiết lập, đăng nhập và responsive. Không triển khai contract mới trên Fuji trong quá trình đổi giao diện.
