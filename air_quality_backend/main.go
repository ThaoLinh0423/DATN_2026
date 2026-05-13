package main

import (
	"fmt"
	"log"

	"air-quality-api/config"
	"air-quality-api/database"
	"air-quality-api/routes"
	"air-quality-api/services"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect database: %v", err)
	}
	defer db.Close()

	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Seed tài khoản admin mặc định (chỉ tạo nếu chưa tồn tại)
	// Cấu hình qua ADMIN_EMAIL và ADMIN_PASSWORD trong .env
	if err := database.SeedAdminUser(db, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		log.Fatalf("Failed to seed admin user: %v", err)
	}

	influxService := services.NewInfluxService(cfg)
	defer influxService.Close()

	wsService := services.NewWebSocketService()
	engine := routes.SetupRoutes(db, cfg, wsService, influxService)

	port := cfg.ServerPort
	log.Printf("Server starting on :%s", port)
	if err := engine.Run(fmt.Sprintf(":%s", port)); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
