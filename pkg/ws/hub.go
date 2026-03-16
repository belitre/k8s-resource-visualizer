package ws

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/belitre/k8s-resource-visualizer/pkg/k8s"
)

// Hub manages WebSocket clients and broadcasts events.
type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		clients: make(map[*Client]bool),
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = true
	log.Printf("client connected, total: %d", len(h.clients))
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
		log.Printf("client disconnected, total: %d", len(h.clients))
	}
}

// BroadcastEvent sends a resource event to all connected clients.
func (h *Hub) BroadcastEvent(ev k8s.VisualEvent) {
	msg := ServerMessage{
		Type: "event",
		Data: ev,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("error marshaling event: %v", err)
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for c := range h.clients {
		select {
		case c.send <- data:
		default:
			// client buffer full, skip
		}
	}
}

// ServerMessage is sent from server to client.
type ServerMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}
