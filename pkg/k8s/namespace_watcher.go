package k8s

import (
	"context"
	"fmt"
	"log"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
)

// SetOnNamespacesChanged registers a callback invoked when the set of watched namespaces changes.
func (m *Manager) SetOnNamespacesChanged(fn func([]string)) {
	m.onNamespacesChanged = fn
}

// WatchNamespaces watches Namespace changes and calls onNamespacesChanged when namespaces
// are added or deleted. Rapid changes are debounced with a 1s quiet window.
func (m *Manager) WatchNamespaces(ctx context.Context) {
	trigger := make(chan struct{}, 1)
	go m.nsChangedDebounce(ctx, trigger)

	for {
		if err := m.watchNamespacesOnce(ctx, trigger); err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("namespace watch error: %v, retrying in 5s", err)
			select {
			case <-time.After(5 * time.Second):
			case <-ctx.Done():
				return
			}
		}
	}
}

func (m *Manager) watchNamespacesOnce(ctx context.Context, trigger chan<- struct{}) error {
	w, err := m.k8sClient.CoreV1().Namespaces().Watch(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("starting namespace watch: %w", err)
	}
	defer w.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case ev, ok := <-w.ResultChan():
			if !ok {
				return fmt.Errorf("namespace watch channel closed")
			}
			if ev.Type == watch.Added || ev.Type == watch.Deleted {
				sendTrigger(trigger)
			}
		}
	}
}

func (m *Manager) nsChangedDebounce(ctx context.Context, trigger <-chan struct{}) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-trigger:
			timer := time.NewTimer(1 * time.Second)
		drain:
			for {
				select {
				case <-trigger:
				case <-timer.C:
					break drain
				case <-ctx.Done():
					timer.Stop()
					return
				}
			}
			namespaces, err := m.ListNamespaces(ctx)
			if err != nil {
				log.Printf("namespace change: failed to list namespaces: %v", err)
				continue
			}
			log.Printf("namespace change detected: %d namespaces", len(namespaces))
			if m.onNamespacesChanged != nil {
				m.onNamespacesChanged(namespaces)
			}
		}
	}
}
