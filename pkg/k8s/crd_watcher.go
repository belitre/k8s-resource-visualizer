package k8s

import (
	"context"
	"fmt"
	"log"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
)

var crdGVR = schema.GroupVersionResource{
	Group:    "apiextensions.k8s.io",
	Version:  "v1",
	Resource: "customresourcedefinitions",
}

// WatchCRDs watches CustomResourceDefinition changes and triggers Rediscover when the set of
// CRDs or their served API versions changes. Rapid changes are debounced with a 2s window.
func (m *Manager) WatchCRDs(ctx context.Context) {
	trigger := make(chan struct{}, 1)
	go m.crdRediscoverDebounce(ctx, trigger)

	// crdGenerations tracks the last known generation per CRD name to detect spec changes.
	crdGenerations := make(map[string]int64)
	for {
		if err := m.watchCRDsOnce(ctx, crdGenerations, trigger); err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("CRD watch error: %v, retrying in 5s", err)
			select {
			case <-time.After(5 * time.Second):
			case <-ctx.Done():
				return
			}
		}
	}
}

func (m *Manager) watchCRDsOnce(ctx context.Context, crdGenerations map[string]int64, trigger chan<- struct{}) error {
	w, err := m.dynClient.Resource(crdGVR).Watch(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("starting CRD watch: %w", err)
	}
	defer w.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case ev, ok := <-w.ResultChan():
			if !ok {
				return fmt.Errorf("CRD watch channel closed")
			}
			obj, ok := ev.Object.(*unstructured.Unstructured)
			if !ok {
				continue
			}
			name := obj.GetName()
			switch ev.Type {
			case watch.Added:
				crdGenerations[name] = obj.GetGeneration()
				sendTrigger(trigger)
			case watch.Deleted:
				delete(crdGenerations, name)
				sendTrigger(trigger)
			case watch.Modified:
				// Only trigger if the spec changed (generation incremented).
				// Status-only updates don't change generation.
				gen := obj.GetGeneration()
				if prev, seen := crdGenerations[name]; !seen || gen > prev {
					crdGenerations[name] = gen
					sendTrigger(trigger)
				}
			}
		}
	}
}

// crdRediscoverDebounce waits for triggers and calls Rediscover after a 2s quiet window.
func (m *Manager) crdRediscoverDebounce(ctx context.Context, trigger <-chan struct{}) {
	debounce(ctx, trigger, 2*time.Second, func() {
		log.Printf("CRD change detected, rediscovering resources")
		if err := m.Rediscover(); err != nil {
			log.Printf("rediscover after CRD change failed: %v", err)
		}
	})
}

// debounce calls fn after a quiet window of d following the last trigger signal.
func debounce(ctx context.Context, trigger <-chan struct{}, d time.Duration, fn func()) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-trigger:
			timer := time.NewTimer(d)
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
			fn()
		}
	}
}

func sendTrigger(ch chan<- struct{}) {
	select {
	case ch <- struct{}{}:
	default:
	}
}
