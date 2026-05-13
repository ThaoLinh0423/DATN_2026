package handlers

import (
	"log"
	"net/http"

	"air-quality-api/services"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type WebSocketHandler struct {
	wsService *services.WebSocketService
}

func NewWebSocketHandler(wsService *services.WebSocketService) *WebSocketHandler {
	return &WebSocketHandler{wsService: wsService}
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		log.Printf("WebSocket CheckOrigin - Origin: %s", origin)
		return true
	},
}

func (h *WebSocketHandler) HandleConnection(c *gin.Context) {
	log.Println("WebSocket connection attempt")
	
	// Get userID from context
	userIDInterface, exists := c.Get("userID")
	if !exists {
		log.Println("WebSocket - No userID in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized - No userID"})
		return
	}

	userID := userIDInterface.(string)
	log.Printf("WebSocket - UserID found: %s", userID)

	// Get userRole from context (for logging)
	userRoleInterface, roleExists := c.Get("userRole")
	userRole := "unknown"
	if roleExists {
		userRole = userRoleInterface.(string)
	}
	log.Printf("WebSocket - UserRole: %s", userRole)

	// Upgrade HTTP to WebSocket
	log.Println("Attempting WebSocket upgrade...")
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	log.Println("WebSocket upgrade successful")

	// Register client
	client := h.wsService.RegisterClient(conn, userID)
	log.Printf("WebSocket client registered: ID=%s, UserID=%s, Role=%s", client.ID, userID, userRole)
}