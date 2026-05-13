package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	// PostgreSQL
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string

	// Server
	ServerPort string
	JWTSecret  string
	Env        string

	// InfluxDB Cloud
	InfluxURL         string
	InfluxToken       string
	InfluxOrg         string
	InfluxBucket      string
	InfluxMeasurement string

	// Default admin account (seed khi khởi động lần đầu)
	// Set ADMIN_EMAIL + ADMIN_PASSWORD trong .env để tự động tạo tài khoản admin
	// Nếu không set, hệ thống bỏ qua seed (không tạo admin mặc định)
	AdminEmail    string
	AdminPassword string

	MLServiceURL string
}

func Load() (*Config, error) {
	godotenv.Load()

	return &Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", "postgres"),
		DBName:     getEnv("DB_NAME", "air_quality"),
		ServerPort: getEnv("SERVER_PORT", "8080"),
		JWTSecret:  getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		Env:        getEnv("ENV", "development"),

		InfluxURL:         getEnv("INFLUX_URL", "https://us-east-1-1.aws.cloud2.influxdata.com"),
		InfluxToken:       getEnv("INFLUX_TOKEN", ""),
		InfluxOrg:         getEnv("INFLUX_ORG", "NCKH"),
		InfluxBucket:      getEnv("INFLUX_BUCKET", "SENSOR"),
		InfluxMeasurement: getEnv("INFLUX_MEASUREMENT", "sensor_data"),

		AdminEmail:    getEnv("ADMIN_EMAIL", ""),
		AdminPassword: getEnv("ADMIN_PASSWORD", ""),
		MLServiceURL:  getEnv("ML_SERVICE_URL", "http://localhost:8000"),
	}, nil
}

func (c *Config) DSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName)
}

func getEnv(key, defaultVal string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultVal
}
