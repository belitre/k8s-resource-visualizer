package k8s

import (
	"context"
	"testing"

	"go.uber.org/zap"
	"github.com/belitre/k8s-resource-visualizer/pkg/config"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	fakedynamic "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"
)

func newTestManager(namespaces []string, cfg *config.Config) *Manager {
	k8sClient := fake.NewSimpleClientset()
	for _, ns := range namespaces {
		k8sClient.CoreV1().Namespaces().Create(context.Background(), &corev1.Namespace{
			ObjectMeta: metav1.ObjectMeta{Name: ns},
		}, metav1.CreateOptions{})
	}

	scheme := runtime.NewScheme()
	dynClient := fakedynamic.NewSimpleDynamicClient(scheme)

	if cfg == nil {
		cfg = &config.Config{}
	}

	return NewManagerForTesting("test-cluster", k8sClient, dynClient, k8sClient.Discovery(), cfg, zap.NewNop())
}

func TestManagerClusterName(t *testing.T) {
	m := newTestManager(nil, nil)
	if got := m.ClusterName(); got != "test-cluster" {
		t.Errorf("ClusterName() = %q, want %q", got, "test-cluster")
	}
}

func TestManagerListNamespaces(t *testing.T) {
	m := newTestManager([]string{"default", "kube-system", "app"}, nil)

	namespaces, err := m.ListNamespaces(context.Background())
	if err != nil {
		t.Fatalf("ListNamespaces() error: %v", err)
	}

	want := []string{"app", "default", "kube-system"}
	if len(namespaces) != len(want) {
		t.Fatalf("ListNamespaces() returned %d, want %d", len(namespaces), len(want))
	}
	for i, ns := range namespaces {
		if ns != want[i] {
			t.Errorf("ListNamespaces()[%d] = %q, want %q", i, ns, want[i])
		}
	}
}

func TestManagerListNamespacesWithExclude(t *testing.T) {
	cfg := &config.Config{
		Namespaces: config.NamespaceFilter{
			Exclude: []string{"kube-system"},
		},
	}
	m := newTestManager([]string{"default", "kube-system", "app"}, cfg)

	namespaces, err := m.ListNamespaces(context.Background())
	if err != nil {
		t.Fatalf("error: %v", err)
	}

	want := []string{"app", "default"}
	if len(namespaces) != len(want) {
		t.Fatalf("got %d namespaces, want %d", len(namespaces), len(want))
	}
	for i, ns := range namespaces {
		if ns != want[i] {
			t.Errorf("[%d] = %q, want %q", i, ns, want[i])
		}
	}
}

func TestManagerListNamespacesWithInclude(t *testing.T) {
	cfg := &config.Config{
		Namespaces: config.NamespaceFilter{
			Include: []string{"production"},
		},
	}
	m := newTestManager([]string{"default", "production", "staging"}, cfg)

	namespaces, err := m.ListNamespaces(context.Background())
	if err != nil {
		t.Fatalf("error: %v", err)
	}

	if len(namespaces) != 1 || namespaces[0] != "production" {
		t.Errorf("got %v, want [production]", namespaces)
	}
}

func TestManagerListNamespacesEmpty(t *testing.T) {
	m := newTestManager(nil, nil)

	namespaces, err := m.ListNamespaces(context.Background())
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if len(namespaces) != 0 {
		t.Errorf("got %d namespaces, want 0", len(namespaces))
	}
}

func TestManagerListWatchedResourcesEmpty(t *testing.T) {
	m := newTestManager(nil, nil)
	resources := m.ListWatchedResources()
	if len(resources) != 0 {
		t.Errorf("got %d resources, want 0 (no watchers started)", len(resources))
	}
}

func TestManagerStop(t *testing.T) {
	m := newTestManager(nil, nil)
	// Stop on empty manager should not panic
	m.Stop()

	if m.watchersByGVR != nil {
		t.Error("expected nil watchersByGVR after Stop()")
	}
}

func TestManagerSetOnResourcesChanged(t *testing.T) {
	m := newTestManager(nil, nil)

	var got []ResourceInfo
	m.SetOnResourcesChanged(func(resources []ResourceInfo) {
		got = resources
	})

	if m.onResourcesChanged == nil {
		t.Fatal("expected onResourcesChanged to be set")
	}
	m.onResourcesChanged([]ResourceInfo{
		{Group: "", Version: "v1", Resource: "pods", Key: "pods"},
		{Group: "apps", Version: "v1", Resource: "deployments", Key: "deployments.apps"},
	})
	if len(got) != 2 || got[0].Key != "pods" {
		t.Errorf("callback received unexpected resources: %v", got)
	}
}
