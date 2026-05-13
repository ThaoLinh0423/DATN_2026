package handlers

import (
	"log"
	"net/http"

	"air-quality-api/models"
	"air-quality-api/services"
	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	userService *services.UserService
}

func NewUserHandler(userService *services.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

func (h *UserHandler) GetMe(c *gin.Context) {
	userID, exists := c.Get("userID")
	
	// DEBUG: Log context values
	log.Printf("GetMe called - userID exists: %v, userID value: %v", exists, userID)
	
	if !exists {
		log.Printf("ERROR: userID not found in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "User ID not found in context"}})
		return
	}

	userIDStr := userID.(string)
	log.Printf("Querying user with ID: %s", userIDStr)

	user, err := h.userService.GetByID(userIDStr)
	if err != nil {
		log.Printf("ERROR: GetByID failed - %v", err)
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "User not found"}})
		return
	}

	log.Printf("SUCCESS: User found - %+v", user)
	c.JSON(http.StatusOK, user)
}

func (h *UserHandler) UpdateMe(c *gin.Context) {
	userID, _ := c.Get("userID")

	var req models.UserUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}

	user, err := h.userService.Update(userID.(string), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, user)
}

func (h *UserHandler) ChangePassword(c *gin.Context) {
	userID, _ := c.Get("userID")

	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}

	err := h.userService.ChangePassword(userID.(string), req.CurrentPassword, req.NewPassword)
	if err != nil {
		if err.Error() == "invalid current password" {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_PASSWORD", "message": "Mật khẩu hiện tại không chính xác"}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}

func (h *UserHandler) GetSessions(c *gin.Context) {
	userID, _ := c.Get("userID")

	sessions, err := h.userService.GetSessions(userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": sessions})
}

func (h *UserHandler) Logout(c *gin.Context) {
	userID, _ := c.Get("userID")
	authHeader := c.GetHeader("Authorization")

	err := h.userService.Logout(userID.(string), authHeader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}