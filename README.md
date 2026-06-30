# Refund Tool

Công cụ tính số tiền hoàn lại (refund) cho khách hàng khi sản phẩm lỗi, dựa trên thời gian chưa sử dụng của gói.

## Cách sử dụng

1. Mở file `index.html` bằng trình duyệt (Chrome, Edge, Firefox…).
2. Nhập **Ngày mua**, **Ngày hết hạn gói**, **Ngày dừng sử dụng** và **Tổng giá trị gói**.
3. Nhấn **Tính refund** để xem kết quả.

## Công thức

```
Tổng số ngày gói  = Ngày hết hạn − Ngày mua + 1        (tính cả 2 đầu)
Số ngày đã dùng   = Ngày dừng − Ngày mua + 1          (tính cả 2 đầu)
Số ngày còn lại   = Tổng số ngày gói − Số ngày đã dùng
Phí đã sử dụng    = (Số ngày đã dùng / Tổng số ngày gói) × Tổng giá trị
Số tiền refund    = (Số ngày còn lại / Tổng số ngày gói) × Tổng giá trị
```

### Ví dụ

- Ngày mua: 01/01/2026
- Ngày hết hạn: 30/01/2026 → **30 ngày**
- Ngày dừng: 11/01/2026 → **11 ngày** đã dùng
- Giá gói: 300.000đ
- Refund: **190.000đ**

## Múi giờ

Mọi phép tính ngày theo chuẩn lịch **Asia/Ho_Chi_Minh** (UTC+7, giờ Việt Nam).

## Cấu trúc

```
refund tool/
├── index.html
├── css/style.css
├── js/calculator.js
└── README.md
```