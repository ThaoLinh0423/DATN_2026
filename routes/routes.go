package routes

import (
	"database/sql"
	"log"
	"time"

	"air-quality-api/config"
	"air-quality-api/handlers"
	"air-quality-api/middleware"
	"air-quality-api/services"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRoutes(db *sql.DB, cfg *config.Config, wsService *services.WebSocketService, influxService *services.InfluxService) *gin.Engine {
	engine := gin.Default()

	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{"*"}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"}
	corsConfig.AllowHeaders = []string{"Content-Type", "Authorization"}
	engine.Use(cors.New(corsConfig))

	authService := services.NewAuthService(db, cfg.JWTSecret)
	userService := services.NewUserService(db)
	sensorService := services.NewSensorService(db)
	settingsService := services.NewSettingsService(db)
	alertService := services.NewAlertService(db)
	mlService := services.NewMLService(cfg)
	adminService := services.NewAdminService(db)

	sensorNodes, err := sensorService.GetAllSensorNodes()
	if err != nil {
		log.Printf("[POLLER] Warning: could not load sensor nodes from DB: %v", err)
	}
	if len(sensorNodes) == 0 {
		log.Println("[POLLER] No active sensors in DB. Add sensors via POST /sensors to start polling.")
	}

	poller := services.NewRealtimePoller(wsService, alertService, influxService, sensorService, sensorNodes, 30*time.Second)
	poller.Start()

	authHandler := handlers.NewAuthHandler(authService)
	userHandler := handlers.NewUserHandler(userService)
	sensorHandler := handlers.NewSensorHandler(sensorService, poller)
	dataHandler := handlers.NewDataHandler(influxService)
	settingsHandler := handlers.NewSettingsHandler(settingsService)
	alertHandler := handlers.NewAlertHandler(alertService)
	wsHandler := handlers.NewWebSocketHandler(wsService)
	forecastHandler := handlers.NewForecastHandler(mlService, influxService)
	adminHandler := handlers.NewAdminHandler(adminService)

	jwtMiddleware := middleware.JWTMiddleware(cfg.JWTSecret)
	optionalJWT := middleware.OptionalJWTMiddleware(cfg.JWTSecret)

	v1 := engine.Group("/v1")
	{
		auth := v1.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.Refresh)
		}

		users := v1.Group("/users")
		users.Use(jwtMiddleware)
		{
			users.GET("/me", userHandler.GetMe)
			users.PUT("/me", userHandler.UpdateMe)
			users.POST("/me/change-password", userHandler.ChangePassword)
			users.GET("/me/sessions", userHandler.GetSessions)
			users.POST("/me/logout", userHandler.Logout)
		}

		sensorsGroup := v1.Group("/sensors")
		{
			// GET /sensors:
			//   - Không token / token sai  → tất cả sensor (public)
			//   - role admin/manager       → tất cả sensor
			//   - role user                → chỉ sensor đã được grant access
			sensorsGroup.GET("", optionalJWT, sensorHandler.GetList)

			// Tạo sensor: admin hoặc manager
			sensorsGroup.POST("", jwtMiddleware, middleware.AdminOrManager(), sensorHandler.Create)

			// Xóa sensor: admin hoặc manager
			sensorsGroup.DELETE("/:sensorId", jwtMiddleware, middleware.AdminOrManager(), sensorHandler.Delete)

			// Quản lý access (ai được xem sensor nào): admin hoặc manager
			sensorAccess := sensorsGroup.Group("/:sensorId/access")
			sensorAccess.Use(jwtMiddleware, middleware.AdminOrManager())
			{
				sensorAccess.GET("", sensorHandler.GetAccessList)
				sensorAccess.POST("", sensorHandler.GrantAccess)
				sensorAccess.DELETE("/:userId", sensorHandler.RevokeAccess)
			}
		}

		data := v1.Group("/data")
		data.Use(jwtMiddleware)
		{
			data.GET("/latest", dataHandler.GetLatest)
			data.GET("/historical", dataHandler.GetHistorical)
		}

		forecast := v1.Group("/forecast")
		forecast.Use(jwtMiddleware)
		{
			forecast.GET("/:modelKey", forecastHandler.GetForecast)
			forecast.POST("/:modelKey", forecastHandler.PredictForecast)
		}

		monitoring := v1.Group("/monitoring")
		monitoring.Use(jwtMiddleware)
		{
			drift := monitoring.Group("/drift/:modelKey")
			{
				drift.GET("/summary", forecastHandler.GetDriftSummary)
				drift.GET("/timeseries", forecastHandler.GetDriftTimeseries)
				drift.GET("/features/latest", forecastHandler.GetLatestFeatureDrift)
			}
		}

		alertsGroup := v1.Group("/alerts")
		alertsGroup.Use(jwtMiddleware)
		{
			alertsGroup.POST("/check", alertHandler.CheckAndCreateAlert)
			alertsGroup.POST("/bulk/update-status", alertHandler.BulkUpdateStatus)
			alertsGroup.GET("/statistics", alertHandler.GetStatistics)
			alertsGroup.GET("", alertHandler.GetList)
			alertsGroup.GET("/:alertId", alertHandler.GetDetail)
			alertsGroup.PUT("/:alertId", alertHandler.Update)
			alertsGroup.DELETE("/:alertId", alertHandler.Delete)
		}

		settings := v1.Group("/settings")
		{
			influxSettings := settings.Group("/influx")
			influxSettings.Use(jwtMiddleware)
			{
				influxSettings.GET("", settingsHandler.GetInfluxSettings)
				influxSettings.PUT("", settingsHandler.UpsertInfluxSettings)
				influxSettings.DELETE("", settingsHandler.DeleteInfluxSettings)
				influxSettings.GET("/discover", settingsHandler.DiscoverDevices)
			}

			generalSettings := settings.Group("/general")
			{
				generalSettings.GET("", settingsHandler.GetGeneralSettings)
				generalSettings.PUT("", jwtMiddleware, middleware.AdminOnly(), settingsHandler.UpdateGeneralSettings)
			}

			notificationSettings := settings.Group("/notifications")
			notificationSettings.Use(jwtMiddleware)
			{
				notificationSettings.GET("", settingsHandler.GetNotificationSettings)
				notificationSettings.PUT("", settingsHandler.UpdateNotificationSettings)
			}

			thresholdSettings := settings.Group("/thresholds")
			{
				thresholdSettings.GET("", settingsHandler.GetThresholdSettings)
				thresholdSettings.PUT("", jwtMiddleware, middleware.AdminOnly(), settingsHandler.UpdateThresholdSettings)
			}

			emailSettings := settings.Group("/email")
			emailSettings.Use(jwtMiddleware, middleware.AdminOnly())
			{
				emailSettings.GET("", settingsHandler.GetEmailSettings)
				emailSettings.PUT("", settingsHandler.UpdateEmailSettings)
				emailSettings.POST("/test", settingsHandler.SendTestEmail)
			}
		}

		admin := v1.Group("/admin")
		admin.Use(jwtMiddleware, middleware.AdminOnly())
		{
			adminUsers := admin.Group("/users")
			{
				adminUsers.GET("", adminHandler.ListUsers)
				adminUsers.GET("/:userId", adminHandler.GetUser)
				adminUsers.PATCH("/:userId/role", adminHandler.UpdateRole)
			}
		}

		ws := v1.Group("/ws")
		ws.Use(jwtMiddleware)
		{
			ws.GET("/realtime", wsHandler.HandleConnection)
		}
	}

	return engine
}
