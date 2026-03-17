package api

import (
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

// handleProxyWS bridges a client WebSocket connection to a remote backend's /ws endpoint.
// The remote backend name must match an entry in Handler.RemoteBackends.
func (h *Handler) handleProxyWS(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	backend, ok := h.remoteBackend(name)
	if !ok {
		http.NotFound(w, r)
		return
	}

	remoteURL := toWSURL(strings.TrimRight(backend.URL, "/")) + "/ws"
	remoteConn, _, err := websocket.DefaultDialer.Dial(remoteURL, nil)
	if err != nil {
		log.Printf("proxy: failed to connect to remote backend %q (%s): %v", name, remoteURL, err)
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
		return
	}
	defer remoteConn.Close()

	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer clientConn.Close()

	done := make(chan struct{}, 2)

	// Forward messages from remote → client.
	go func() {
		defer func() { done <- struct{}{} }()
		for {
			msgType, msg, err := remoteConn.ReadMessage()
			if err != nil {
				return
			}
			if err := clientConn.WriteMessage(msgType, msg); err != nil {
				return
			}
		}
	}()

	// Drain client messages so we detect disconnects.
	// The protocol is server-push only so there's nothing to forward to the remote.
	go func() {
		defer func() { done <- struct{}{} }()
		for {
			if _, _, err := clientConn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	<-done
}

// handleProxyAPI forwards a REST call to the matching remote backend.
// The URL pattern is /proxy/{name}/api/{path...} where path is info, namespaces, or resources.
func (h *Handler) handleProxyAPI(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	path := r.PathValue("path")
	backend, ok := h.remoteBackend(name)
	if !ok {
		http.NotFound(w, r)
		return
	}

	targetURL := strings.TrimRight(backend.URL, "/") + "/api/" + path
	resp, err := http.Get(targetURL) //nolint:noctx
	if err != nil {
		log.Printf("proxy: upstream %q error for %s: %v", name, path, err)
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body) //nolint:errcheck
}

// toWSURL converts an http:// or https:// URL to ws:// or wss://.
func toWSURL(u string) string {
	if strings.HasPrefix(u, "https://") {
		return "wss://" + strings.TrimPrefix(u, "https://")
	}
	return "ws://" + strings.TrimPrefix(u, "http://")
}
