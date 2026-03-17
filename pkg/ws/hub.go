package ws

import (
	"encoding/json"
	"sync"

	"go.uber.org/zap"

	"github.com/belitre/k8s-resource-visualizer/pkg/k8s"
)

// Hub manages WebSocket clients and broadcasts events.
type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
	log     *zap.Logger
}

// NewHub creates a new Hub.
func NewHub(log *zap.Logger) *Hub {
	return &Hub{
		clients: make(map[*Client]bool),
		log:     log,
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = true
	h.log.Info("client connected", zap.Int("total", len(h.clients)))
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
		h.log.Info("client disconnected", zap.Int("total", len(h.clients)))
	}
}

// BroadcastEvent sends a resource event to all connected clients.
func (h *Hub) BroadcastEvent(ev k8s.VisualEvent) {
	h.broadcast("event", ev)
}

// BroadcastResourcesUpdated sends an updated resource list to all connected clients.
func (h *Hub) BroadcastResourcesUpdated(resources []k8s.ResourceInfo) {
	h.broadcast("resources_updated", resources)
}

// BroadcastNamespacesUpdated sends an updated namespace list to all connected clients.
func (h *Hub) BroadcastNamespacesUpdated(namespaces []string) {
	h.broadcast("namespaces_updated", namespaces)
}

func (h *Hub) broadcast(msgType string, data any) {
	msg := ServerMessage{Type: msgType, Data: data}
	bytes, err := json.Marshal(msg)
	if err != nil {
		h.log.Error("error marshaling message", zap.String("type", msgType), zap.Error(err))
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for c := range h.clients {
		select {
		case c.send <- bytes:
		default:
			// client buffer full, skip
		}
	}
}

// ServerMessage is sent from server to client.
type ServerMessage struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}
