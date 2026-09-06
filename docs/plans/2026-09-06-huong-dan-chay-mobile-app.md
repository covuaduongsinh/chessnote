# 📱 HƯỚNG DẪN CHẠY VÀ XUẤT ỨNG DỤNG CHESSNOTE MOBILE (ANDROID & IOS)
> **Mục tiêu**: Hướng dẫn chi tiết cách chạy thử nghiệm, debug và build file cài đặt `.apk` / `.aab` cho ứng dụng ChessNote Mobile trên điện thoại thật hoặc máy ảo.

---

## 1. CÁC LỆNH NHANH (QUICK COMMANDS)

| Nhu cầu | Lệnh thực hiện | Ghi chú |
| :--- | :--- | :--- |
| **Cập nhật code & đồng bộ sang Mobile** | `npm run mobile:build` | Chạy sau mỗi lần sửa giao diện/logic |
| **Mở dự án trong Android Studio** | `npm run mobile:android` | Khuyên dùng cho lần đầu thiết lập |
| **Chạy trực tiếp lên máy ảo / điện thoại Android** | `npm run mobile:run:android` | Yêu cầu đã bật máy ảo hoặc cắm điện thoại |
| **Mở dự án trong Xcode (macOS)** | `npm run mobile:ios` | Dành cho nền tảng iOS |
| **Đồng bộ nhanh tài nguyên** | `npm run mobile:sync` | Không build lại client, chỉ copy web assets |

---

## 2. HƯỚNG DẪN CHẠY TRÊN ANDROID (WINDOWS / MAC / LINUX)

### Yêu cầu chuẩn bị (Prerequisites):
1. Đã cài đặt **[Android Studio](https://developer.android.com/studio)**.
2. Trong Android Studio, cài đặt **Android SDK Platform** (ví dụ Android 14 / 15 / API 34+).

---

### Cách 1: Chạy thông qua Android Studio (Khuyên Dùng ⭐)

1. Mở terminal tại thư mục dự án và chạy:
   ```bash
   npm run mobile:android
   ```
   *(Lệnh này sẽ tự động khởi động Android Studio và mở thư mục `android/` của dự án).*
2. Chờ Android Studio đồng bộ Gradle (Gradle Sync) hoàn tất ở góc dưới màn hình.
3. **Chọn thiết bị chạy**:
   - **Máy ảo (Emulator)**: Chọn máy ảo từ danh sách thiết bị (hoặc bấm **Device Manager** -> **Create Device** để tạo máy ảo Pixel/Galaxy).
   - **Điện thoại thật**: Bật chế độ *USB Debugging* (Gỡ lỗi USB) trên điện thoại, cắm cáp USB vào máy tính và chọn thiết bị trong Android Studio.
4. Bấm nút **Run** (biểu tượng tam giác xanh ▶️ hoặc phím tắt `Shift + F10`) để cài đặt và chạy app.

---

### Cách 2: Chạy trực tiếp từ dòng lệnh (Command Line)

1. Khởi động sẵn một máy ảo Android Emulator hoặc cắm điện thoại Android vào máy tính.
2. Chạy lệnh:
   ```bash
   npm run mobile:run:android
   ```
3. Capacitor sẽ tự động biên dịch, cài đặt và mở app lên thiết bị.

---

### Cách 3: Xuất file APK để gửi cài đặt trực tiếp vào điện thoại

Nếu bạn muốn xuất file `.apk` để chép vào điện thoại cài đặt thủ công:

1. Chạy lệnh:
   ```bash
   npm run mobile:build
   cd android
   .\gradlew.bat assembleDebug
   ```
2. File APK sau khi build xong sẽ nằm tại:
   📁 `android/app/build/outputs/apk/debug/app-debug.apk`
3. Bạn chỉ cần gửi file `app-debug.apk` này qua Zalo/Telegram/Google Drive hoặc cắm cáp copy vào điện thoại để cài đặt và trải nghiệm!

---

## 3. HƯỚNG DẪN CHẠY TRÊN IOS (DÀNH CHO MACOS)

1. Đảm bảo máy tính Mac đã cài **Xcode** và **CocoaPods**.
2. Chạy lệnh:
   ```bash
   npm run mobile:ios
   ```
3. Xcode sẽ mở dự án `ios/App`.
4. Chọn máy ảo iPhone (ví dụ iPhone 15 Pro / 16) và bấm nút **Play** ▶️ (`Cmd + R`).

---

## 4. QUY TRÌNH KHI CHỈNH SỬA CODE

Mỗi khi bạn sửa giao diện (HTML/CSS), plugin cờ vua (Board/PGN/Puzzle) hoặc logic ghi chú:
1. Chạy lệnh cập nhật:
   ```bash
   npm run mobile:build
   ```
2. Nếu app đang mở trên điện thoại/máy ảo, chỉ cần bấm **Reload** hoặc chạy lại trong Android Studio để nhận giao diện mới nhất.
