# Nullmaps local cho EcoLoop

Nguồn: https://github.com/tuantqse90/nullmaps — checkout tại `.tools/nullmaps`, revision `9407cadde6b1eb89ffbeeeb9788a488d140671b9`.

Đã tích hợp MapLibre + PMTiles protocol, đánh dấu lô, bấm chọn tọa độ và tìm địa điểm qua geocoder. Không gọi mặc định `maps.nullshift.sh` của tác giả. Không sinh bản đồ hoặc kết quả địa chỉ giả. Không tự chuyển về OpenStreetMap tile server khi Nullmaps lỗi.

## Trạng thái chuẩn bị

- Mã nguồn đã tải, cấu hình local tại `infra/nullmaps.compose.yml`.
- Style sáng của Nullmaps đã chuẩn bị, bỏ lớp terrain/contour/hillshade tùy chọn để giảm dữ liệu cần build.
- API key tự tạo được lưu trong `.env.local` đã gitignore; dùng chung giữa adapter Nullmaps và Node EcoLoop. Không cần gửi key vào chat. Không dùng tên biến `VITE_` cho key.
- Docker Engine cần chạy trước khi bật các dịch vụ. Chỉ khởi động Docker Desktop chưa đủ: cần chạy `Build` một lần, sau đó `Start`.

## Chạy trên Windows

Mở Docker Desktop và chờ Linux engine sẵn sàng. Trong PowerShell tại `D:\Hackathon`:

```powershell
powershell -NoProfile -File scripts/nullmaps-local.ps1 -Action Prepare
powershell -NoProfile -File scripts/nullmaps-local.ps1 -Action Build
powershell -NoProfile -File scripts/nullmaps-local.ps1 -Action Start
powershell -NoProfile -File scripts/nullmaps-local.ps1 -Action Status
```

`Prepare` đã được chạy. Lệnh này giữ key hiện có và các cấu hình Google/contract. `Build` tải dữ liệu OSM Việt Nam, nguồn nền hỗ trợ, fonts, images Docker, build PMTiles và SQLite geocoder. Dự trù vài GB RAM và ít nhất khoảng 5 GB dung lượng (có thể cần thêm cho Docker images và cache). Lần đầu có thể mất nhiều thời gian. Script không tải toàn bộ dữ liệu OSM thế giới; Planetiler cần một số nguồn nền toàn cầu.

Lớp bờ biển dùng bản lưu OSM ngày 2026-10-18 từ mirror FAU vì nguồn `osmdata.openstreetmap.de` bị ngắt kết nối tại thời điểm cài đặt. Có thể thay bằng tham số `-WaterPolygonsUrl`. Dữ liệu OSM Việt Nam vẫn lấy từ Geofabrik. Thư mục tạm Planetiler đặt trong Linux (`/tmp/planetiler`) để tránh nghẽn I/O qua ổ Windows. Chỉ mục geocoder được tạo bằng container riêng có quyền ghi; dịch vụ geocoder lúc chạy vẫn chỉ đọc dữ liệu.

Nếu PowerShell chặn script, thêm `-ExecutionPolicy Bypass` vào lệnh `powershell` cho lần chạy đó; không cần thay chính sách toàn hệ thống.

Sau khi services sẵn sàng, khởi động lại server EcoLoop bằng `npm start` để đọc `.env.local`. Khi chạy dev dùng `npm run dev`. Mở **Thiết lập → Bản đồ Nullmaps local · kiểm tra kết nối** hoặc bản đồ trong luồng đăng lô/thu gom.

Kiểm tra nền: http://127.0.0.1:8088/style.json và http://127.0.0.1:8088/tiles/vietnam. Không đưa API key vào URL để kiểm tra.

```powershell
# Dừng dịch vụ, giữ dữ liệu
powershell -NoProfile -File scripts/nullmaps-local.ps1 -Action Stop
```

## Kiến trúc

Trình duyệt → `/api/maps/*` trên EcoLoop → Nullmaps gateway `127.0.0.1:8088` → Martin hoặc adapter/geocoder. Node giữ API key, chỉ proxy các đường dẫn cho phép, có giới hạn kích thước/thời gian và từ chối redirect. Style/TileJSON được sửa URL để tile/font/sprite đi qua cùng origin. Key không có trong bundle, response cấu hình hoặc query của trình duyệt.

Geocoder chỉ nhận chuỗi người dùng chủ động tìm. AI normalizer tắt; không gửi địa chỉ cho LLM. Bản đồ cần WebGL. Nếu không tải được, app giữ danh sách và trường nhập tọa độ. Tọa độ lô công khai trên chain vẫn làm tròn khoảng 1 km; lọc khoảng cách vẫn dùng đường chim bay, không phải thời gian chạy xe.

Profile local này chạy nền bản đồ + tìm địa điểm, không triển khai Valhalla/VROOM/Photon, không cung cấp chỉ đường hoặc tối ưu tuyến. Có thể bổ sung sau nếu cần. Dữ liệu © OpenStreetMap contributors (ODbL); ghi nhận Overture Maps theo upstream. Mã upstream MIT, giữ LICENSE tại checkout; các image/data có giấy phép riêng.
