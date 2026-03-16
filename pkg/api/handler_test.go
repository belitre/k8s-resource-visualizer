package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/belitre/k8s-resource-visualizer/pkg/config"
	"github.com/belitre/k8s-resource-visualizer/pkg/k8s"
	"github.com/belitre/k8s-resource-visualizer/pkg/ws"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	fakedynamic "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"
)

func newTestHandler(namespaces []string) (*Handler, *http.ServeMux) {
	k8sClient := fake.NewSimpleClientset()
	for _, ns := range namespaces {
		k8sClient.CoreV1().Namespaces().Create(context.Background(), &corev1.Namespace{
			ObjectMeta: metav1.ObjectMeta{Name: ns},
		}, metav1.CreateOptions{})
	}

	scheme := runtime.NewScheme()
	dynClient := fakedynamic.NewSimpleDynamicClient(scheme)
	cfg := &config.Config{}

	manager := k8s.NewManagerForTesting("test-cluster", k8sClient, dynClient, k8sClient.Discovery(), cfg)
	hub := ws.NewHub()

	handler := &Handler{
		Manager: manager,
		Hub:     hub,
	}

	mux := http.NewServeMux()
	frontendFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<html>test</html>")},
	}
	handler.RegisterRoutes(mux, frontendFS)

	return handler, mux
}

func TestHandleInfo(t *testing.T) {
	_, mux := newTestHandler(nil)

	req := httptest.NewRequest("GET", "/api/info", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp InfoResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp.ClusterName != "test-cluster" {
		t.Errorf("ClusterName = %q, want %q", resp.ClusterName, "test-cluster")
	}
}

func TestHandleNamespaces(t *testing.T) {
	_, mux := newTestHandler([]string{"default", "kube-system"})

	req := httptest.NewRequest("GET", "/api/namespaces", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var namespaces []string
	if err := json.NewDecoder(w.Body).Decode(&namespaces); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(namespaces) != 2 {
		t.Fatalf("got %d namespaces, want 2", len(namespaces))
	}
}

func TestHandleResources(t *testing.T) {
	_, mux := newTestHandler(nil)

	req := httptest.NewRequest("GET", "/api/resources", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resources []string
	if err := json.NewDecoder(w.Body).Decode(&resources); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	// No watchers started, so empty
	if len(resources) != 0 {
		t.Errorf("got %d resources, want 0", len(resources))
	}
}

func TestHandleFrontendConfig(t *testing.T) {
	_, mux := newTestHandler(nil)

	// Without FrontendBackends set, /config.json is not overridden
	req := httptest.NewRequest("GET", "/config.json", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 without FrontendBackends, got %d", w.Code)
	}

	// With FrontendBackends set, /config.json returns the override
	k8sClient := fake.NewSimpleClientset()
	scheme := runtime.NewScheme()
	dynClient := fakedynamic.NewSimpleDynamicClient(scheme)
	manager := k8s.NewManagerForTesting("test-cluster", k8sClient, dynClient, k8sClient.Discovery(), &config.Config{})
	hub := ws.NewHub()

	h := &Handler{
		Manager:        manager,
		Hub:            hub,
		FrontendConfig: []byte(`{"backends":[{"url":"http://a:8080"},{"url":"http://b:8080"}]}`),
	}
	mux2 := http.NewServeMux()
	h.RegisterRoutes(mux2, nil)

	req2 := httptest.NewRequest("GET", "/config.json", nil)
	w2 := httptest.NewRecorder()
	mux2.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w2.Code, http.StatusOK)
	}
	var result map[string][]any
	if err := json.NewDecoder(w2.Body).Decode(&result); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(result["backends"]) != 2 {
		t.Errorf("got %d backends, want 2", len(result["backends"]))
	}
}

func TestServeFrontend(t *testing.T) {
	_, mux := newTestHandler(nil)

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if body := w.Body.String(); body != "<html>test</html>" {
		t.Errorf("body = %q", body)
	}
}
