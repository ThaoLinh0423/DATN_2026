package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"air-quality-api/models"
	"github.com/gin-gonic/gin"
)

// ==================== ADMIN Permissions ====================
func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		userRoleInterface, exists := c.Get("userRole")
		if !exists {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "UNAUTHORIZED",
					Message: "User role not found",
				},
			})
			c.Abort()
			return
		}

		userRole := strings.TrimSpace(strings.ToLower(userRoleInterface.(string)))

		if userRole != "admin" {
			c.JSON(http.StatusForbidden, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "FORBIDDEN",
					Message: fmt.Sprintf("Only admin can access this resource. Your role: %s", userRole),
				},
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// ==================== MANAGER Permissions ====================
func ManagerOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		userRoleInterface, exists := c.Get("userRole")
		if !exists {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "UNAUTHORIZED",
					Message: "User role not found",
				},
			})
			c.Abort()
			return
		}

		userRole := strings.TrimSpace(strings.ToLower(userRoleInterface.(string)))

		if userRole != "manager" {
			c.JSON(http.StatusForbidden, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "FORBIDDEN",
					Message: fmt.Sprintf("Only manager can access this resource. Your role: %s", userRole),
				},
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// ==================== ADMIN OR MANAGER ====================
func AdminOrManager() gin.HandlerFunc {
	return func(c *gin.Context) {
		userRoleInterface, exists := c.Get("userRole")
		if !exists {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "UNAUTHORIZED",
					Message: "User role not found",
				},
			})
			c.Abort()
			return
		}

		userRole := strings.TrimSpace(strings.ToLower(userRoleInterface.(string)))

		if userRole != "admin" && userRole != "manager" {
			c.JSON(http.StatusForbidden, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "FORBIDDEN",
					Message: fmt.Sprintf("Admin or Manager access required. Your role: %s", userRole),
				},
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// ==================== ANY AUTHENTICATED USER ====================
func AnyAuthenticatedUser() gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDInterface, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "UNAUTHORIZED",
					Message: "User not authenticated",
				},
			})
			c.Abort()
			return
		}

		if userIDInterface == nil || userIDInterface == "" {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "UNAUTHORIZED",
					Message: "Invalid user ID",
				},
			})
			c.Abort()
			return
		}

		c.Next()
	}
}