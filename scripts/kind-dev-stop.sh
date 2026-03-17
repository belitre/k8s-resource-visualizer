#!/usr/bin/env bash

echo "==> Stopping backends and frontend..."

for pid_file in /tmp/kind-backend-a.pid /tmp/kind-backend-b.pid /tmp/kind-frontend.pid; do
  if [ -f "$pid_file" ]; then
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && echo "    killed pid $pid ($(basename "$pid_file" .pid))"
    fi
    rm -f "$pid_file"
  fi
done

# Belt-and-suspenders: catch any strays
pkill -f "k8s-resource-visualizer" 2>/dev/null || true

echo "==> Deleting kind clusters..."
kind delete cluster --name kind   2>/dev/null && echo "    deleted kind"   || echo "    kind not found"
kind delete cluster --name kind-b 2>/dev/null && echo "    deleted kind-b" || echo "    kind-b not found"

echo "==> Done."
