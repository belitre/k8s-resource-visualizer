.PHONY: all build build-backend build-frontend test test-backend test-frontend lint lint-backend lint-frontend clean dev dev-backend dev-frontend

# Default target
all: build

# ── Build ────────────────────────────────────────────────────────────────────

build: build-frontend build-backend

build-backend:
	go build -o bin/k8s-resource-visualizer .

build-frontend:
	cd frontend && npm ci && npm run build

# ── Test ─────────────────────────────────────────────────────────────────────

test: test-backend test-frontend

test-backend:
	go test -v -race ./...

test-frontend:
	cd frontend && npm test -- --run

# ── Lint ─────────────────────────────────────────────────────────────────────

lint: lint-backend lint-frontend

lint-backend:
	go vet ./...

lint-frontend:
	cd frontend && npx tsc --noEmit

# ── Dev ──────────────────────────────────────────────────────────────────────

dev-backend:
	CLUSTER_NAME=local go run .

dev-frontend:
	cd frontend && npm run dev

dev:
	@echo "Run these in two terminals:"
	@echo "  make dev-backend    # Go backend on :8080"
	@echo "  make dev-frontend   # Vite dev server on :5173 (proxies to :8080)"

# ── Docker ───────────────────────────────────────────────────────────────────

docker-build:
	docker build -t k8s-resource-visualizer:latest .

# ── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf bin/
	rm -rf frontend/dist
	rm -rf frontend/node_modules
