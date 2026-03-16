package k8s

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"

	"github.com/belitre/k8s-resource-visualizer/pkg/config"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// Manager handles discovery and watching of resources.
type Manager struct {
	dynClient   dynamic.Interface
	k8sClient   kubernetes.Interface
	discoClient discovery.DiscoveryInterface
	clusterName string
	cfg         *config.Config
	mu          sync.Mutex
	watchers    []*Watcher
	callback    EventCallback
}

// NewManager creates a Manager. Tries in-cluster config, falls back to kubeconfig.
func NewManager(clusterName string, cfg *config.Config, callback EventCallback) (*Manager, error) {
	restCfg, err := rest.InClusterConfig()
	if err != nil {
		log.Printf("in-cluster config not available, falling back to kubeconfig: %v", err)
		restCfg, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			clientcmd.NewDefaultClientConfigLoadingRules(),
			&clientcmd.ConfigOverrides{},
		).ClientConfig()
		if err != nil {
			return nil, fmt.Errorf("kubeconfig: %w", err)
		}
	}

	dynClient, err := dynamic.NewForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("creating dynamic client: %w", err)
	}

	k8sClient, err := kubernetes.NewForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("creating k8s client: %w", err)
	}

	discoClient, err := discovery.NewDiscoveryClientForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("creating discovery client: %w", err)
	}

	return &Manager{
		dynClient:   dynClient,
		k8sClient:   k8sClient,
		discoClient: discoClient,
		clusterName: clusterName,
		cfg:         cfg,
		callback:    callback,
	}, nil
}

// NewManagerForTesting creates a Manager with injected clients.
func NewManagerForTesting(clusterName string, k8sClient kubernetes.Interface, dynClient dynamic.Interface, discoClient discovery.DiscoveryInterface, cfg *config.Config) *Manager {
	return &Manager{
		dynClient:   dynClient,
		k8sClient:   k8sClient,
		discoClient: discoClient,
		clusterName: clusterName,
		cfg:         cfg,
		callback:    func(ev VisualEvent) {},
	}
}

// ClusterName returns the cluster name.
func (m *Manager) ClusterName() string {
	return m.clusterName
}

// ListNamespaces returns namespaces allowed by config.
func (m *Manager) ListNamespaces(ctx context.Context) ([]string, error) {
	nsList, err := m.k8sClient.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("listing namespaces: %w", err)
	}

	var names []string
	for _, ns := range nsList.Items {
		if m.cfg.ShouldWatchNamespace(ns.Name) {
			names = append(names, ns.Name)
		}
	}
	sort.Strings(names)
	return names, nil
}

// DiscoverAndWatch discovers all API resources and starts watchers.
func (m *Manager) DiscoverAndWatch() error {
	_, apiResourceLists, err := m.discoClient.ServerGroupsAndResources()
	if err != nil {
		// Some resources may fail discovery (e.g. metrics) but we continue
		log.Printf("partial discovery error (continuing): %v", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for _, list := range apiResourceLists {
		gv, err := schema.ParseGroupVersion(list.GroupVersion)
		if err != nil {
			continue
		}

		for _, apiRes := range list.APIResources {
			// Skip subresources (e.g. pods/status, pods/log)
			if strings.Contains(apiRes.Name, "/") {
				continue
			}

			if !hasVerb(apiRes.Verbs, "watch") {
				continue
			}

			if !m.cfg.ShouldWatchResource(gv.Group, gv.Version, apiRes.Name) {
				continue
			}

			gvr := schema.GroupVersionResource{
				Group:    gv.Group,
				Version:  gv.Version,
				Resource: apiRes.Name,
			}

			w := NewWatcher(m.dynClient, m.clusterName, gvr, "", m.callback)
			m.watchers = append(m.watchers, w)
			go func(w *Watcher) {
				if err := w.Start(); err != nil {
					log.Printf("watcher for %s stopped: %v", w.ResourceType(), err)
				}
			}(w)
		}
	}

	log.Printf("started %d watchers", len(m.watchers))
	return nil
}

// ListWatchedResources returns the resource types being watched.
func (m *Manager) ListWatchedResources() []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	seen := make(map[string]bool)
	var resources []string
	for _, w := range m.watchers {
		rt := w.ResourceType()
		if !seen[rt] {
			seen[rt] = true
			resources = append(resources, rt)
		}
	}
	sort.Strings(resources)
	return resources
}

// Stop stops all watchers.
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, w := range m.watchers {
		w.Stop()
	}
	m.watchers = nil
}

func hasVerb(verbs metav1.Verbs, verb string) bool {
	for _, v := range verbs {
		if v == verb {
			return true
		}
	}
	return false
}
