package ws

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"go.uber.org/zap"

	"github.com/belitre/k8s-resource-visualizer/pkg/k8s"
)

func newTestClient(hub *Hub) *Client {
	return &Client{
		hub:  hub,
		conn: nil,
		send: make(chan []byte, sendBufSz),
		log:  zap.NewNop(),
	}
}

func TestHubRegisterUnregister(t *testing.T) {
	hub := NewHub(zap.NewNop())
	c := newTestClient(hub)

	hub.Register(c)
	hub.mu.RLock()
	if len(hub.clients) != 1 {
		t.Errorf("expected 1 client, got %d", len(hub.clients))
	}
	hub.mu.RUnlock()

	hub.Unregister(c)
	hub.mu.RLock()
	if len(hub.clients) != 0 {
		t.Errorf("expected 0 clients, got %d", len(hub.clients))
	}
	hub.mu.RUnlock()
}

func TestHubUnregisterClosesChannel(t *testing.T) {
	hub := NewHub(zap.NewNop())
	c := newTestClient(hub)

	hub.Register(c)
	hub.Unregister(c)

	_, ok := <-c.send
	if ok {
		t.Error("expected send channel to be closed")
	}
}

func TestHubUnregisterIdempotent(t *testing.T) {
	hub := NewHub(zap.NewNop())
	c := newTestClient(hub)

	hub.Register(c)
	hub.Unregister(c)
	hub.Unregister(c) // should not panic
}

func TestHubBroadcastEvent(t *testing.T) {
	hub := NewHub(zap.NewNop())
	c1 := newTestClient(hub)
	c2 := newTestClient(hub)

	hub.Register(c1)
	hub.Register(c2)

	event := k8s.VisualEvent{
		ID:           "test-id",
		Cluster:      "test-cluster",
		Action:       "CREATED",
		ResourceType: "deployments.apps",
		Name:         "my-deploy",
		Namespace:    "default",
	}

	hub.BroadcastEvent(event)

	for i, c := range []*Client{c1, c2} {
		select {
		case msg := <-c.send:
			var sm ServerMessage
			if err := json.Unmarshal(msg, &sm); err != nil {
				t.Fatalf("client %d: unmarshal error: %v", i, err)
			}
			if sm.Type != "event" {
				t.Errorf("client %d: Type = %q, want %q", i, sm.Type, "event")
			}
		case <-time.After(time.Second):
			t.Fatalf("client %d: timed out", i)
		}
	}
}

func TestHubBroadcastSkipsFullBuffer(t *testing.T) {
	hub := NewHub(zap.NewNop())
	c := &Client{
		hub:  hub,
		conn: nil,
		send: make(chan []byte, 1),
		log:  zap.NewNop(),
	}

	hub.Register(c)
	c.send <- []byte("filler")

	event := k8s.VisualEvent{ID: "test"}
	hub.BroadcastEvent(event) // should not block
}

func TestHubConcurrentBroadcast(t *testing.T) {
	hub := NewHub(zap.NewNop())
	clients := make([]*Client, 10)
	for i := range clients {
		clients[i] = newTestClient(hub)
		hub.Register(clients[i])
	}

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			hub.BroadcastEvent(k8s.VisualEvent{ID: "event"})
		}(i)
	}
	wg.Wait()
}
