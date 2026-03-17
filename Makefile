.PHONY: all build build-backend build-frontend test test-backend test-frontend lint lint-backend lint-frontend clean dev dev-backend dev-frontend kind-dev-start kind-dev-stop kind-dev-reload docker-login docker-build docker-push docker-build-push install-semantic-release release release-dry-run frontend-dist-placeholder ci-frontend helm-lint helm-validate helm-login helm-package helm-push

IMAGE ?= ghcr.io/belitre/k8s-resource-visualizer
VERSION ?= latest

CHART_REGISTRY ?= ghcr.io/belitre/charts
CHART_VERSION ?= latest

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

# ── CI ───────────────────────────────────────────────────────────────────────

frontend-dist-placeholder:
	mkdir -p frontend/dist && touch frontend/dist/placeholder

ci-frontend:
	cd frontend && npm ci && npx tsc --noEmit && npm test -- --run && npm run build

# ── Helm ─────────────────────────────────────────────────────────────────────

helm-lint:
	helm lint helm/k8s-resource-visualizer

helm-validate: helm-lint
	helm template test helm/k8s-resource-visualizer
	helm template test helm/k8s-resource-visualizer \
		--set ingress.enabled=true \
		--set ingress.hosts[0].host=example.com \
		--set ingress.hosts[0].paths[0].path=/ \
		--set ingress.hosts[0].paths[0].pathType=Prefix
	helm template test helm/k8s-resource-visualizer \
		--set httpRoute.enabled=true \
		--set httpRoute.hostnames[0]=events.example.com
	helm template test helm/k8s-resource-visualizer \
		--set backendConfig.namespaces.exclude[0]=kube-system \
		--set backendConfig.resources.exclude[0].group="" \
		--set backendConfig.resources.exclude[0].version=v1 \
		--set backendConfig.resources.exclude[0].resource=events
	helm template test helm/k8s-resource-visualizer \
		--set backendConfig.resources.include[0].group=apps \
		--set backendConfig.resources.include[0].version=v1 \
		--set backendConfig.resources.include[0].resource=deployments \
		--set backendConfig.resources.include[1].group="" \
		--set backendConfig.resources.include[1].version=v1 \
		--set backendConfig.resources.include[1].resource=pods

helm-login:
	echo "$(CR_TOKEN)" | helm registry login ghcr.io -u $(CR_USER) --password-stdin

helm-package:
	helm package helm/k8s-resource-visualizer --version $(CHART_VERSION) --app-version $(CHART_VERSION)

helm-push: helm-package
	helm push k8s-resource-visualizer-$(CHART_VERSION).tgz oci://$(CHART_REGISTRY)
	rm k8s-resource-visualizer-$(CHART_VERSION).tgz

# ── Dev ──────────────────────────────────────────────────────────────────────

dev-backend:
	CLUSTER_NAME=local go run .

dev-frontend:
	cd frontend && npm run dev

dev:
	@echo "Run these in two terminals:"
	@echo "  make dev-backend    # Go backend on :8080"
	@echo "  make dev-frontend   # Vite dev server on :5173 (proxies to :8080)"

kind-dev-start:
	@bash scripts/kind-dev-start.sh

kind-dev-stop:
	@bash scripts/kind-dev-stop.sh

kind-dev-reload:
	@bash scripts/kind-dev-reload.sh

# ── Docker ───────────────────────────────────────────────────────────────────

docker-login:
	echo "$(CR_TOKEN)" | docker login ghcr.io -u $(CR_USER) --password-stdin

docker-build:
	docker build -t $(IMAGE):$(VERSION) .

docker-push:
	docker push $(IMAGE):$(VERSION)

docker-build-push: docker-build docker-push

# ── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf bin/
	rm -rf frontend/dist
	rm -rf frontend/node_modules

# ── Semantic release ──────────────────────────────────────────────────────────

install-semantic-release:
	@echo "Installing semantic-release and plugins..."
	npm install -g \
		semantic-release@latest \
		@semantic-release/git@latest \
		@semantic-release/changelog@latest \
		@semantic-release/exec@latest \
		conventional-changelog-conventionalcommits@latest
	@echo "Semantic-release installed successfully!"

release:
	@echo "Running semantic-release..."
	npx semantic-release

release-dry-run:
	@echo "Running semantic-release in dry-run mode..."
	npx semantic-release --dry-run
