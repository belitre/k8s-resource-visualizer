# K8s Resource Visualizer

[![CI](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/ci.yml)
[![Release](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/release.yml/badge.svg)](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/release.yml)
[![Go Version](https://img.shields.io/github/go-mod/go-version/belitre/k8s-resource-visualizer)](go.mod)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

A real-time Kubernetes resource visualizer with a dark-themed UI. Watches actual resources (Pods, Deployments, Services, etc.) for CREATED, UPDATED, and DELETED actions and displays them as colored cards on a canvas. Deploy one backend per cluster and connect the frontend to multiple backends to see resource changes from all clusters.

## Architecture

```
+------------------+     +------------------+
| Cluster A        |     | Cluster B        |
|  Backend (Go)    |     |  Backend (Go)    |
|  - watches all   |     |  - watches all   |
|    resources      |     |    resources     |
|  - serves UI     |     |  - serves UI     |
+--------+---------+     +--------+---------+
         |                         |
         +--- WebSocket/REST ------+
         |                         |
   +-----v-------------------------v-----+
   |          Frontend (React)           |
   |  - connects to multiple backends   |
   |  - aggregates events on canvas     |
   |  - filters by namespace/resource   |
   +-------------------------------------+
```

Each backend:
- Runs inside a K8s cluster (or locally with kubeconfig)
- Uses dynamic client + discovery to watch all API resources
- Filters resources/namespaces via an optional YAML config file
- Streams resource events to the browser via WebSocket
- Identifies itself by the `CLUSTER_NAME` env var

The frontend:
- Connects to one or more backend URLs (pre-configured or added at runtime)
- Displays resource events as colored cards (green=Created, yellow=Updated, red=Deleted)
- Cards fade away after a configurable duration (3-60 seconds)
- Client-side filtering by namespace and resource type

## Prerequisites

- Go 1.25.7+
- Node.js v25.8.1+
- Helm 3+ (for Helm-based deployment)
- A Kubernetes cluster (for deployment) or kubeconfig (for local dev)
- A Gateway API controller (for HTTPRoute, optional)

## Project Structure

```
.
├── main.go                     # Go entry point
├── Dockerfile                  # Multi-stage build (Go 1.25.7 + Node 25.6)
├── Makefile                    # Build, test, lint, docker, helm, release targets
├── pkg/
│   ├── config/
│   │   └── config.go           # YAML config: include/exclude resources & namespaces
│   ├── k8s/
│   │   ├── manager.go          # Discovery + dynamic client management
│   │   └── watcher.go          # Per-GVR resource watcher
│   ├── ws/
│   │   ├── hub.go              # WebSocket hub (broadcast to clients)
│   │   └── client.go           # WebSocket client connection handler
│   └── api/
│       └── handler.go          # HTTP handlers (REST + WebSocket + static files)
├── frontend/                   # React + TypeScript + Vite
│   ├── public/
│   │   └── config.json         # Pre-configured backend URLs (local dev)
│   └── src/
│       ├── components/
│       │   ├── Sidebar.tsx     # Backend management + namespace/resource filters
│       │   ├── EventCanvas.tsx # Canvas container
│       │   └── EventCard.tsx   # Individual event card with fade animation
│       └── hooks/
│           └── useBackendConnection.ts  # WebSocket + REST per backend
├── helm/
│   └── k8s-resource-visualizer/   # Helm chart
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
├── k8s/                        # Raw Kubernetes manifests
│   ├── rbac.yaml               # ServiceAccount + ClusterRole (all resources)
│   ├── deployment.yaml         # Deployment + Service
│   └── httproute.yaml          # Gateway API HTTPRoute
└── .github/
    └── workflows/
        ├── ci.yml              # PR checks (build, test, helm validate, docker build)
        └── release.yml         # Semantic release on push to main
```

## Development

```bash
# Build everything (frontend + backend)
make build

# Run all tests
make test

# Run only backend tests
make test-backend

# Run only frontend tests
make test-frontend

# Type-check / vet
make lint

# Start backend locally (uses kubeconfig)
make dev-backend

# Start frontend dev server (with hot reload, proxies to :8080)
make dev-frontend
```

## Configuration

### Environment Variables

| Variable         | Default   | Description                                            |
|------------------|-----------|--------------------------------------------------------|
| `CLUSTER_NAME`   | `unknown` | Name shown in the frontend UI                          |
| `PORT`           | `8080`    | HTTP listen port                                       |
| `CONFIG_PATH`    |           | Path to backend config YAML file                       |
| `SERVE_FRONTEND` | `true`    | Set to `false` to disable the UI (API/WebSocket only)  |

### Backend Config File (`config.yaml`)

Optional YAML file to include/exclude resources and namespaces. By default, the backend watches all resources in all namespaces.

```yaml
# All fields optional. Default: watch everything.
resources:
  include:    # If set, ONLY watch these (allowlist mode)
    - group: "apps"
      version: "v1"
      resource: "deployments"
    - group: ""
      version: "v1"
      resource: "pods"
  exclude:    # Excluded even if in include list
    - group: ""
      version: "v1"
      resource: "events"
namespaces:
  include: []   # If set, ONLY watch these namespaces
  exclude:      # Excluded even if in include list
    - "kube-system"
```

Logic: if `include` is empty/absent, watch all. Then subtract `exclude`.

### Frontend Config

The frontend loads `/config.json` at startup to pre-configure backend connections.

In production (Helm), this file is generated from `values.yaml` and mounted into the container — see [Helm deployment](#helm-deployment) below.

For local development, edit `frontend/public/config.json`. Each entry can be a plain URL or an object with an optional hex color:

```json
{
  "backends": [
    "http://localhost:8080",
    { "url": "http://cluster-b:8080", "color": "#3b82f6" }
  ]
}
```

If the file is missing or has an empty array, the frontend starts with no backends (add them manually via the sidebar).

## API Endpoints

| Endpoint              | Description                              |
|-----------------------|------------------------------------------|
| `GET /api/info`       | Returns `{ "clusterName": "..." }`       |
| `GET /api/namespaces` | Returns list of watched namespace names  |
| `GET /api/resources`  | Returns list of watched resource types   |
| `GET /ws`             | WebSocket endpoint for event streaming   |
| `GET /config.json`    | Frontend backend config (overrides embedded when mounted) |
| `GET /`               | Serves the frontend static files         |

### WebSocket Protocol

**Server to Client** (one-way):
```json
{
  "type": "event",
  "data": {
    "id": "uuid",
    "cluster": "prod",
    "action": "CREATED",
    "resourceType": "deployments.apps",
    "name": "my-deploy",
    "namespace": "default",
    "timestamp": "2026-03-16T10:00:00Z"
  }
}
```

Actions: `CREATED`, `UPDATED`, `DELETED`

## Docker

### Build

```bash
# Build with default tag (ghcr.io/belitre/k8s-resource-visualizer:latest)
make docker-build

# Build with a specific version
make docker-build VERSION=1.2.3
```

### Push to GitHub Container Registry

Log in first, then push:

```bash
# Login (requires a GitHub PAT with write:packages scope)
CR_USER=<your-github-username> CR_TOKEN=<your-github-pat> make docker-login

# Push
make docker-push VERSION=1.2.3

# Build and push in one step
make docker-build-push VERSION=1.2.3
```

### Push the Helm chart

```bash
# Login to Helm OCI registry (same PAT as Docker)
CR_USER=<your-github-username> CR_TOKEN=<your-github-pat> make helm-login

# Package and push
make helm-push CHART_VERSION=1.2.3
```

## Helm Deployment

### Install / Upgrade

From the OCI registry (released versions):

```bash
helm upgrade --install k8s-resource-visualizer \
  oci://ghcr.io/belitre/charts/k8s-resource-visualizer \
  --version 1.2.3 \
  --set clusterName=prod-eu \
  --set frontend.selfUrl=https://prod-eu.example.com
```

From the local chart (development):

```bash
helm upgrade --install k8s-resource-visualizer helm/k8s-resource-visualizer \
  --set clusterName=prod-eu \
  --set frontend.selfUrl=https://prod-eu.example.com
```

### Key values

| Value | Default | Description |
|-------|---------|-------------|
| `clusterName` | `unknown` | Cluster name shown in the UI |
| `serveFrontend` | `true` | Set to `false` for backend-only deployments |
| `frontend.selfUrl` | `http://localhost:8080` | URL of this instance as seen from the browser |
| `frontend.selfColor` | | Optional hex color for this cluster in the UI |
| `frontend.backends` | `[]` | Additional backend clusters to pre-configure |
| `backendConfig` | `{}` | Resource/namespace filter (see below) |
| `ingress.enabled` | `false` | Enable Ingress |
| `httpRoute.enabled` | `false` | Enable Gateway API HTTPRoute |

### Frontend backends with colors

```yaml
# values.yaml
clusterName: prod-eu
frontend:
  selfUrl: "https://prod-eu.example.com"
  selfColor: "#3b82f6"
  backends:
    - url: "https://prod-us.example.com"
      color: "#f59e0b"
    - url: "https://staging.example.com"
      color: "#8b5cf6"
```

### Backend resource/namespace filter

When `backendConfig.resources.include` is set, the ClusterRole is automatically scoped to only those resources.

```yaml
# values.yaml
backendConfig:
  resources:
    include:
      - group: "apps"
        version: "v1"
        resource: "deployments"
      - group: ""
        version: "v1"
        resource: "pods"
    exclude:
      - group: ""
        version: "v1"
        resource: "events"
  namespaces:
    exclude:
      - kube-system
```

### With Ingress

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: events.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: events-tls
      hosts: [events.example.com]
```

### With HTTPRoute (Gateway API)

```yaml
httpRoute:
  enabled: true
  parentRefs:
    - name: my-gateway
      namespace: default
  hostnames:
    - events.example.com
```

### Multi-cluster setup

Deploy the backend to each cluster with `SERVE_FRONTEND=false`, and only one cluster serves the UI:

```bash
# Cluster A — serves the frontend, pre-configured with all backends
helm upgrade --install k8s-resource-visualizer helm/k8s-resource-visualizer \
  --set clusterName=prod-eu \
  --set frontend.selfUrl=https://prod-eu.example.com \
  --set frontend.selfColor="#3b82f6" \
  --set frontend.backends[0].url=https://prod-us.example.com \
  --set frontend.backends[0].color="#f59e0b"

# Cluster B — backend only, no UI
helm upgrade --install k8s-resource-visualizer helm/k8s-resource-visualizer \
  --set clusterName=prod-us \
  --set serveFrontend=false
```

### Raw manifests (alternative to Helm)

```bash
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/httproute.yaml
```

## CI/CD

### CI (Pull Requests)

The [CI workflow](.github/workflows/ci.yml) runs on every PR to `main`:

- **Backend** — build + test (`make build-backend`, `make test-backend`)
- **Frontend** — typecheck + test + build (`make ci-frontend`)
- **Helm** — lint + template validation for all scenarios (`make helm-validate`)
- **Docker** — build image (no push, with GHA layer cache)

### Releases

The [release workflow](.github/workflows/release.yml) runs on push to `main` using [semantic-release](https://semantic-release.gitbook.io) with conventional commits:

| Commit type | Release |
|-------------|---------|
| `feat:` | minor |
| `fix:`, `perf:`, `docs:`, `refactor:` | patch |
| `feat!:` / `BREAKING CHANGE` | major |
| `chore:`, `test:`, `build:`, `ci:` | no release |

The workflow builds everything, pushes the Docker image to `ghcr.io/belitre/k8s-resource-visualizer`, and creates a GitHub release with changelog.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

---

> This project was entirely built with [Claude Code](https://claude.ai/claude-code) using the **claude-sonnet-4-6** model.
