# Tạo dữ liệu thật cho EcoLoop trên Avalanche Fuji

App chỉ hiển thị dữ liệu on-chain từ contract thu gom V4. Có hai loại dữ liệu, cần trình bày tách bạch với ban giám khảo:

| Loại | Ai tạo | Dùng để |
|---|---|---|
| **Giao dịch thử** | Script `npm run seed:fuji`, dùng ví test của nhóm | Kiểm tra đủ luồng trên Fuji: mở lô, khóa ký quỹ ECO, cân, trả ECO, NFT |
| **Dữ liệu thật** | Hộ gia đình và người thu gom thật dùng app | Số liệu thí điểm: số lô, số kg, ECO đã trả, số chứng nhận |

Không trình bày giao dịch thử như hoạt động của người dùng thật.

## Bước 1. Chuẩn bị ví và AVAX test

1. Trong Core Wallet, tạo các tài khoản riêng cho thử nghiệm:
   - 1 ví **quản trị**
   - 1 ví **người thu gom**
   - 1–2 ví **hộ gia đình**
   - 1 ví **tài trợ gas** cho server (relayer)
2. Nhận AVAX Fuji miễn phí từ faucet của Core (core.app → Tools → Testnet Faucet). Mỗi ví khoảng 0,5 AVAX là đủ. Ví người thu gom cần thêm ít AVAX để mua ECO ký quỹ qua quầy đổi `buyEco` (script seed tự mua nếu thiếu).
3. Không dùng ví có tiền thật. Khóa riêng (private key) chỉ để trong file `.env` trên máy bạn. File này không bao giờ được đưa lên GitHub, vì `.env` đã nằm trong `.gitignore`.

## Bước 2. Triển khai contract V4

Chọn một trong hai cách:

- **Không cần khóa riêng:** chạy app trên máy (`Chay-EcoLoop.bat`), kết nối Core bằng ví quản trị, vào **Thiết lập → Triển khai bằng ví quản trị** (2 giao dịch), rồi bấm **Kích hoạt dùng chung**. Server ghi địa chỉ mới vào `config/app.json`.
- **Bằng dòng lệnh (khuyên dùng):** điền `DEPLOYER_PRIVATE_KEY` trong `.env`, rồi chạy `npm run deploy:pickup:fuji`. Script triển khai Forwarder, Pickup V4 có quầy đổi AVAX→ECO (`ECO_PER_AVAX`, mặc định 1000), Rewards đã nạp ECO, và tự cập nhật `config/app.json`, `deployments/43113-latest.json`, bảng contract trong README.

Sau đó chạy `npm run verify:fuji` để verify mã nguồn trên Snowtrace, rồi commit `config/app.json`, `deployments/` và `README.md` lên GitHub để bản trên Vercel cũng dùng contract mới.

## Bước 3. Cấu hình thu gom

- Mọi ví có thể đăng lô và nhận lô của ví khác sau khi kích hoạt V4.
- Vào **Thiết lập → Giá thu mua (ECO/kg)**: chỉnh giá nếu cần.
- Vào **Đổi quà → Thêm phần thưởng thật**: thêm phần quà của đối tác thật, ghi rõ tên, giá ECO và số suất.
- Bật miễn phí gas: điền khóa của ví tài trợ gas vào `RELAYER_PRIVATE_KEY` (trong `.env` hoặc biến môi trường trên Vercel).

## Bước 4 (tùy chọn). Tạo giao dịch thử bằng script

Điền vào `.env`: `DEPLOYER_PRIVATE_KEY` (ví quản trị), `SEED_HOUSEHOLD_KEYS` (ví hộ gia đình, cách nhau bằng dấu phẩy), `SEED_COLLECTOR_KEY` (ví người thu gom).

```
npm run seed:fuji -- --dry-run   # xem trước kế hoạch, không gửi giao dịch
npm run seed:fuji                # tạo 4 lô thử: hoàn tất, chờ xác nhận, đã nhận việc, đang mở
```

- Muốn lô thử có ảnh và có nút **Xem liên hệ**: đặt ảnh thật vào thư mục `seed-photos/`, chạy server, rồi đặt `SEED_SERVER_URL=http://127.0.0.1:4174`.
- Mỗi lần chạy, script ghi nhật ký giao dịch vào `deployments/seed-43113-*.json`, có đánh dấu `"test": true`.

## Bước 4b. Gửi chứng nhận qua Avalanche ICM (tùy chọn, nên làm)

1. Tạo một Avalanche L1 testnet có bật ICM (Builder Console: https://build.avax.network/console), bật relayer ICM giữa Fuji C-Chain và L1 đó.
2. Điền `ICM_DEST_RPC_URL` (và `ICM_DEST_NAME`, `ICM_DEST_EXPLORER` nếu có) trong `.env`.
3. Chạy `npm run deploy:bridge:fuji`: triển khai bridge ở hai chain, khai báo trusted remote, gửi chứng nhận của một lô đã hoàn tất và chờ L1 đích nhận. Kết quả ghi vào `deployments/icm-latest.json` và README.
4. Không có L1 đích: script vẫn triển khai bridge nguồn trên Fuji; README ghi rõ là chưa kết nối L1 đích.

## Bước 5. Thu dữ liệu thật (thí điểm)

1. Chọn 1 vựa ve chai hoặc 1 người thu gom và 5–10 hộ gia đình. Giải thích rõ đây là thử nghiệm trên testnet, và xin đồng ý trước khi chụp ảnh, lưu số điện thoại.
2. **Hộ gia đình:**
   - Đăng nhập Google hoặc Core.
   - **Đăng lô**: chụp ảnh thật, ước lượng số kg, nhập liên hệ. Không tốn gas.
3. **Người thu gom:**
   - Nhận việc, khóa ECO ký quỹ (120% giá trị ước tính).
   - Đến cân thực tế, chụp ảnh màn hình cân, rồi nhập số cân.
4. **Hộ gia đình** xác nhận số cân, nhận ECO từ khoản ký quỹ và chứng nhận NFT.
5. **Lưu bằng chứng cho bài thi:**
   - Link Snowtrace của contract và của vài giao dịch.
   - Ảnh chụp màn hình app.
   - Bảng tổng hợp: số lô, tổng kg theo vật liệu, số ECO đã trả, số chứng nhận.

## Ghi chú

- Lô, ký quỹ và ECO trên contract cũ vẫn thuộc địa chỉ cũ.
- Tọa độ ghi trên chain đã làm tròn khoảng 1 km. Địa chỉ, số điện thoại và ảnh chỉ lưu trên server EcoLoop, và chỉ chủ lô cùng người thu gom được giao việc xem được.
