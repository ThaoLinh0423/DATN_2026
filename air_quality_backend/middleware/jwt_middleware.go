package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"air-quality-api/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v4"
)

func JWTMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		var tokenString string

		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}

		if tokenString == "" {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "UNAUTHORIZED",
					Message: "Missing authorization token",
				},
			})
			c.Abort()
			return
		}

		token, err := jwt.ParseWithClaims(tokenString, &jwt.MapClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "UNAUTHORIZED",
					Message: "Invalid or expired token",
				},
			})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(*jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "UNAUTHORIZED",
					Message: "Invalid token claims",
				},
			})
			c.Abort()
			return
		}

		userID, userIDExists := (*claims)["userId"].(string)
		if !userIDExists {
			c.JSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "UNAUTHORIZED",
					Message: "User ID not found in token",
				},
			})
			c.Abort()
			return
		}

		role, roleExists := (*claims)["role"].(string)
		if !roleExists {
			role = "user"
		}

		c.Set("userID", userID)
		c.Set("userRole", role)
		c.Next()
	}
}

// OptionalJWTMiddleware thử parse JWT nếu có, không chặn nếu thiếu/sai.
// Dùng cho các route public nhưng cần biết caller là ai (vd: GET /sensors lọc theo quyền).
// Nếu token hợp lệ: set "userID" và "userRole" vào context như bình thường.
// Nếu không có token hoặc token sai: vẫn tiếp tục, userID/userRole không được set.
func OptionalJWTMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		var tokenString string

		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}
		if tokenString == "" {
			tokenString = c.Query("token")
		}
		if tokenString == "" {
			c.Next()
			return
		}

		token, err := jwt.ParseWithClaims(tokenString, &jwt.MapClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(jwtSecret), nil
		})
		if err != nil || !token.Valid {
			c.Next()
			return
		}

		claims, ok := token.Claims.(*jwt.MapClaims)
		if !ok {
			c.Next()
			return
		}

		if userID, ok := (*claims)["userId"].(string); ok {
			c.Set("userID", userID)
		}
		role, _ := (*claims)["role"].(string)
		if role == "" {
			role = "user"
		}
		c.Set("userRole", role)
		c.Next()
	}
}
