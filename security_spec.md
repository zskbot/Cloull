# Đặc Tả Bảo Mật Firestore (Phase 0: Payload-First Security TDD)

## 1. Bất Biến Dữ Liệu (Data Invariants)

1. **Xác thực & Email đã xác minh**: Mọi thao tác đọc/ghi dữ liệu trên `/users`, `/domains`, `/records`, `/forwards`, `/auditLogs` đều yêu cầu `request.auth != null` và `request.auth.token.email_verified == true`.
2. **Cô lập chủ sở hữu & PII**: Hồ sơ tại `/users/{userId}` chỉ chủ sở hữu (`request.auth.uid == userId`) mới được đọc hoặc ghi; không cho phép liệt kê toàn bộ danh sách `/users`.
3. **Tách biệt khóa bí mật 2FA**: Khóa TOTP nằm tại `/users/{userId}/security/totp` (`securityId == 'totp'`), chỉ chủ sở hữu được đọc/ghi/xóa, tách khỏi hồ sơ thông thường.
4. **Master Gate cho tài nguyên con**: Mọi thao tác đọc/tạo/cập nhật/xóa trên `/domains/{domainId}/records/{recordId}`, `/forwards/{forwardId}`, và `/auditLogs/{logId}` bắt buộc gọi `get(/databases/$(database)/documents/domains/$(domainId)).data.ownerId == request.auth.uid` và khớp `domainId`.
5. **Nhật ký kiểm toán bất biến (Append-only Audit Log)**: Tài liệu trong `/domains/{domainId}/auditLogs/{logId}` chỉ cho phép `create` bởi chủ sở hữu với `createdAt == request.time`, cấm tuyệt đối `update` và `delete`.
6. **Truy vấn `list` an toàn (Query Enforcer)**: Mọi `allow list` đều kiểm tra trực tiếp `resource.data.ownerId == request.auth.uid`, không bao giờ tin tưởng bộ lọc từ phía client và không đặt `get()`/`exists()` trong `allow list`.
7. **Bất biến trường bất tử & Dấu thời gian máy chủ**: `ownerId`, `domainId`, `createdAt`, `name` (tên miền) không thể bị thay đổi sau khi tạo; `createdAt == request.time` khi tạo mới và `updatedAt == request.time` khi cập nhật.
8. **Khóa trường thừa & Giới hạn dung lượng**: Mọi hàm `isValid*` kiểm tra `keys().hasAll(...)` + `keys().hasOnly(...)`, giới hạn `.size()` cho mọi chuỗi và mảng (`tags.size() <= 10`).

## 2. Bộ 12 Payload Tấn Công ("Dirty Dozen")

1. **Identity Spoofing (Giả mạo chủ sở hữu Domain)**: Tạo `/domains/dom_evil` với `ownerId: "other-user-uid"` khác `request.auth.uid`. -> Kỳ vọng: `PERMISSION_DENIED`.
2. **Shadow Field Injection (Tiêm trường ẩn)**: Tạo `/domains/dom_1` kèm trường lạ `isVerified: true` hoặc `role: "admin"`. -> Kỳ vọng: `PERMISSION_DENIED`.
3. **Unverified Email Bypass (Email chưa xác minh)**: Ghi vào `/users/{uid}` khi `request.auth.token.email_verified == false`. -> Kỳ vọng: `PERMISSION_DENIED`.
4. **ID Poisoning (Đầu độc ID tài liệu)**: Tạo `/domains/invalid$id!with/spaces` hoặc ID dài > 128 ký tự. -> Kỳ vọng: `PERMISSION_DENIED`.
5. **Orphan Record Write (Ghi bản ghi vào tên miền của người khác)**: Tạo `/domains/victim_domain/records/rec_1` với `ownerId == attackerUid`. -> Kỳ vọng: `PERMISSION_DENIED` (bị chặn bởi Master Gate `get()`).
6. **Parent Mismatch (Sai lệch `domainId`)**: Tạo `/domains/dom_a/records/rec_1` nhưng đặt `domainId: "dom_b"`. -> Kỳ vọng: `PERMISSION_DENIED`.
7. **Immutable Field Tampering (Sửa `ownerId` hoặc `createdAt`)**: Gửi `update` thay đổi `ownerId` hoặc `createdAt` trên `/domains/dom_a`. -> Kỳ vọng: `PERMISSION_DENIED`.
8. **Client Timestamp Forgery (Giả mạo thời gian client)**: Gửi `createdAt` là một ngày tự chọn thay vì `request.time`. -> Kỳ vọng: `PERMISSION_DENIED`.
9. **Value Poisoning on Update (Giá trị sai kiểu / vượt dung lượng)**: Cập nhật `ttl: -5` hoặc `value` dài > 2048 ký tự trên bản ghi DNS. -> Kỳ vọng: `PERMISSION_DENIED`.
10. **Array Exhaustion (Bơm mảng `tags` khổng lồ)**: Gửi `tags` có 15 phần tử (> giới hạn 10) hoặc phần tử đầu là số nguyên. -> Kỳ vọng: `PERMISSION_DENIED`.
11. **PII Cross-User Read / Blanket List**: Người dùng B gọi `get(/users/userA)` hoặc `list(/domains)` không lọc `where('ownerId', '==', userB)`. -> Kỳ vọng: `PERMISSION_DENIED`.
12. **Audit Log Tampering / Invalid Security Subdocument**: Gửi `update` hoặc `delete` lên `/domains/dom_a/auditLogs/log_1`, hoặc tạo `/users/{uid}/security/custom_id` với `secret: "invalid-lowercase"`. -> Kỳ vọng: `PERMISSION_DENIED`.
