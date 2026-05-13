package services

// DataService giữ lại cho tương lai nếu cần ghi data_points vào PostgreSQL
// Hiện tại dữ liệu time-series được đọc từ InfluxDB Cloud qua InfluxService.
// File này không còn được gọi trong luồng chính.

import (
	"database/sql"
)

type DataService struct {
	db *sql.DB
}

func NewDataService(db *sql.DB) *DataService {
	return &DataService{db: db}
}
