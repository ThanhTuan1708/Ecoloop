# Checklist P0 trước khi nộp (hạn 23:59 ngày 21/11/2026)

Chạy theo thứ tự trong PowerShell tại `D:\Hackathon`. Tất cả ví là **ví test Fuji**, không dùng ví có tiền thật.

## 0. Chuẩn bị `.env`

```
DEPLOYER_PRIVATE_KEY=0x...      # ví quản trị (cần ~1 AVAX Fuji)
SEED_HOUSEHOLD_KEYS=0x...       # 1–2 ví hộ gia đình (~0.2 AVAX mỗi ví)
SEED_COLLECTOR_KEY=0x...        # ví người thu gom (~0.5 AVAX, script tự đổi AVAX→ECO để ký quỹ)
ICM_DEST_RPC_URL=               # RPC của Avalanche L1 testnet có bật ICM (để trống nếu chưa có)
```

## 1. Kiểm tra mã nguồn

```powershell
npm install
npm test
npm run build
```

Phải xanh hết trước khi deploy. Nếu test teleporter lỗi, dừng lại và báo.

## 2. Deploy lại contract từ mã nguồn hiện tại

Contract đang chạy (`0x0b9f…1fee7e`) là bản cũ: `acceptLot` vừa trả từ escrow vừa mint thêm ECO. Deploy lại để khớp mã nguồn:

```powershell
npm run deploy:pickup:fuji     # Forwarder + Pickup V4 (có quầy đổi AVAX→ECO) + Rewards đã nạp ECO
npm run seed:fuji              # 4 lô thử: hoàn tất (có NFT), chờ xác nhận, đã nhận việc, đang mở
```

## 3. Avalanche ICM

```powershell
npm run deploy:bridge:fuji
```

- Có `ICM_DEST_RPC_URL`: deploy bridge 2 phía, gửi chứng nhận lô đã hoàn tất, chờ L1 đích nhận.
- Không có: chỉ deploy bridge nguồn trên Fuji; README ghi rõ chưa kết nối L1 đích.

## 4. Verify trên Snowtrace

```powershell
npm run verify:fuji
```

Mở từng link in ra, phải thấy dấu tích xanh và tab **Contract → Code**.

## 5. Đưa lên GitHub và Vercel

```powershell
git add -A
git status            # kiểm tra KHÔNG có .env, .env.local
git commit -m "feat: ICM bridge, redeploy V4, Snowtrace verification, docs for judges"
git push origin main
```

Vercel tự build lại từ `main`. Mở https://ecoloop-pi-six.vercel.app, kiểm tra `/api/config` trả `pickupContract` mới.

## 6. Link nộp bài (mở thử trong tab ẩn danh)

- [ ] Repo GitHub công khai, có `contracts/EcoLoopTeleporterBridge.sol` và bảng contract trong README.
- [ ] Slide: import `EcoLoop-Avalanche-T1-PitchDeck.pptx` vào Google Slides, Share → "Anyone with the link: Viewer".
- [ ] Video 2–3 phút trên YouTube (Unlisted) hoặc Google Drive (Anyone with link): theo kịch bản slide 9, quay cả Snowtrace của tx `acceptLot` và tx ICM.
- [ ] Bấm **Submit** trên team1vn.xyz (bản nháp không được tính).
