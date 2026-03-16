package k8s

import (
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	fakedynamic "k8s.io/client-go/dynamic/fake"
	"k8s.io/apimachinery/pkg/runtime"
)

func TestWatcherHandleEvent(t *testing.T) {
	received := make(chan VisualEvent, 1)
	scheme := runtime.NewScheme()
	client := fakedynamic.NewSimpleDynamicClient(scheme)
	gvr := schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}

	w := NewWatcher(client, "test-cluster", gvr, "default", func(ev VisualEvent) {
		received <- ev
	})

	obj := &unstructured.Unstructured{}
	obj.SetName("my-deploy")
	obj.SetNamespace("default")

	w.handleEvent(watch.Event{Type: watch.Added, Object: obj})

	select {
	case ev := <-received:
		if ev.Cluster != "test-cluster" {
			t.Errorf("Cluster = %q, want %q", ev.Cluster, "test-cluster")
		}
		if ev.Action != "CREATED" {
			t.Errorf("Action = %q, want %q", ev.Action, "CREATED")
		}
		if ev.ResourceType != "deployments.apps" {
			t.Errorf("ResourceType = %q, want %q", ev.ResourceType, "deployments.apps")
		}
		if ev.Name != "my-deploy" {
			t.Errorf("Name = %q, want %q", ev.Name, "my-deploy")
		}
		if ev.Namespace != "default" {
			t.Errorf("Namespace = %q, want %q", ev.Namespace, "default")
		}
		if ev.ID == "" {
			t.Error("ID should not be empty")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
	}
}

func TestWatcherHandleEventActions(t *testing.T) {
	tests := []struct {
		watchType watch.EventType
		want      string
	}{
		{watch.Added, "CREATED"},
		{watch.Modified, "UPDATED"},
		{watch.Deleted, "DELETED"},
	}

	for _, tt := range tests {
		t.Run(string(tt.watchType), func(t *testing.T) {
			received := make(chan VisualEvent, 1)
			scheme := runtime.NewScheme()
			client := fakedynamic.NewSimpleDynamicClient(scheme)
			gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}

			w := NewWatcher(client, "cluster", gvr, "ns", func(ev VisualEvent) {
				received <- ev
			})

			obj := &unstructured.Unstructured{}
			obj.SetName("pod-1")

			w.handleEvent(watch.Event{Type: tt.watchType, Object: obj})

			select {
			case ev := <-received:
				if ev.Action != tt.want {
					t.Errorf("Action = %q, want %q", ev.Action, tt.want)
				}
			case <-time.After(time.Second):
				t.Fatal("timed out")
			}
		})
	}
}

func TestWatcherIgnoresBookmarkEvents(t *testing.T) {
	received := make(chan VisualEvent, 1)
	scheme := runtime.NewScheme()
	client := fakedynamic.NewSimpleDynamicClient(scheme)
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}

	w := NewWatcher(client, "cluster", gvr, "ns", func(ev VisualEvent) {
		received <- ev
	})

	obj := &unstructured.Unstructured{}
	obj.SetName("pod-1")

	w.handleEvent(watch.Event{Type: watch.Bookmark, Object: obj})

	select {
	case <-received:
		t.Fatal("should not receive bookmark events")
	case <-time.After(100 * time.Millisecond):
	}
}

func TestWatcherStop(t *testing.T) {
	scheme := runtime.NewScheme()
	client := fakedynamic.NewSimpleDynamicClient(scheme)
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}

	w := NewWatcher(client, "cluster", gvr, "ns", func(ev VisualEvent) {})
	w.Stop()

	if w.ctx.Err() == nil {
		t.Error("expected context to be cancelled after Stop()")
	}
}

func TestMakeEventID(t *testing.T) {
	tests := []struct {
		cluster   string
		group     string
		resource  string
		namespace string
		name      string
		action    string
		want      string
	}{
		// Namespaced resource with group
		{"prod", "apps", "deployments", "default", "nginx", "CREATED", "prod-deployments.apps-default-nginx-CREATED"},
		// Namespaced core resource (no group)
		{"prod", "", "pods", "kube-system", "coredns", "DELETED", "prod-pods-kube-system-coredns-DELETED"},
		// Cluster-scoped resource (no namespace)
		{"prod", "", "nodes", "", "worker-1", "UPDATED", "prod-nodes-worker-1-UPDATED"},
		// Cluster-scoped resource with group
		{"dev", "rbac.authorization.k8s.io", "clusterroles", "", "admin", "CREATED", "dev-clusterroles.rbac.authorization.k8s.io-admin-CREATED"},
	}

	for _, tt := range tests {
		got := makeEventID(tt.cluster, tt.group, tt.resource, tt.namespace, tt.name, tt.action)
		if got != tt.want {
			t.Errorf("makeEventID(%q,%q,%q,%q,%q,%q) = %q, want %q",
				tt.cluster, tt.group, tt.resource, tt.namespace, tt.name, tt.action, got, tt.want)
		}
	}
}

func TestFormatResourceType(t *testing.T) {
	tests := []struct {
		gvr  schema.GroupVersionResource
		want string
	}{
		{schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}, "deployments.apps"},
		{schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}, "pods"},
		{schema.GroupVersionResource{Group: "cert-manager.io", Version: "v1", Resource: "certificates"}, "certificates.cert-manager.io"},
	}

	for _, tt := range tests {
		got := formatResourceType(tt.gvr)
		if got != tt.want {
			t.Errorf("formatResourceType(%v) = %q, want %q", tt.gvr, got, tt.want)
		}
	}
}
