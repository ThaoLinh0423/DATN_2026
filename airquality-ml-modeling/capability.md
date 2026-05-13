# Model Capability Guide

Tài liệu này mô tả kiến trúc suy luận hiện tại sau khi đổi sang luồng request-driven.

## 1. Kiến trúc hiện tại

CSV chỉ còn dùng cho train và retrain.

Khi predict:

1. Backend của bạn lấy `n` điểm quan trắc mới nhất
2. Backend gọi `POST /forecast/{model_key}`
3. Backend gửi `points[]` trong request body
4. API ML dựng `DataFrame` từ payload đó
5. API ML forecast `m` điểm tiếp theo
6. API trả lại `forecast[]` và `alerts`

Điểm quan trọng:

- API không còn đọc CSV ở bước forecast
- Input forecast đến trực tiếp từ backend
- `model_key` chọn model
- `points[]` mang dữ liệu lịch sử để suy luận

## 2. Endpoint ML

| Method | Path | Mục đích |
|---|---|---|
| `GET` | `/health` | Kiểm tra trạng thái service và device |
| `GET` | `/models` | Liệt kê model được bật và trạng thái cache |
| `POST` | `/models/{model_key}/load` | Warm-up model vào RAM |
| `POST` | `/forecast/{model_key}` | Forecast từ payload backend |
| `DELETE` | `/cache` | Xóa toàn bộ model khỏi cache |
| `DELETE` | `/cache/{model_key}` | Xóa một model khỏi cache |

## 3. Input của endpoint forecast

Endpoint:

```http
POST /forecast/{model_key}
Content-Type: application/json
```

Body mẫu:

```json
{
  "points": [
    {
      "timestamp": "2026-02-26T23:30:00+00:00",
      "pm1_0": 34.2,
      "pm2_5": 58.1,
      "pm10": 76.8,
      "aqi": 118.4
    },
    {
      "timestamp": "2026-02-26T23:35:00+00:00",
      "pm1_0": 33.9,
      "pm2_5": 57.6,
      "pm10": 75.9,
      "aqi": 116.8
    }
  ]
}
```

Yêu cầu chung:

- `points` không được rỗng
- Mỗi điểm phải có `timestamp` hợp lệ theo ISO 8601
- Dữ liệu sẽ được sort theo `timestamp` trước khi suy luận

Yêu cầu feature:

- `lstm`, `gru`, `bilstm`, `informer` cần đủ:
  - `pm1_0`
  - `pm2_5`
  - `pm10`
  - `aqi`
- `arima` chỉ bắt buộc:
  - `aqi`

Feature thời gian như `hour_sin`, `hour_cos`, `dow_sin`, `dow_cos` sẽ được API tự sinh từ `timestamp`.

## 4. Điều khiển số điểm input và output ở deploy

Cấu hình trong `configs/deploy_config.py`:

| Biến | Ý nghĩa |
|---|---|
| `FORECAST_INPUT_POINTS` | Chỉ lấy `n` điểm cuối cùng từ request payload để đưa vào model |
| `FORECAST_OUTPUT_POINTS` | Chỉ trả lại `m` điểm forecast đầu tiên cho backend |

Ví dụ:

- Backend gửi 288 điểm của 1 ngày
- `FORECAST_INPUT_POINTS=48`
- API chỉ lấy 48 điểm cuối cùng để forecast

Ràng buộc:

- Với `lstm`, `gru`, `bilstm`, `informer`, `FORECAST_INPUT_POINTS` phải `>= look_back` của model đã train
- `FORECAST_OUTPUT_POINTS` phải `<= horizon` mà model sinh ra

Nếu bạn muốn:

- lấy `n` điểm trước đó
- dự báo `m` điểm tiếp theo

thì có hai lớp điều khiển:

1. Artifact đã train:
   - `LOOK_BACK`
   - `HORIZON`
2. Runtime deploy:
   - `FORECAST_INPUT_POINTS`
   - `FORECAST_OUTPUT_POINTS`

Khuyến nghị:

- Nếu muốn mô hình thực sự học đúng bài toán `n -> m`, hãy retrain với:
  - `LOOK_BACK=n`
  - `HORIZON=m`
- Sau đó ở deploy đặt:
  - `FORECAST_INPUT_POINTS=n`
  - `FORECAST_OUTPUT_POINTS=m`

## 5. Output của endpoint forecast

Response mẫu:

```json
{
  "model": "lstm",
  "target_column": "aqi",
  "horizon": 6,
  "resample_freq": "5min",
  "forecast": [
    {
      "timestamp": "2026-02-27T00:00:00+00:00",
      "aqi": 137.08
    }
  ],
  "alerts": {
    "aqi": [
      {
        "timestamp": "2026-02-27T00:10:00+00:00",
        "value": 103.2
      }
    ]
  }
}
```

Ý nghĩa:

| Trường | Ý nghĩa |
|---|---|
| `model` | Model đã dùng để suy luận |
| `target_column` | Mục tiêu chính, hiện là `aqi` |
| `horizon` | Số điểm forecast thực tế trả về sau khi apply `FORECAST_OUTPUT_POINTS` |
| `resample_freq` | Chu kỳ dữ liệu, ví dụ `5min` |
| `forecast` | Danh sách điểm forecast theo thời gian |
| `alerts` | Các điểm vượt ngưỡng theo cấu hình |

## 6. Khả năng từng model

### `arima`

- Loại: univariate statistical model
- Input tối thiểu: chuỗi `aqi`
- Output: forecast `aqi`
- Phù hợp khi cần baseline nhanh và đơn giản

### `lstm`

- Loại: stacked recurrent neural network
- Input: `pm1_0`, `pm2_5`, `pm10`, `aqi` + time features sinh từ timestamp
- Output: forecast `aqi`
- Phù hợp cho rolling forecast nhiều lần trong ngày

### `gru`

- Loại: GRU recurrent neural network
- Input: giống `lstm`
- Output: forecast `aqi`
- Phù hợp khi muốn recurrent model gọn hơn

### `bilstm`

- Loại: bidirectional LSTM
- Input: giống `lstm`
- Output: forecast `aqi`
- Trong quick retrain gần nhất đang cho metric tốt nhất trong nhóm recurrent đã deploy

### `informer`

- Loại: attention-based time-series model
- Input: `pm1_0`, `pm2_5`, `pm10`, `aqi`
- Output: forecast `aqi`
- Cần file metadata để load đúng kiến trúc:
  - `*_informer_meta.joblib`

## 7. Luồng dùng cho backend của bạn

Nếu backend của bạn retrain hằng ngày bằng dữ liệu 1 ngày và forecast liên tục mỗi 30 phút:

1. Job train/retrain dùng CSV hoặc nguồn batch để tạo artifact mới
2. API deploy load artifact mới
3. Mỗi 30 phút backend lấy `n` điểm mới nhất từ nguồn vận hành
4. Backend gọi `POST /forecast/{model_key}`
5. Backend nhận `m` điểm forecast tiếp theo

Nếu bạn chỉ muốn dự báo ngắn hạn mỗi lần gọi:

- Giữ `FORECAST_OUTPUT_POINTS=1` hoặc vài bước nhỏ

Nếu bạn muốn mỗi lần gọi trả cả block dự báo kế tiếp:

- Đặt `FORECAST_OUTPUT_POINTS=m`

## 8. Giới hạn hiện tại

- API hiện chưa nhận metadata ngoài `points[]`; ví dụ chưa có trường riêng cho station_id hoặc source_id
- Tần suất thời gian hiện vẫn bám theo `RESAMPLE_FREQ`
- Nếu payload không đủ feature bắt buộc, API sẽ trả `400`
- Nếu payload có ít điểm hơn `look_back` yêu cầu của model, API sẽ trả `400`
