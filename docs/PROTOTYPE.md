# EcoLoop Interactive Prototype

- Mở http://127.0.0.1:4174/ để dùng prototype. Bản Web3 cũ còn tại http://127.0.0.1:4174/legacy.
- Toàn bộ component, dữ liệu mẫu, state, form, ảnh SVG, map mô phỏng, luồng ký, ví, đổi quà và CSS bổ sung nằm trong `src/EcoLoopPrototype.tsx`. File chỉ import React và lucide-react; không import module nội bộ nào.
- Tailwind được biên dịch bằng @tailwindcss/vite. `src/prototype.css` chỉ nạp Tailwind và `src/main.tsx` chỉ mount component/chọn bản legacy. Có thể copy nguyên file TSX vào một dự án React + Tailwind + lucide-react khác.
- Đổi vai trò tại header hoặc trong chi tiết đơn. Không mất dữ liệu khi đổi vai trò/tab. Reload trang khôi phục dữ liệu ban đầu theo thiết kế useState.
- Có 5 lô ban đầu; EL101 đang chờ cân. Chọn Đơn hàng → EL101 → Người Thu Gom → nhập cân → ký 1/2 → đổi Người Bán → đồng ý → ký 2/2.
- Tiền và EcoPoints chỉ cộng một lần sau chữ ký thứ hai. Yêu cầu cân lại hủy đồng thuận cũ. EcoPoints là điểm off-chain, không phải token on-chain.
- Google, địa chỉ ví, paymaster, chữ ký, TxHash, thanh toán và CO₂ đều được mô phỏng/ước tính. Hash dùng SHA-256 cục bộ, không phải chữ ký ví; không gửi giao dịch thật hoặc yêu cầu API key. Không có database thực tế. Phần On-chain/Off-chain mô tả kiến trúc đích.
- Ảnh người dùng chọn chỉ là object URL trong trình duyệt, không upload server. Tối đa 6 ảnh, mỗi ảnh 5 MB, định dạng JPG/PNG/WebP. Nếu không chọn ảnh, dùng minh họa SVG nhúng trong file.
- Bản đồ SVG là mô phỏng, không cần API hoặc định vị. Khoảng cách mẫu 300m–1.8km. Pin mở chi tiết/nhận đơn; lô mới xuất hiện đầu sàn ở khoảng cách mẫu 300m.

## Kiểm chứng

Production build và TypeScript thành công. Đã thử trực tiếp trên trình duyệt:

1. EL101: đổi số cân thành 2.5kg lon + 9kg carton + 1.8kg PET. Kết quả 110.200đ, 251 điểm. Sau ký 2/2, ví từ 180 thành 431 điểm, tiền 110.200đ.
2. Đổi quà 200 điểm: ví còn 231, quà 300 điểm bị vô hiệu hóa vì thiếu 69.
3. Đăng lô 15kg carton + 200 lon quy đổi 3kg + 4kg PET: tổng 22kg, 161.000đ, 380 điểm; chuyển quyên góp thành 0đ và 760 điểm. Lô mới đứng đầu sàn.
4. Input ảnh hỗ trợ multiple; tải và xóa ảnh thành công.
5. Bản đồ lọc 500m–1km còn lô 800m; chọn pin và nhận đơn chuyển sang Đơn hàng/đang đến.
6. Bắt đầu cân → ký 1/2 → người bán yêu cầu cân lại: trở về chờ cân, không còn nút ký 2/2. Tin nhắn bàn giao hiển thị và được giữ trong state.

Chưa kết nối dịch vụ Google/paymaster hoặc contract Fuji thật trong prototype này.
