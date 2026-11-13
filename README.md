# EcoLoop · Avalanche Fuji application

Ứng dụng tái chế nhận ECO, đổi và giao quà. Giao diện tiếng Việt, dùng Core Wallet trên Chrome/Edge. Web mặc định chạy chế độ testnet với số liệu thật; demo là lựa chọn riêng.

## Chạy ứng dụng

Node.js 24 LTS, npm, Core extension trên Chrome hoặc Edge.

```powershell
cd D:\Hackathon
npm install
npm run dev
```

Mở **http://127.0.0.1:5173/** trực tiếp trong Chrome/Edge đã cài Core. `npm run dev` tự compile contract, chạy Vite và server ảnh. Không cần điền private key hoặc cấu hình contract trước khi kết nối ví.

Bản build để chạy ổn định:

```powershell
npm run build
npm start
```

Mở **http://127.0.0.1:4174/**. Server này phục vụ cả web và API ảnh. `npm run preview` chỉ phục vụ frontend tĩnh, không thay thế `npm start` khi dùng tính năng ảnh.

## Khởi tạo Fuji bằng Core — không nhập private key

1. Trong app chọn **Kết nối ví**, chọn Core, chấp nhận kết nối và chuyển mạng trong tiện ích ví. Ví kết nối được ngay cả khi chưa có contract.
2. Nạp **AVAX testnet** qua liên kết faucet trong app: https://core.app/tools/testnet-faucet/ . Faucet có thể áp dụng điều kiện riêng.
3. Bản hiện tại đã có contract Fuji dùng chung trong `config/app.json`. Người dùng chỉ kết nối ví; app kiểm tra runtime bytecode trước khi tải dữ liệu. Chrome và Edge tự đọc cùng contract, không cần nhập lại.
4. Có thể **Thêm ECO vào ví** và **Chia sẻ app** trong phần kết nối. Chọn vai trò **Người tái chế**, **Thu gom** hoặc **Quản trị** ở thanh bên; chỉ hiện vai trò ví được cấp.
5. Chỉ khi khởi tạo hệ thống mới: người vận hành bỏ địa chỉ chung trong cấu hình, chọn **Tôi là người tổ chức**, triển khai bằng Core rồi cập nhật địa chỉ mới vào `config/app.json` cho mọi người cùng dùng. Ví triển khai có quyền admin và collector. Không triển khai mới khi chuyển trình duyệt.

Bạn cần tự xác nhận các yêu cầu trong Core. App không giữ seed phrase hoặc private key. Nếu trình duyệt bên trong Codex báo chưa có ví, hãy copy URL sang Chrome/Edge đã cài Core. Không thể dùng extension của Chrome trong tab Codex không có extension đó.

**Lưu ý:** địa chỉ localhost chỉ truy cập được trên chính máy đang chạy app. Để nhiều người dùng máy/điện thoại khác nhau, host cùng Node app này trên máy chủ có HTTPS và ổ lưu trữ bền vững, rồi chia sẻ URL public đó. Các người dùng phải dùng cùng server ảnh và cùng contract.

## Luồng sử dụng thật

- **Ví A — người tái chế:** chọn Tái chế ngay, vật liệu, khối lượng dự kiến và ảnh JPG/PNG/WebP dưới 10 MB. Core yêu cầu ký xác thực lưu ảnh (không tốn gas), rồi ký giao dịch tạo yêu cầu. Chưa phát ECO ở bước gửi.
- **Ví B — điểm thu gom:** vào Điểm thu gom, kiểm tra yêu cầu, ký để xem ảnh, cân vật liệu thực tế rồi xác nhận. Contract phát ECO cho A. B không được duyệt yêu cầu do chính B gửi.
- **Ví A:** vào Đổi quà. Đổi phần thưởng bằng ECO; token bị đốt, tồn kho giảm, tạo biên nhận với chủ sở hữu là A.
- **Ví B:** kiểm tra người nhận đang kiểm soát đúng ví A và mã biên nhận, giao quà thực tế rồi xác nhận giao quà. Trạng thái được ghi trên chain; không thể giao cùng biên nhận lần hai.
- **Admin:** cấp/thu hồi COLLECTOR_ROLE cho các ví thu gom, thêm phần thưởng, sửa giá/tồn kho/trạng thái hoặc tạm dừng nghiệp vụ.

Đổi tài khoản trong Core sẽ tải lại đúng dữ liệu/quyền của tài khoản mới. Đổi sang sai mạng sẽ chặn thao tác và yêu cầu chuyển lại testnet. Kết nối trước đó được khôi phục bằng `eth_accounts` mà không tự bật hộp thoại ký. Lịch sử tải 100 bản ghi mỗi đợt; dùng Tải thêm lịch sử cũ hơn. App tự refresh khi đang mở sau mỗi 20 giây và khi giao dịch thành công.

Giao dịch chờ được lưu bằng hash trên trình duyệt, kể cả deploy. Nếu tải lại hoặc receipt timeout, mở kết nối và chọn Kiểm tra giao dịch trước khi gửi lại. App hỗ trợ theo dõi giao dịch được tăng phí/thay thế, và không coi giao dịch hủy là deploy thành công.

## Ảnh minh chứng và backend

Node server ở `server/` lưu ảnh tại `.data/<chainId>/<contract>/` cùng metadata người gửi. `.data` không đưa vào Git. Server cần giữ thư mục này khi deploy/restart và cần sao lưu dữ liệu.

- Tạo nonce dùng một lần, hết hạn sau 3 phút; người dùng ký thông điệp có action, chain, contract, wallet, SHA-256 và nonce.
- Upload chỉ nhận ảnh có magic bytes JPG/PNG/WebP, giới hạn 10 MB, kiểm tra hash trùng dữ liệu ký và kiểm tra runtime contract.
- Chủ ảnh được xem; ví khác phải có COLLECTOR_ROLE trên đúng contract. Mỗi lần truy cập cần chữ ký hợp lệ. URL ảnh không công khai; nonce/signature không đi qua query URL.
- Ảnh và metadata tách theo chain và contract. Quyền xem ảnh thay đổi theo quyền collector hiện tại.
- Có giới hạn request và dung lượng mặc định 1 GB. Tăng `MAX_STORAGE_MB` nếu cần; không có chức năng tự xóa ảnh.
- Gửi yêu cầu on-chain bị hủy sau upload có thể để lại ảnh chưa gắn với yêu cầu. Chủ ảnh vẫn có thể xem; gửi lại cùng ảnh bởi cùng ví không tạo bản sao file.

Khi host public: chạy Node sau HTTPS reverse proxy, đặt `APP_ORIGIN=https://ten-mien-cua-ban`, dùng một server/volume dữ liệu dùng chung. Không host frontend riêng mà thiếu route `/api`. `HOST` mặc định `127.0.0.1`; có thể đặt `HOST=0.0.0.0` trên host/container. `API_PORT` mặc định 4174. `.env.example` có các thiết lập.

## Smart contract

`contracts/EcoLoop.sol`: ERC-20 ECO + AccessControl + Pausable từ OpenZeppelin.

- `submit`: material 0 nhựa, 1 giấy, 2 kim loại, 3 thủy tinh; 1 g–1.000 kg; hash khác 0, chưa dùng.
- `approve`: collector, không tự duyệt; chỉ xử lý Pending một lần; dùng khối lượng thực nhận.
- `reject`: collector; Pending → Rejected, không thưởng.
- Rate cố định: nhựa 20, giấy 10, kim loại 40, thủy tinh 8 ECO/kg. ECO có 18 decimals.
- `redeem`: kiểm tra phần thưởng/tồn kho, burn ECO, ghi biên nhận.
- `fulfillRedemption`: collector đánh dấu giao đúng một lần, phát event RewardFulfilled.
- Admin cấp/thu hồi quyền, thêm/cấu hình quà, pause/unpause nghiệp vụ. Pause không khóa chuyển ERC-20.

ECO là token testnet có thể chuyển giữa các ví theo ERC-20; earned là tổng đã kiếm qua tái chế, khác số dư sau chuyển/đổi quà. App không cung cấp mua bán hoặc quy đổi tiền. Địa chỉ ví, vật liệu, khối lượng, hash và giao dịch trên chain là công khai. Ảnh chỉ lưu trên server ngoài chain.

Blockchain không tự xác minh rác ngoài đời. Collector là bên được tin cậy; cân/giao nhận vẫn do người tổ chức thực hiện. Chống trùng hash chỉ ngăn dùng lại đúng file, không ngăn sửa ảnh, Sybil hoặc thông đồng. Quà do người tổ chức tự cung cấp; không có tài trợ, cửa hàng hay voucher thương mại được tích hợp sẵn. Chưa audit để sử dụng với tài sản thật.

## Kiểm thử

```powershell
npm test
npm run build
node scripts/smoke-local.mjs
```

Bộ test gồm quyền/khối lượng/phát thưởng/burn/tồn kho/pause/giao quà một lần trên EVM; demo; ảnh với chữ ký, nonce dùng một lần, hash, quyền và persistence; adapter EIP-1193/6963 mô phỏng Core chạy luồng kết nối → add/switch chain → deploy → submit → approve → redeem → fulfill → khôi phục receipt. Không đồng nghĩa đã ký bằng extension Core thật trên Fuji: bước này cần ví người dùng có AVAX testnet.

## Chạy blockchain local

Terminal 1: `npm run chain`. Terminal 2: `npm run deploy:local`, sau đó `npm run dev`. Script ghi `.env.local` với chain 31337, RPC local và địa chỉ contract. Core cần hai tài khoản local phù hợp để làm người tái chế và collector.

Muốn quay lại Fuji: cấu hình `.env.local` thành chain 43113/RPC Fuji và bỏ địa chỉ local, hoặc xóa file cấu hình local bạn đã tạo, rồi restart app. Cấu hình browser được lưu riêng cho từng chain. Smoke test tự khôi phục .env.local và đóng chain tạm; `deployments/31337.json` từ smoke test chỉ là bản ghi kiểm thử, không phải node đang hoạt động.

Nếu muốn deploy bằng CLI thay vì Core, vẫn có `npm run deploy:fuji` sử dụng `DEPLOYER_PRIVATE_KEY` từ .env (ví testnet riêng). Không gửi key vào chat, không dùng biến `VITE_` cho key và không commit file .env.

## Nguồn

- Fuji chain ID 43113, RPC https://api.avax-test.network/ext/bc/C/rpc
- Avalanche: https://build.avax.network/docs/dapps
- Core: https://core.app/
- EIP-6963: https://eips.ethereum.org/EIPS/eip-6963

React + TypeScript + Vite, viem, Solidity 0.8.37, Hardhat 3, OpenZeppelin 5, Node HTTP/filesystem backend. Giao diện và thương hiệu EcoLoop được xây mới, lấy cảm hứng từ mô hình tái chế nhận thưởng của Relotto.


## Giao diện ứng dụng

EcoLoop là app tái chế và nhận thưởng: tổng quan ví ECO, tạo yêu cầu theo loại vật liệu, theo dõi xác nhận, đổi quà, xác nhận giao quà và quản trị theo quyền ví. Giao diện tối lấy cảm hứng phong cách sản phẩm tham chiếu; không có canvas, node editor hoặc công cụ tạo workflow.

## Bản hoàn thiện MVP

- Contract chung được server cung cấp qua `/api/config` từ `config/app.json`. Chrome/Edge mới tự dùng cùng hệ thống; bytecode được kiểm tra khi tải tài khoản.
- Chọn không gian Người tái chế / Thu gom / Quản trị ở thanh bên. Chỉ hiện vai trò mà ví được cấp, demo cho phép thử mọi vai trò.
- Chi tiết REC hiển thị tiến trình, khối lượng dự kiến/thực tế, ECO, ảnh có kiểm soát truy cập và tra giao dịch gần đây.
- Trùng ảnh được kiểm tra bằng mô phỏng contract trước khi ký tải ảnh. Lỗi custom và lỗi ví được giải thích bằng tiếng Việt.
- Biên nhận ECO-xxxx là mã tham chiếu công khai. Khi giao quà phải đối chiếu đúng ví và đúng contract, không chỉ mã biên nhận.
- Hướng dẫn triển khai Node/Docker, lưu trữ bền vững và demo hai ví nằm trong [docs/DEPLOY.md](docs/DEPLOY.md).

## Cập nhật theo mentor: Thu gom tận nơi

Đã bổ sung lô nhiều vật liệu, bản đồ khu vực, xác nhận hai phía, thông tin bàn giao riêng tư và chuẩn bị Google/ví nhúng. Xem [hướng dẫn kích hoạt V2, dùng demo và cấu hình thirdweb](docs/MENTOR-UPGRADE.md). Contract cũ và ECO cũ được giữ nguyên; V2 cần ví quản trị triển khai và kích hoạt, Google cần Client ID.

## Thiết lập: ngôn ngữ, giao diện, đơn vị, thông báo

Trang **Thiết lập** (menu bên trái hoặc nút cuối thanh điều hướng điện thoại) có:

- **Ngôn ngữ**: Tiếng Việt / English / Theo hệ thống. Đổi là áp dụng ngay cho toàn app, kể cả thông báo lỗi từ ví, contract và server.
- **Giao diện**: Sáng / Tối / Theo hệ thống; cỡ chữ Nhỏ → Rất lớn; giảm hiệu ứng chuyển động.
- **Đơn vị & định dạng**: hiển thị khối lượng bằng kg hoặc lb (ô nhập và hợp đồng vẫn dùng kg); định dạng số `1.234,5` hoặc `1,234.5`.
- **Thông báo trình duyệt**: báo khi lô của bạn đổi trạng thái lúc đang ở tab khác, có nút gửi thử.
- **Tài khoản & mạng**, **Dữ liệu & bộ nhớ** (xóa dữ liệu lưu trên máy, đặt lại thiết lập), **Giới thiệu** (phiên bản, mã nguồn, báo lỗi).

**Giao diện điện thoại**: app tự chuyển giữa giao diện máy tính và điện thoại theo kích thước màn hình (dưới 768px, hoặc điện thoại xoay ngang), đổi ngay khi xoay máy hay kéo cửa sổ. Trên điện thoại có thanh tab dưới cùng với nút **Đăng lô** ở giữa, ô tìm kiếm + nút **Bộ lọc** thu gọn, thẻ sản phẩm 2 cột, chi tiết lô và tài khoản mở dạng bảng trượt từ dưới lên, lịch sử dạng thẻ. Có thể chọn cố định trong **Thiết lập → Giao diện → Bố cục** (Tự động / Máy tính / Điện thoại). CSS điện thoại nằm ở `src/mobile.css`, áp dụng khi `<html data-layout="mobile">`.

Thiết lập được lưu trong trình duyệt (`localStorage`, khóa `ecoloop-settings-v1`).

Cách thêm chữ mới cho giao diện:

1. Viết chữ tiếng Việt trong `tr('…')` (import từ `src/settings.ts`). Phần thay đổi dùng `{tên}`: `tr('Đã bán {n}', {n: 5})`.
2. Thêm bản tiếng Anh vào `src/i18n.en.ts`.
3. Chạy `npm run i18n:check` để xem còn chữ nào chưa dịch.

Nếu sửa màu trong `src/web.css` hoặc `src/pickup.css`, chạy `npm run theme:dark` để tạo lại `src/theme-dark.css`.

## Hợp đồng thu gom V3: ký quỹ thật, miễn phí gas, chứng nhận NFT

**Ký quỹ AVAX thật.** Khi nhận một lô, người thu gom phải khóa AVAX vào contract, bằng giá ước tính cộng thêm 20%.
- Người thu gom gửi số cân thực tế, chủ lô xác nhận. Contract tự trả AVAX cho chủ lô theo số cân thực tế và hoàn phần dư cho người thu gom.
- Nếu người thu gom trả việc, hoặc quá 7 ngày không xong, toàn bộ AVAX được hoàn lại người thu gom.
- Giá thu mua (AVAX/kg cho từng loại vật liệu) do quản trị viên chỉnh trong **Thiết lập**.

**Miễn phí gas cho hộ gia đình.** Các thao tác đăng lô, xác nhận, yêu cầu cân lại, hủy lô và đổi quà được ký bằng EIP-712. Server EcoLoop gửi giao dịch qua forwarder ERC-2771 và trả phí gas. Contract vẫn ghi nhận đúng ví của hộ gia đình là người thực hiện.
- Cách bật: đặt `RELAYER_PRIVATE_KEY` trong `.env`, dùng **một ví Fuji riêng** có ít AVAX test. Không dùng chung khóa của ví quản trị.
- Server tự giới hạn số lượt: `RELAY_DAILY_LIMIT` (cả ngày) và `RELAY_HOURLY_PER_WALLET` (mỗi ví mỗi giờ).
- Người thu gom vẫn tự trả gas, vì họ phải khóa AVAX.

**Chứng nhận tái chế NFT.** Mỗi lô hoàn tất tạo một NFT (contract `EcoLoopCertificate`, ký hiệu ECOREC) cho chủ lô. NFT ghi số kg của từng vật liệu, ví người thu gom và số AVAX đã trả. Hình ảnh và dữ liệu nằm hoàn toàn trên chain, xem được trên Snowtrace và trong trang **Ví xanh**.

**Chỉ dữ liệu thật.** App đã bỏ hẳn 28 lô mẫu, phần quà mẫu và chế độ demo. Mọi lô, số dư, phần thưởng và chứng nhận đều đọc từ contract V3 trên Avalanche. Lô mới bắt buộc có ảnh thật, và chỉ mã băm của ảnh được ghi lên chain. Cách tạo dữ liệu thật và dữ liệu thử xem ở [docs/DU-LIEU-THAT.md](docs/DU-LIEU-THAT.md).

**Triển khai V3**, chọn một trong hai cách:
- Qua giao diện: vào **Thiết lập** bằng ví quản trị → **Triển khai bằng ví quản trị** (2 giao dịch: forwarder, rồi contract thu gom) → **Kích hoạt dùng chung**. Nếu đang dùng contract V2, app cho phép nâng cấp. Lô và ECO trên V2 không tự chuyển sang V3.
- Qua dòng lệnh: chạy `npm run deploy:pickup:fuji` (cần `DEPLOYER_PRIVATE_KEY` trong `.env`). Script tự ghi địa chỉ mới vào `config/app.json`.
- Sau đó cấp quyền thu gom (`COLLECTOR_ROLE`) cho các ví người thu gom trong **Thiết lập**.
- Nếu chạy trên **Vercel**: server không ghi được `config/app.json`, nên nút **Kích hoạt dùng chung** không dùng được. Hãy chạy `npm run deploy:pickup:fuji` trên máy, commit file `config/app.json` rồi deploy lại. Đặt `RELAYER_PRIVATE_KEY` trong mục **Environment Variables** của Vercel.
