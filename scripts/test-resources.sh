#!/usr/bin/env bash
# Creates and deletes a variety of resources across both kind clusters so you
# can visually verify card colours, group badges, and fade behaviour.

CLUSTER_A="kind-kind"
CLUSTER_B="kind-kind-b"
NS="default"
DELAY="${1:-3}"  # seconds between create/delete waves; override via first arg

run() {
  echo "$@"
  "$@"
}

echo "==> Creating resources on cluster-a (kind)"
run kubectl --context "$CLUSTER_A" create deployment apps-deploy   --image=nginx:alpine -n "$NS"
run kubectl --context "$CLUSTER_A" create deployment apps-deploy2  --image=nginx:alpine -n "$NS"
run kubectl --context "$CLUSTER_A" create job        batch-job     --image=busybox -- echo hi -n "$NS"
run kubectl --context "$CLUSTER_A" create configmap  core-config   --from-literal=k=v  -n "$NS"
run kubectl --context "$CLUSTER_A" create secret generic core-secret --from-literal=p=x -n "$NS"

echo ""
echo "==> Creating resources on cluster-b (kind-b)"
run kubectl --context "$CLUSTER_B" create deployment apps-deploy   --image=nginx:alpine -n "$NS"
run kubectl --context "$CLUSTER_B" create job        batch-job     --image=busybox -- echo hi -n "$NS"
run kubectl --context "$CLUSTER_B" create configmap  core-config   --from-literal=k=v  -n "$NS"

echo ""
echo "==> Waiting ${DELAY}s before updates..."
sleep "$DELAY"

echo ""
echo "==> Updating resources (scale deployments)"
run kubectl --context "$CLUSTER_A" scale deployment apps-deploy  --replicas=2 -n "$NS"
run kubectl --context "$CLUSTER_B" scale deployment apps-deploy  --replicas=3 -n "$NS"

echo ""
echo "==> Waiting ${DELAY}s before deletes..."
sleep "$DELAY"

echo ""
echo "==> Deleting resources on cluster-a"
run kubectl --context "$CLUSTER_A" delete deployment apps-deploy apps-deploy2 -n "$NS"
run kubectl --context "$CLUSTER_A" delete job        batch-job    -n "$NS"
run kubectl --context "$CLUSTER_A" delete configmap  core-config  -n "$NS"
run kubectl --context "$CLUSTER_A" delete secret     core-secret  -n "$NS"

echo ""
echo "==> Deleting resources on cluster-b"
run kubectl --context "$CLUSTER_B" delete deployment apps-deploy  -n "$NS"
run kubectl --context "$CLUSTER_B" delete job        batch-job    -n "$NS"
run kubectl --context "$CLUSTER_B" delete configmap  core-config  -n "$NS"

echo ""
echo "Done."
