#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Rebuilding binary..."
cd "$ROOT"
go build -o /tmp/k8s-resource-visualizer .

echo "==> Restarting backend-a..."
if [ -f /tmp/kind-backend-a.pid ]; then
  pid=$(cat /tmp/kind-backend-a.pid)
  kill "$pid" 2>/dev/null || true
fi
KUBECONFIG=/tmp/kind-dev-a.kubeconfig \
CLUSTER_NAME=cluster-a \
PORT=8080 \
SERVE_FRONTEND=false \
  /tmp/k8s-resource-visualizer --config /tmp/kind-dev-config-a.yaml \
  > /tmp/kind-backend-a.log 2>&1 &
echo $! > /tmp/kind-backend-a.pid
echo "    backend-a restarted (pid $!)"

echo "==> Restarting backend-b..."
if [ -f /tmp/kind-backend-b.pid ]; then
  pid=$(cat /tmp/kind-backend-b.pid)
  kill "$pid" 2>/dev/null || true
fi
KUBECONFIG=/tmp/kind-dev-b.kubeconfig \
CLUSTER_NAME=cluster-b \
PORT=8081 \
SERVE_FRONTEND=false \
  /tmp/k8s-resource-visualizer \
  > /tmp/kind-backend-b.log 2>&1 &
echo $! > /tmp/kind-backend-b.pid
echo "    backend-b restarted (pid $!)"

echo ""
echo "==> Done. Frontend (Vite HMR) needs no restart."
echo "    Logs: tail -f /tmp/kind-backend-a.log"
echo "          tail -f /tmp/kind-backend-b.log"
