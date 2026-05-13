package services

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"air-quality-api/models"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type WebSocketMessage struct {
	Type      string          `json:"type"`
	SensorID  string          `json:"sensorId"`
	SensorIDs []string        `json:"sensorIds"`      // ⭐ THÊM DÒNG NÀY
	Data      json.RawMessage `json:"data"`
	Error     string          `json:"error,omitempty"`
}

type Client struct {
	ID       string
	UserID   string
	Conn     *websocket.Conn
	Send     chan interface{}
	Sensors  map[string]bool
	mu       sync.Mutex
}

type WebSocketService struct {
	clients    map[string]*Client
	register   chan *Client
	unregister chan *Client
	broadcast  chan interface{}
	mu         sync.RWMutex
}

func NewWebSocketService() *WebSocketService {
	ws := &WebSocketService{
		clients:    make(map[string]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan interface{}, 256),
	}

	go ws.run()
	return ws
}

func (ws *WebSocketService) RegisterClient(conn *websocket.Conn, userID string) *Client {
	client := &Client{
		ID:      uuid.New().String(),
		UserID:  userID,
		Conn:    conn,
		Send:    make(chan interface{}, 64),
		Sensors: make(map[string]bool),
	}

	ws.register <- client
	return client
}

func (ws *WebSocketService) UnregisterClient(clientID string) {
	ws.mu.RLock()
	client, exists := ws.clients[clientID]
	ws.mu.RUnlock()

	if exists {
		ws.unregister <- client
	}
}

func (ws *WebSocketService) SubscribeSensor(clientID, sensorID string) error {
	ws.mu.RLock()
	client, exists := ws.clients[clientID]
	ws.mu.RUnlock()

	if !exists {
		return nil
	}

	client.mu.Lock()
	client.Sensors[sensorID] = true
	client.mu.Unlock()

	return nil
}

func (ws *WebSocketService) UnsubscribeSensor(clientID, sensorID string) {
	ws.mu.RLock()
	client, exists := ws.clients[clientID]
	ws.mu.RUnlock()

	if exists {
		client.mu.Lock()
		delete(client.Sensors, sensorID)
		client.mu.Unlock()
	}
}

func (ws *WebSocketService) BroadcastData(sensorID string, dataPoint models.DataPoint) {
	msg := WebSocketMessage{
		Type:     "data",
		SensorID: sensorID,
	}

	data, _ := json.Marshal(dataPoint)
	msg.Data = data

	ws.broadcast <- msg
}

func (ws *WebSocketService) run() {
	for {
		select {
		case client := <-ws.register:
			ws.mu.Lock()
			ws.clients[client.ID] = client
			ws.mu.Unlock()
			go client.readPump(ws)
			go client.writePump()
			log.Printf("Client registered: %s", client.ID)

		case client := <-ws.unregister:
			ws.mu.Lock()
			if _, ok := ws.clients[client.ID]; ok {
				delete(ws.clients, client.ID)
				close(client.Send)
			}
			ws.mu.Unlock()
			log.Printf("Client unregistered: %s", client.ID)

		case msg := <-ws.broadcast:
			wsMsg := msg.(WebSocketMessage)
			ws.mu.RLock()
			for _, client := range ws.clients {
				client.mu.Lock()
				if client.Sensors[wsMsg.SensorID] {
					select {
					case client.Send <- wsMsg:
					default:
						log.Printf("Client send channel full: %s", client.ID)
					}
				}
				client.mu.Unlock()
			}
			ws.mu.RUnlock()
		}
	}
}

func (c *Client) readPump(ws *WebSocketService) {
	defer func() {
		ws.UnregisterClient(c.ID)
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		var msg WebSocketMessage
		if err := c.Conn.ReadJSON(&msg); err != nil {
			return
		}

		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))

		switch msg.Type {
		case "subscribe":
			// ⭐ FIX: Xử lý cả array (sensorIds) và single (sensorId)
			if len(msg.SensorIDs) > 0 {
				for _, sensorID := range msg.SensorIDs {
					ws.SubscribeSensor(c.ID, sensorID)
					c.Send <- WebSocketMessage{
						Type:     "subscribed",
						SensorID: sensorID,
					}
					log.Printf("Client %s subscribed to sensor: %s", c.ID, sensorID)
				}
			} else if msg.SensorID != "" {
				ws.SubscribeSensor(c.ID, msg.SensorID)
				c.Send <- WebSocketMessage{
					Type:     "subscribed",
					SensorID: msg.SensorID,
				}
				log.Printf("Client %s subscribed to sensor: %s", c.ID, msg.SensorID)
			}

		case "unsubscribe":
			// ⭐ FIX: Xử lý cả array và single
			if len(msg.SensorIDs) > 0 {
				for _, sensorID := range msg.SensorIDs {
					ws.UnsubscribeSensor(c.ID, sensorID)
					c.Send <- WebSocketMessage{
						Type:     "unsubscribed",
						SensorID: sensorID,
					}
					log.Printf("Client %s unsubscribed from sensor: %s", c.ID, sensorID)
				}
			} else if msg.SensorID != "" {
				ws.UnsubscribeSensor(c.ID, msg.SensorID)
				c.Send <- WebSocketMessage{
					Type:     "unsubscribed",
					SensorID: msg.SensorID,
				}
				log.Printf("Client %s unsubscribed from sensor: %s", c.ID, msg.SensorID)
			}

		case "ping":
			c.Send <- WebSocketMessage{Type: "pong"}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteJSON(msg); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}