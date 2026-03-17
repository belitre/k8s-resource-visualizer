package main

import (
	"context"
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/belitre/k8s-resource-visualizer/pkg/api"
	"github.com/belitre/k8s-resource-visualizer/pkg/config"
	"github.com/belitre/k8s-resource-visualizer/pkg/k8s"
	"github.com/belitre/k8s-resource-visualizer/pkg/ws"
)

//go:embed frontend/dist/*
var frontendFiles embed.FS

func main() {
	configPath := flag.String("config", os.Getenv("CONFIG_PATH"), "path to config.yaml")
	flag.Parse()

	clusterName := os.Getenv("CLUSTER_NAME")
	if clusterName == "" {
		clusterName = "unknown"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	hub := ws.NewHub()

	manager, err := k8s.NewManager(clusterName, cfg, func(ev k8s.VisualEvent) {
		// Filter by namespace at broadcast time
		if !cfg.ShouldWatchNamespace(ev.Namespace) {
			return
		}
		hub.BroadcastEvent(ev)
	})
	if err != nil {
		log.Fatalf("failed to create k8s manager: %v", err)
	}

	if err := manager.DiscoverAndWatch(); err != nil {
		log.Fatalf("failed to discover and watch resources: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	manager.SetOnResourcesChanged(func(resources []string) {
		hub.BroadcastResourcesUpdated(resources)
	})
	go manager.WatchCRDs(ctx)

	var frontendFS fs.FS
	if os.Getenv("SERVE_FRONTEND") != "false" {
		sub, err := fs.Sub(frontendFiles, "frontend/dist")
		if err != nil {
			log.Fatalf("failed to create frontend fs: %v", err)
		}
		frontendFS = sub
	}

	frontendConfig, err := os.ReadFile("/etc/k8s-resource-visualizer/config.json")
	if err != nil {
		frontendConfig = nil
	}

	handler := &api.Handler{
		Manager:        manager,
		Hub:            hub,
		FrontendConfig: frontendConfig,
		RemoteBackends: cfg.RemoteBackends,
	}

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux, frontendFS)

	corsHandler := corsMiddleware(mux)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("starting server on :%s (cluster: %s)", port, clusterName)
		if err := http.ListenAndServe(":"+port, corsHandler); err != nil {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-sig
	log.Println("shutting down...")
	cancel()
	manager.Stop()
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
