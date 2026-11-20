# Bảo mật contract EcoLoop

Contract **chưa được audit**, chỉ dùng trên testnet Fuji. Tài liệu này ghi lại những gì đã kiểm tra tự động và các giả định tin cậy còn lại.

## Kiểm thử

- **119 test** trên EVM thật (Hardhat EDR), chạy trong CI ở mỗi lần push: `npm test`.
- **Fuzz bất biến** (`tests/pickup-invariants.test.mjs`): chuỗi hành động ngẫu nhiên, gồm cả hành động sai vai. Sau mỗi bước kiểm tra:
  1. `totalEscrowed` bằng tổng ký quỹ của từng lô, `totalPaid` bằng tổng đã trả.
  2. Contract luôn giữ đủ ECO cho ký quỹ + quỹ ứng trước (`exchangeInventory` không bao giờ âm).
  3. Bảo toàn quỹ ứng trước: quỹ + ký quỹ đang khóa từ quỹ + đã trả từ quỹ = số đã nạp.
  4. Số đơn tài trợ đang mở của mỗi trạm đúng và không vượt 3.
  5. Tổng cung ECO = số admin đã phát hành (thanh toán ký quỹ không in thêm tiền).
  6. Mỗi lô hoàn tất có đúng một chứng nhận NFT.

## Phân tích tĩnh: Slither 0.11.6

Chạy trong CI cho 5 contract (bỏ qua thư viện OpenZeppelin). CI **fail nếu có lỗi High**.

| Contract | High | Medium | Low |
|---|---|---|---|
| EcoLoopPickup | 0 | 0 | 6 |
| EcoLoopTeleporterBridge | 0 | 1 | 2 |
| EcoLoopRewards | 0 | 0 | 2 |
| EcoLoopForwarder | 0 | 0 | 0 |
| EcoLoopCertificate | 0 | 0 | 0 |

### Đánh giá từng cảnh báo

| Cảnh báo | Mức | Kết luận |
|---|---|---|
| `reentrancy-no-eth` trong `bridgeCertificate`: ghi `outboundMessageIds` sau lệnh gọi `sendCrossChainMessage` | Medium | **Không khai thác được.** Lệnh gọi duy nhất đi tới `teleporterMessenger`, là biến `immutable` trỏ tới TeleporterMessenger canonical của Avalanche (`0x253b…5fcf`). Messenger này chỉ phát sự kiện cho relayer, không gọi ngược lại người gửi. `messageID` chỉ biết sau lệnh gọi nên không ghi trước được. Không sửa source để giữ bytecode khớp bản đã verify trên Snowtrace; nếu deploy lại sẽ thêm `nonReentrant`. |
| `reentrancy-benign`, `reentrancy-events` trong `bridgeCertificate` | Low | Cùng nguyên nhân trên. |
| `timestamp` trong Pickup và Rewards | Low | Cố ý: timeout 7 ngày và mốc ngày điểm danh. Validator chỉ lệch được vài giây, không ảnh hưởng. |
| `missing-zero-check` cho `forwarder` trong constructor Pickup | Low | Chỉ admin deploy; script deploy luôn truyền forwarder vừa tạo. Forwarder bằng 0 chỉ làm tắt chế độ miễn gas, không mất tiền. |

## Các lớp bảo vệ chính

- **Ký quỹ 120%** trước khi nhận đơn; người bán chỉ được trả từ ký quỹ, phần dư hoàn lại người thu gom.
- **Không in ECO ngoài 2 đường có giới hạn:** `adminIssue` (trần 2.000.000 ECO) và thưởng trạm (tối đa 50% mỗi lô). Mọi lệnh mint khác bị chặn trong `_update` (`LegacyMintDisabled`).
- **Chống Sybil:** chỉ lô do ví có `COLLECTOR_ROLE` hoàn tất mới tính vào `verifiedRecycledGrams`, điểm danh, nhiệm vụ và chứng nhận gửi qua ICM.
- **ERC-2771:** chỉ forwarder tin cậy được gắn địa chỉ người gửi; yêu cầu hết hạn bị từ chối.
- **ICM:** bridge đích chỉ nhận từ TeleporterMessenger, chỉ từ bridge nguồn đã đăng ký theo blockchainID, mỗi lô chỉ nhận một lần.
- `nonReentrant` cho các hàm ký quỹ và đổi AVAX trong Pickup (`claimLot`, `claimLotSponsored`, `acceptLot`, `releaseLot`, `buyEco`, `withdrawExchangeProceeds`); `releaseLot` vẫn chạy khi tạm dừng để ký quỹ không bị kẹt.

## Giả định tin cậy còn lại

- Việc cân và giao nhận ngoài đời do người thu gom thực hiện; blockchain không tự xác minh rác.
- Admin có quyền cấp/thu hồi `COLLECTOR_ROLE`, đổi giá, tạm dừng. Chưa có timelock hay multisig.
- Ảnh và thông tin liên hệ lưu ngoài chain trên server (mã hóa AES-256-GCM).
