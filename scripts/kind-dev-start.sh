#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Creating kind clusters..."
kind create cluster --name kind   2>/dev/null && echo "    created kind"   || echo "    kind already exists, reusing"
kind create cluster --name kind-b 2>/dev/null && echo "    created kind-b" || echo "    kind-b already exists, reusing"

echo "==> Exporting kubeconfigs..."
kubectl config view --minify --context kind-kind   --flatten > /tmp/kind-dev-a.kubeconfig
kubectl config view --minify --context kind-kind-b --flatten > /tmp/kind-dev-b.kubeconfig

echo "==> Writing backend config for cluster-a..."
cat > /tmp/kind-dev-config-a.yaml << 'EOF'
remoteBackends:
  - name: cluster-b
    url: http://localhost:8081
    color: "#f59e0b"
EOF

echo "==> Building binary..."
cd "$ROOT"
go build -o /tmp/k8s-resource-visualizer .

echo "==> Starting backend-a (cluster-a, port 8080, proxying cluster-b)..."
KUBECONFIG=/tmp/kind-dev-a.kubeconfig \
CLUSTER_NAME=cluster-a \
PORT=8080 \
SERVE_FRONTEND=false \
  /tmp/k8s-resource-visualizer --config /tmp/kind-dev-config-a.yaml \
  > /tmp/kind-backend-a.log 2>&1 &
echo $! > /tmp/kind-backend-a.pid

echo "==> Starting backend-b (cluster-b, port 8081)..."
KUBECONFIG=/tmp/kind-dev-b.kubeconfig \
CLUSTER_NAME=cluster-b \
PORT=8081 \
SERVE_FRONTEND=false \
  /tmp/k8s-resource-visualizer \
  > /tmp/kind-backend-b.log 2>&1 &
echo $! > /tmp/kind-backend-b.pid

echo "==> Starting frontend dev server..."
cd "$ROOT/frontend"
source ~/.nvm/nvm.sh && nvm use v25.8.1 --silent
npm run dev > /tmp/kind-frontend.log 2>&1 &
echo $! > /tmp/kind-frontend.pid

# Give everything a moment to start
sleep 2

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           kind dev environment running           ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Frontend:  http://localhost:5173                ║"
echo "║  Backend A: http://localhost:8080  (cluster-a)   ║"
echo "║  Backend B: http://localhost:8081  (cluster-b)   ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Logs:                                           ║"
echo "║    tail -f /tmp/kind-backend-a.log               ║"
echo "║    tail -f /tmp/kind-backend-b.log               ║"
echo "║    tail -f /tmp/kind-frontend.log                ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Stop: make kind-dev-stop                        ║"
echo "╚══════════════════════════════════════════════════╝"
