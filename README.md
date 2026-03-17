# K8s Resource Visualizer

[![CI](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/ci.yml)
[![Release](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/release.yml/badge.svg)](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/release.yml)
[![Go Version](https://img.shields.io/github/go-mod/go-version/belitre/k8s-resource-visualizer)](go.mod)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> **⚠️ Work in Progress** — This project is under active development and is not ready for production use.

> This project was entirely built with [Claude Code](https://claude.ai/claude-code) using the **claude-sonnet-4-6** model.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Development](#development)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [WebSocket Protocol](#websocket-protocol)
- [Docker](#docker)
- [Helm Deployment](#helm-deployment)
- [CI/CD](#cicd)
- [License](#license)

## Overview

A real-time Kubernetes resource visualizer with a dark-themed UI. Watches all resources (Pods, Deployments, Services, CRDs, and more) for CREATED, UPDATED, and DELETED events and displays them as color-coded cards on a canvas.

Key features:

- **Live resource discovery** — automatically detects new CRDs and starts watching them without restart; stops watching removed CRDs
- **Live namespace discovery** — detects new/deleted namespaces and updates filters automatically
- **Multi-cluster** — deploy one backend per cluster; the frontend connects to all of them and shows events side by side
- **Proxy mode** — a single backend can proxy WebSocket and REST traffic to other backends, so the browser only needs to reach one URL
- **Per-cluster filters** — namespace and resource type filters are independent per cluster
- **Smart filter auto-select** — new namespaces/resources are auto-selected only when the user already has filters active for that cluster
- **Non-namespaced resources** — cluster-scoped resources (ClusterRole, Node, etc.) are tracked under a "Non-namespaced" filter entry
- **Configurable** — include/exclude specific resources and namespaces via a YAML config file

## Architecture

### Single-cluster (simple)

```
+-------------------------------------+
|          Kubernetes Cluster         |
|                                     |
|   +-----------------------------+   |
|   |      Backend (Go)           |   |
|   |  - discovers all resources  |   |
|   |  - watches CRDs & namespaces|   |
|   |  - streams events via WS    |   |
|   |  - serves frontend          |   |
|   +-------------+---------------+   |
+-----------------|-------------------+
                  |  HTTP/WebSocket
          +-------v-------+
          |   Browser     |
          | (React UI)    |
          +---------------+
```

### Multi-cluster with proxy

In this mode one backend serves the frontend and proxies traffic to the other backends. The browser only needs to reach one URL.

```
+-------------------+     +-------------------+
|   Cluster A       |     |   Cluster B       |
|                   |     |                   |
|  Backend A (Go)   |     |  Backend B (Go)   |
|  - local watchers |     |  - local watchers |
|  - serves UI      |     |  - API + WS only  |
|  - proxies to B   |     |                   |
+--------+----------+     +--------+----------+
         |  proxy /proxy/cluster-b/*           |
         +-------------------------------------+
         |
         |  HTTP/WebSocket
 +-------v-------+
 |    Browser    |
 | (React UI)    |
 +---------------+
```

The frontend connects to Backend A for its own cluster events and also opens a proxied WebSocket connection through Backend A to reach Backend B. From the browser's perspective everything goes through a single origin.

### Multi-cluster without proxy (direct)

The frontend can also connect directly to multiple backends — useful for local development or when all backends are reachable from the browser.

```
+------------------+     +------------------+
|    Backend A     |     |    Backend B     |
|  (Cluster A)     |     |  (Cluster B)     |
+--------+---------+     +--------+---------+
         |                         |
         +-------- WebSocket ------+
                      |
              +-------v-------+
              |    Browser    |
              | (React UI)    |
              +---------------+
```

### What each backend does

- Runs inside a K8s cluster or locally with a kubeconfig
- Uses the dynamic client + discovery API to watch **all** API resources (including CRDs)
- Watches `CustomResourceDefinition` objects — adds/removes watchers live when CRDs change
- Watches `Namespace` objects — pushes updated namespace lists to connected browsers via WebSocket
- Filters resources and namespaces via an optional YAML config file
- Streams resource events to the browser via WebSocket
- Identifies itself with the `CLUSTER_NAME` environment variable

### What the frontend does

- Connects to one or more backend URLs (pre-configured or added at runtime via the sidebar)
- Opens a WebSocket per backend for live event streaming
- Handles `resources_updated` and `namespaces_updated` WebSocket messages to keep filters in sync without page reload
- Displays events as draggable cards (green = Created, yellow = Updated, red = Deleted)
- Cards show cluster, action, resource name, resource type, and namespace badge (when applicable)
- Cards fade out after a configurable duration; clicking or dragging resets the timer
- Duplicate events (same resource + action within the expiry window) are merged and show a repeat counter
- Per-cluster independent filters for namespace and resource type

## Prerequisites

- Go 1.25.7+
- Node.js v25.8.1+
- Helm 3+ (for Helm-based deployment)
- A Kubernetes cluster (for deployment) or kubeconfig (for local dev)
- A Gateway API controller (for HTTPRoute, optional)

## Project Structure

```
.
├── main.go                      # Entry point: wires k8s manager, hub, HTTP server
├── Dockerfile                   # Multi-stage build (Go 1.25.7 + Node 25.6)
├── Makefile                     # Build, test, lint, docker, helm, release targets
├── pkg/
│   ├── config/
│   │   └── config.go            # YAML config: resource/namespace filters + remote backends
│   ├── k8s/
│   │   ├── manager.go           # Resource discovery, watcher lifecycle, rediscover on change
│   │   ├── watcher.go           # Per-GVR dynamic watcher (tracks resourceVersion to avoid replays)
│   │   ├── crd_watcher.go       # Watches CRDs; triggers Rediscover() on add/delete/spec change
│   │   └── namespace_watcher.go # Watches Namespaces; notifies on add/delete
│   ├── ws/
│   │   ├── hub.go               # WebSocket hub: broadcasts events, resources_updated, namespaces_updated
│   │   └── client.go            # Per-connection WebSocket read/write pumps
│   └── api/
│       └── handler.go           # REST handlers, WebSocket upgrade, proxy routes
├── frontend/                    # React + TypeScript + Vite
│   ├── public/
│   │   └── config.json          # Pre-configured backend URLs (local dev)
│   └── src/
│       ├── App.tsx              # Root: event state, per-cluster filter map, backend orchestration
│       ├── types.ts             # VisualEvent, ServerMessage discriminated union
│       ├── components/
│       │   ├── Sidebar.tsx      # Backend list, per-cluster namespace/resource filters
│       │   ├── EventCanvas.tsx  # Positioned canvas for event cards
│       │   └── EventCard.tsx    # Draggable card with fade animation and namespace badge
│       └── hooks/
│           ├── useBackendConnection.ts  # WS + REST per backend; handles all server message types
│           └── useDrag.ts              # Drag logic for event cards
├── helm/
│   └── k8s-resource-visualizer/ # Helm chart
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
├── k8s/                         # Raw Kubernetes manifests
│   ├── rbac.yaml                # ServiceAccount + ClusterRole (all resources, watch verbs)
│   ├── deployment.yaml          # Deployment + Service
│   └── httproute.yaml           # Gateway API HTTPRoute
└── .github/
    └── workflows/
        ├── ci.yml               # PR checks (build, test, helm validate, docker build)
        └── release.yml          # Semantic release on push to main
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

Optional YAML file to filter resources and namespaces, and to configure remote backends for proxying.

```yaml
# All fields optional. Default: watch everything, no proxy.

resources:
  include:    # If set, ONLY watch these (allowlist)
    - group: "apps"
      version: "v1"
      resource: "deployments"
    - group: ""
      version: "v1"
      resource: "pods"
  exclude:    # Always excluded, even if in include list
    - group: ""
      version: "v1"
      resource: "events"

namespaces:
  include: []        # If set, ONLY watch these namespaces
  exclude:
    - "kube-system"

remoteBackends:      # Other backends this instance can proxy to
  - name: cluster-b
    url: http://cluster-b-svc:8080
    color: "#f59e0b"   # Optional hex color shown in the UI
```

**Resource filter logic:** if `include` is empty/absent, watch all resources. Then subtract `exclude`.

**Namespace filter logic:** if `include` is empty/absent, watch all namespaces. Then subtract `exclude`. Note: namespace filtering for event delivery is applied at broadcast time, not at the watcher level.

**Remote backends:** when configured, the backend exposes proxy routes (`/proxy/{name}/ws` and `/proxy/{name}/api/{path}`) that forward traffic to the named backend. The frontend discovers configured proxy backends via `GET /api/proxy-backends` and opens connections through them automatically.

### Frontend Config

The frontend loads `/config.json` at startup to pre-configure backend connections.

In production (Helm), this file is generated from `values.yaml` and mounted into the container — see [Helm deployment](#helm-deployment).

For local development, edit `frontend/public/config.json`:

```json
{
  "backends": [
    "http://localhost:8080",
    { "url": "http://cluster-b:8080", "color": "#3b82f6" }
  ]
}
```

Each entry can be a plain URL string or an object with an optional `color` (hex). If the file is missing or has an empty array, the frontend starts with no backends and you add them manually via the sidebar.

## API Endpoints

| Endpoint                          | Description                                              |
|-----------------------------------|----------------------------------------------------------|
| `GET /api/info`                   | Returns `{ "clusterName": "..." }`                       |
| `GET /api/namespaces`             | Returns current list of watched namespace names          |
| `GET /api/resources`              | Returns current list of watched resource types           |
| `GET /api/proxy-backends`         | Returns list of configured remote backends (name + color)|
| `GET /ws`                         | WebSocket endpoint for event streaming                   |
| `GET /proxy/{name}/ws`            | Proxied WebSocket to remote backend `name`               |
| `GET /proxy/{name}/api/{path}`    | Proxied REST to remote backend `name`                    |
| `GET /config.json`                | Frontend backend config (overrides embedded when mounted)|
| `GET /`                           | Serves the embedded frontend static files                |

## WebSocket Protocol

All messages are sent from the server to the client (one-way push). There are three message types:

### `event` — a resource change

```json
{
  "type": "event",
  "data": {
    "id": "cluster-a-deployments.apps-default-my-deploy-CREATED",
    "cluster": "cluster-a",
    "action": "CREATED",
    "resourceType": "deployments.apps",
    "name": "my-deploy",
    "namespace": "default",
    "timestamp": "2026-03-17T10:00:00Z"
  }
}
```

`action` is one of `CREATED`, `UPDATED`, `DELETED`. `namespace` is empty for cluster-scoped resources. Event IDs are deterministic (`cluster-resourceType-namespace-name-action`) — the frontend uses them for deduplication.

### `resources_updated` — watched resource types changed

Sent when a CRD is added or removed, causing the backend to rediscover and update its watcher set.

```json
{
  "type": "resources_updated",
  "data": ["deployments.apps", "pods", "widgets.example.com"]
}
```

The frontend updates the resource filter list for that cluster. New resource types are auto-selected if the user already has any resources selected; otherwise they appear unchecked.

### `namespaces_updated` — namespace list changed

Sent when a namespace is created or deleted.

```json
{
  "type": "namespaces_updated",
  "data": ["default", "kube-system", "production"]
}
```

The frontend updates the namespace filter list for that cluster. New namespaces are auto-selected if the user already has any real namespaces selected (not counting "Non-namespaced"); otherwise they appear unchecked.

## Docker

### Build

```bash
# Build with default tag (ghcr.io/belitre/k8s-resource-visualizer:latest)
make docker-build

# Build with a specific version
make docker-build VERSION=1.2.3
```

### Push to GitHub Container Registry

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
CR_USER=<your-github-username> CR_TOKEN=<your-github-pat> make helm-login
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
| `backendConfig` | `{}` | Resource/namespace filter + remote backends (see below) |
| `ingress.enabled` | `false` | Enable Ingress |
| `httpRoute.enabled` | `false` | Enable Gateway API HTTPRoute |

### Frontend backends with colors

```yaml
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

### Multi-cluster setup with proxy

Deploy one backend per cluster. The cluster that serves the frontend configures the others as `remoteBackends` — the browser only needs to reach one URL.

```yaml
# Cluster A — serves the frontend, proxies to Cluster B
clusterName: prod-eu
frontend:
  selfUrl: "https://prod-eu.example.com"
  selfColor: "#3b82f6"
backendConfig:
  remoteBackends:
    - name: prod-us
      url: "http://k8s-resource-visualizer.prod-us.svc.cluster.local:8080"
      color: "#f59e0b"
```

```yaml
# Cluster B — backend only, no UI
clusterName: prod-us
serveFrontend: false
```

### Multi-cluster setup without proxy (direct connections)

If all backends are reachable from the browser (e.g., each exposed via an Ingress), configure them directly in the frontend:

```bash
# Cluster A
helm upgrade --install k8s-resource-visualizer helm/k8s-resource-visualizer \
  --set clusterName=prod-eu \
  --set frontend.selfUrl=https://prod-eu.example.com \
  --set frontend.selfColor="#3b82f6" \
  --set frontend.backends[0].url=https://prod-us.example.com \
  --set frontend.backends[0].color="#f59e0b"

# Cluster B — backend only
helm upgrade --install k8s-resource-visualizer helm/k8s-resource-visualizer \
  --set clusterName=prod-us \
  --set serveFrontend=false
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
