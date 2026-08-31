# Refund Tool

Công cụ tính số tiền hoàn lại (refund) cho khách hàng khi sản phẩm lỗi, dựa trên **giá thực tế khách đã thanh toán** và thời gian sử dụng thực tế của gói.

## Cách sử dụng

1. Mở file `index.html` bằng trình duyệt (Chrome, Edge, Firefox…).
2. Nhập **Ngày mua**, **Ngày hết hạn gói**, **Ngày dừng sử dụng** và **Tổng giá trị thực tế khách đã thanh toán**.
3. Website tự tính số tiền refund theo chính sách bên dưới.

## Chính sách Refund

Các tham số nghiệp vụ được khai báo tập trung trong `js/calculator.js`:

```text
REPLACEMENT_DAYS = 7
DECAY_POWER = 0.5
```

Website luôn tính thời hạn từ ngày mua và ngày hết hạn thực tế, không mặc định gói là 30 ngày.

### Trong 7 ngày đầu

Không áp dụng khấu hao. Nếu không thể đổi mới 1:1, chỉ trừ phần giá trị thời gian khách đã sử dụng:

```text
Refund = PaidPrice × (TotalDays - UsedDays) / TotalDays
```

Quy tắc này cũng được dùng cho toàn bộ vòng đời của gói có `TotalDays <= 7`.

### Sau 7 ngày

Khi `7 < UsedDays < TotalDays`:

```text
RemainingRatio = (TotalDays - UsedDays) / TotalDays
DecayRatio     = (TotalDays - UsedDays) / (TotalDays - 7)
DecayFactor    = DecayRatio ^ 0.5

Refund = PaidPrice × RemainingRatio × DecayFactor
```

Không còn tỷ lệ khấu trừ cố định 80%. Khách sử dụng càng lâu thì số tiền refund tiếp tục giảm theo hệ số khấu hao động.

### Khi hết thời hạn

Nếu `UsedDays >= TotalDays` thì `Refund = 0`.

Refund cuối cùng luôn được giới hạn trong khoảng từ `0` đến giá thực tế khách đã trả và chỉ làm tròn ở bước cuối.

## Cách tính số ngày

```text
Tổng số ngày gói = Ngày hết hạn − Ngày mua + 1
Số ngày đã dùng  = Ngày dừng − Ngày mua + 1
Số ngày còn lại  = Tổng số ngày gói − Số ngày đã dùng
```

Ngày mua và ngày ngừng đều được tính là ngày sử dụng, giữ nguyên cách tính inclusive của phiên bản trước. Khi chọn thời hạn theo tháng/năm, ngày hết hạn là một ngày trước cùng ngày lịch ở chu kỳ kế tiếp để tránh cộng dư một ngày.

## Múi giờ

Mọi phép tính ngày theo chuẩn lịch **Asia/Ho_Chi_Minh** (UTC+7, giờ Việt Nam).

## Cấu trúc

```text
refund tool/
├── index.html
├── css/style.css
├── js/calculator.js
└── README.md
```
