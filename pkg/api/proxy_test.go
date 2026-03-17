package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/belitre/k8s-resource-visualizer/pkg/config"
)

// newProxyHandler builds a minimal Handler with the given remote backends and returns a ready mux.
func newProxyHandler(backends []config.RemoteBackend) (*Handler, *http.ServeMux) {
	h := &Handler{RemoteBackends: backends}
	mux := http.NewServeMux()
	h.RegisterRoutes(mux, nil)
	return h, mux
}

func TestHandleProxyBackendsEmpty(t *testing.T) {
	_, mux := newProxyHandler(nil)

	req := httptest.NewRequest("GET", "/api/proxy-backends", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var result []ProxyBackendInfo
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty list, got %d items", len(result))
	}
}

func TestHandleProxyBackendsList(t *testing.T) {
	_, mux := newProxyHandler([]config.RemoteBackend{
		{Name: "cluster-b", URL: "http://b:8080", Color: "#3b82f6"},
		{Name: "cluster-c", URL: "http://c:8080"},
	})

	req := httptest.NewRequest("GET", "/api/proxy-backends", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var result []ProxyBackendInfo
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(result) != 2 {
		t.Fatalf("expected 2 backends, got %d", len(result))
	}
	if result[0].Name != "cluster-b" || result[0].Color != "#3b82f6" {
		t.Errorf("unexpected first backend: %+v", result[0])
	}
	if result[1].Name != "cluster-c" || result[1].Color != "" {
		t.Errorf("unexpected second backend: %+v", result[1])
	}
}

func TestToWSURL(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"http://example.com", "ws://example.com"},
		{"https://example.com", "wss://example.com"},
		{"http://localhost:8080", "ws://localhost:8080"},
	}
	for _, tt := range tests {
		got := toWSURL(tt.in)
		if got != tt.want {
			t.Errorf("toWSURL(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestRemoteBackendLookup(t *testing.T) {
	h := &Handler{
		RemoteBackends: []config.RemoteBackend{
			{Name: "cluster-b", URL: "http://b:8080"},
		},
	}

	if b, ok := h.remoteBackend("cluster-b"); !ok || b.URL != "http://b:8080" {
		t.Errorf("expected to find cluster-b, got %+v %v", b, ok)
	}
	if _, ok := h.remoteBackend("unknown"); ok {
		t.Error("expected not to find unknown backend")
	}
}

func TestHandleProxyAPIForwardsResponse(t *testing.T) {
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/info" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"clusterName":"remote-cluster"}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer remote.Close()

	_, mux := newProxyHandler([]config.RemoteBackend{{Name: "remote", URL: remote.URL}})

	req := httptest.NewRequest("GET", "/proxy/remote/api/info", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "remote-cluster") {
		t.Errorf("body %q does not contain expected cluster name", w.Body.String())
	}
}

func TestHandleProxyAPIUnknownBackend(t *testing.T) {
	_, mux := newProxyHandler([]config.RemoteBackend{{Name: "known", URL: "http://localhost:9999"}})

	req := httptest.NewRequest("GET", "/proxy/unknown/api/info", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestHandleProxyAPIUpstreamUnavailable(t *testing.T) {
	_, mux := newProxyHandler([]config.RemoteBackend{{Name: "down", URL: "http://127.0.0.1:19999"}})

	req := httptest.NewRequest("GET", "/proxy/down/api/info", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", w.Code)
	}
}

func TestHandleProxyWSForwardsMessages(t *testing.T) {
	remoteUpgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := remoteUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("remote upgrade: %v", err)
			return
		}
		defer conn.Close()
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"event","data":"hello"}`))
		time.Sleep(100 * time.Millisecond)
	}))
	defer remote.Close()

	_, mux := newProxyHandler([]config.RemoteBackend{{Name: "remote", URL: remote.URL}})
	proxy := httptest.NewServer(mux)
	defer proxy.Close()

	wsURL := "ws" + strings.TrimPrefix(proxy.URL, "http") + "/proxy/remote/ws"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial proxy WS: %v", err)
	}
	defer conn.Close()

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read from proxy: %v", err)
	}
	if string(msg) != `{"type":"event","data":"hello"}` {
		t.Errorf("got %q", msg)
	}
}

func TestHandleProxyWSUnknownBackend(t *testing.T) {
	_, mux := newProxyHandler([]config.RemoteBackend{{Name: "known", URL: "http://localhost:9999"}})
	proxy := httptest.NewServer(mux)
	defer proxy.Close()

	wsURL := "ws" + strings.TrimPrefix(proxy.URL, "http") + "/proxy/unknown/ws"
	_, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		t.Fatal("expected dial to fail for unknown backend")
	}
	if resp != nil && resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}
