package main

import (
	"context"
	"embed"
	"flag"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/belitre/k8s-resource-visualizer/pkg/api"
	"github.com/belitre/k8s-resource-visualizer/pkg/config"
	"github.com/belitre/k8s-resource-visualizer/pkg/k8s"
	"github.com/belitre/k8s-resource-visualizer/pkg/ws"
)

//go:embed frontend/dist/*
var frontendFiles embed.FS

func main() {
	configPath := flag.String("config", os.Getenv("CONFIG_PATH"), "path to config.yaml")
	logLevel := flag.String("log-level", "info", "log level (debug, info, warn, error)")
	flag.Parse()

	logger := buildLogger(*logLevel)
	defer logger.Sync()

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
		logger.Fatal("failed to load config", zap.Error(err))
	}

	hub := ws.NewHub(logger)

	manager, err := k8s.NewManager(clusterName, cfg, func(ev k8s.VisualEvent) {
		// Filter by namespace at broadcast time
		if !cfg.ShouldWatchNamespace(ev.Namespace) {
			return
		}
		hub.BroadcastEvent(ev)
	}, logger)
	if err != nil {
		logger.Fatal("failed to create k8s manager", zap.Error(err))
	}

	if err := manager.DiscoverAndWatch(); err != nil {
		logger.Fatal("failed to discover and watch resources", zap.Error(err))
	}

	ctx, cancel := context.WithCancel(context.Background())
	manager.SetOnResourcesChanged(func(resources []k8s.ResourceInfo) {
		hub.BroadcastResourcesUpdated(resources)
	})
	manager.SetOnNamespacesChanged(func(namespaces []string) {
		hub.BroadcastNamespacesUpdated(namespaces)
	})
	go manager.WatchCRDs(ctx)
	go manager.WatchNamespaces(ctx)

	var frontendFS fs.FS
	if os.Getenv("SERVE_FRONTEND") != "false" {
		sub, err := fs.Sub(frontendFiles, "frontend/dist")
		if err != nil {
			logger.Fatal("failed to create frontend fs", zap.Error(err))
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
		Log:            logger,
	}

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux, frontendFS)

	corsHandler := corsMiddleware(mux)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Info("starting server", zap.String("port", port), zap.String("cluster", clusterName))
		if err := http.ListenAndServe(":"+port, corsHandler); err != nil {
			logger.Fatal("server error", zap.Error(err))
		}
	}()

	<-sig
	logger.Info("shutting down")
	cancel()
	manager.Stop()
}

func buildLogger(level string) *zap.Logger {
	var lvl zapcore.Level
	if err := lvl.UnmarshalText([]byte(level)); err != nil {
		lvl = zapcore.InfoLevel
	}
	cfg := zap.NewProductionConfig()
	cfg.Level = zap.NewAtomicLevelAt(lvl)
	logger, _ := cfg.Build()
	return logger
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
