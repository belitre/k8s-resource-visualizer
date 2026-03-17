package api

import (
	"encoding/json"
	"io/fs"
	"net/http"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"github.com/belitre/k8s-resource-visualizer/pkg/config"
	"github.com/belitre/k8s-resource-visualizer/pkg/k8s"
	"github.com/belitre/k8s-resource-visualizer/pkg/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Handler holds the HTTP handlers.
type Handler struct {
	Manager        *k8s.Manager
	Hub            *ws.Hub
	FrontendConfig []byte                 // when non-nil, overrides /config.json
	RemoteBackends []config.RemoteBackend // backends this instance can proxy to
	Log            *zap.Logger
}

// remoteBackend looks up a remote backend by name.
func (h *Handler) remoteBackend(name string) (config.RemoteBackend, bool) {
	for _, b := range h.RemoteBackends {
		if b.Name == name {
			return b, true
		}
	}
	return config.RemoteBackend{}, false
}

// InfoResponse is returned by GET /api/info.
type InfoResponse struct {
	ClusterName string `json:"clusterName"`
}

// RegisterRoutes sets up HTTP routes on the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux, frontendFS fs.FS) {
	mux.HandleFunc("GET /api/info", h.handleInfo)
	mux.HandleFunc("GET /api/namespaces", h.handleNamespaces)
	mux.HandleFunc("GET /api/resources", h.handleResources)
	mux.HandleFunc("GET /api/proxy-backends", h.handleProxyBackends)
	mux.HandleFunc("GET /ws", h.handleWebSocket)

	if h.FrontendConfig != nil {
		mux.HandleFunc("GET /config.json", h.handleFrontendConfig)
	}

	mux.HandleFunc("GET /proxy/{name}/ws", h.handleProxyWS)
	mux.HandleFunc("GET /proxy/{name}/api/{path...}", h.handleProxyAPI)

	if frontendFS != nil {
		mux.Handle("GET /", http.FileServerFS(frontendFS))
	}
}

func (h *Handler) handleFrontendConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(h.FrontendConfig)
}

func (h *Handler) handleInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(InfoResponse{
		ClusterName: h.Manager.ClusterName(),
	})
}

func (h *Handler) handleNamespaces(w http.ResponseWriter, r *http.Request) {
	namespaces, err := h.Manager.ListNamespaces(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(namespaces)
}

func (h *Handler) handleResources(w http.ResponseWriter, r *http.Request) {
	resources := h.Manager.ListWatchedResources()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resources)
}

func (h *Handler) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.Log.Error("websocket upgrade error", zap.Error(err))
		return
	}

	client := ws.NewClient(h.Hub, conn, h.Log)
	h.Hub.Register(client)

	go client.WritePump()
	go client.ReadPump()
}
