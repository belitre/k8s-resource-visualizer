# K8s Resource Visualizer

[![CI](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/belitre/k8s-resource-visualizer/actions/workflows/ci.yml)
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

- Go 1.24+
- Node.js v25.6.1+
- A Kubernetes cluster (for deployment) or kubeconfig (for local dev)
- A Gateway API controller (for HTTPRoute, optional)

## Project Structure

```
.
├── main.go                     # Go entry point
├── Dockerfile                  # Multi-stage build
├── Makefile                    # Build, test, lint targets
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
│   │   └── config.json         # Pre-configured backend URLs
│   └── src/
│       ├── components/
│       │   ├── Sidebar.tsx     # Backend management + namespace/resource filters
│       │   ├── EventCanvas.tsx # Canvas container
│       │   └── EventCard.tsx   # Individual event card with fade animation
│       └── hooks/
│           └── useBackendConnection.ts  # WebSocket + REST per backend
└── k8s/                        # Kubernetes manifests
    ├── rbac.yaml               # ServiceAccount + ClusterRole (all resources)
    ├── deployment.yaml         # Deployment + Service
    └── httproute.yaml          # Gateway API HTTPRoute
```

## Development

```bash
# Build everything
make build

# Run tests
make test

# Run only backend tests
make test-backend

# Run only frontend tests
make test-frontend

# Type-check / vet
make lint

# Start backend locally (uses kubeconfig)
make dev-backend

# Start frontend dev server (with hot reload)
make dev-frontend
```

## Configuration

### Environment Variables

| Variable       | Default   | Description                          |
|----------------|-----------|--------------------------------------|
| `CLUSTER_NAME` | `unknown` | Name shown in the frontend UI        |
| `PORT`         | `8080`    | HTTP listen port                     |
| `CONFIG_PATH`  |           | Path to backend config YAML file     |

### Backend Config File (`config.yaml`)

Optional YAML file to include/exclude resources and namespaces. By default, the backend watches all resources in all namespaces.

```yaml
# All fields optional. Default: watch everything.
resources:
  include:    # If set, ONLY watch these (whitelist mode)
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

### Frontend Config (`frontend/public/config.json`)

Pre-configure backend URLs so the frontend auto-connects on startup:

```json
{
  "backends": ["http://cluster-a:8080", "http://cluster-b:8080"]
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

## Deployment

### Build the Docker image

```bash
make docker-build
```

### Deploy to Kubernetes

Edit the manifests in `k8s/` to set your cluster name, gateway, and hostname:

1. **`k8s/deployment.yaml`** — set `CLUSTER_NAME` env var, optionally mount a config file and set `CONFIG_PATH`
2. **`k8s/httproute.yaml`** — set `parentRefs` (your Gateway name) and `hostnames`

```bash
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/httproute.yaml
```

### Multi-cluster setup

Deploy the backend to each cluster with a different `CLUSTER_NAME`. Configure `frontend/public/config.json` with all backend URLs before building, or add them at runtime via the sidebar.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

---

> This project was entirely built with [Claude Code](https://claude.ai/claude-code) using the **claude-sonnet-4-6** model.
