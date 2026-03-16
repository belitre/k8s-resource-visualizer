package k8s

import (
	"context"
	"fmt"
	"log"
	"time"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

// VisualEvent is the event struct sent to the frontend.
type VisualEvent struct {
	ID           string    `json:"id"`
	Cluster      string    `json:"cluster"`
	Action       string    `json:"action"` // CREATED, UPDATED, DELETED
	ResourceType string    `json:"resourceType"`
	Name         string    `json:"name"`
	Namespace    string    `json:"namespace"`
	Timestamp    time.Time `json:"timestamp"`
}

// EventCallback is called when a resource change is detected.
type EventCallback func(ev VisualEvent)

// Watcher watches a single GVR for resource changes.
type Watcher struct {
	client      dynamic.Interface
	clusterName string
	gvr         schema.GroupVersionResource
	namespace   string // empty = all namespaces
	callback    EventCallback
	cancel      context.CancelFunc
	ctx         context.Context
	lastRV      string // tracks the last seen resourceVersion to avoid replaying events on reconnect
}

// NewWatcher creates a new Watcher for the given GVR and namespace.
func NewWatcher(client dynamic.Interface, clusterName string, gvr schema.GroupVersionResource, namespace string, callback EventCallback) *Watcher {
	ctx, cancel := context.WithCancel(context.Background())
	return &Watcher{
		client:      client,
		clusterName: clusterName,
		gvr:         gvr,
		namespace:   namespace,
		callback:    callback,
		cancel:      cancel,
		ctx:         ctx,
	}
}

// ResourceType returns the resource type string (e.g. "deployments.apps").
func (w *Watcher) ResourceType() string {
	return formatResourceType(w.gvr)
}

// Start begins watching. Blocks until stopped or context cancelled.
func (w *Watcher) Start() error {
	for {
		if err := w.watch(); err != nil {
			if w.ctx.Err() != nil {
				return nil
			}
			log.Printf("watch error for %s: %v, retrying in 5s", w.ResourceType(), err)
			select {
			case <-time.After(5 * time.Second):
			case <-w.ctx.Done():
				return nil
			}
		}
	}
}

func (w *Watcher) watch() error {
	var resource dynamic.ResourceInterface
	if w.namespace != "" {
		resource = w.client.Resource(w.gvr).Namespace(w.namespace)
	} else {
		resource = w.client.Resource(w.gvr)
	}

	opts := metav1.ListOptions{}
	if w.lastRV != "" {
		// Resume from last seen resourceVersion — avoids replaying all existing
		// resources as ADDED events when the watch channel closes and reconnects.
		opts.ResourceVersion = w.lastRV
	}

	watcher, err := resource.Watch(w.ctx, opts)
	if err != nil {
		// 410 Gone means our resourceVersion is too old; reset and get a fresh watch.
		if k8serrors.IsGone(err) {
			log.Printf("watch resourceVersion too old for %s, resetting", w.ResourceType())
			w.lastRV = ""
		}
		return fmt.Errorf("starting watch for %s: %w", w.ResourceType(), err)
	}
	defer watcher.Stop()

	for {
		select {
		case <-w.ctx.Done():
			return nil
		case ev, ok := <-watcher.ResultChan():
			if !ok {
				return fmt.Errorf("watch channel closed for %s", w.ResourceType())
			}
			// A watch.Error event with code 410 means resourceVersion too old.
			if ev.Type == watch.Error {
				if status, ok := ev.Object.(*metav1.Status); ok && status.Code == 410 {
					log.Printf("watch got 410 Gone for %s, resetting resourceVersion", w.ResourceType())
					w.lastRV = ""
				}
				return fmt.Errorf("watch error event for %s", w.ResourceType())
			}
			// Track the latest resourceVersion so reconnects resume from here.
			if obj, ok := ev.Object.(*unstructured.Unstructured); ok {
				if rv := obj.GetResourceVersion(); rv != "" {
					w.lastRV = rv
				}
			}
			w.handleEvent(ev)
		}
	}
}

func (w *Watcher) handleEvent(ev watch.Event) {
	obj, ok := ev.Object.(*unstructured.Unstructured)
	if !ok {
		return
	}

	var action string
	switch ev.Type {
	case watch.Added:
		action = "CREATED"
	case watch.Modified:
		action = "UPDATED"
	case watch.Deleted:
		action = "DELETED"
	default:
		return
	}

	w.callback(VisualEvent{
		ID:           makeEventID(w.clusterName, w.gvr.Group, w.gvr.Resource, obj.GetNamespace(), obj.GetName(), action),
		Cluster:      w.clusterName,
		Action:       action,
		ResourceType: w.ResourceType(),
		Name:         obj.GetName(),
		Namespace:    obj.GetNamespace(),
		Timestamp:    time.Now(),
	})
}

// Stop cancels the watcher.
func (w *Watcher) Stop() {
	w.cancel()
}

func makeEventID(cluster, group, resource, namespace, name, action string) string {
	resourceType := resource
	if group != "" {
		resourceType = resource + "." + group
	}
	if namespace != "" {
		return fmt.Sprintf("%s-%s-%s-%s-%s", cluster, resourceType, namespace, name, action)
	}
	return fmt.Sprintf("%s-%s-%s-%s", cluster, resourceType, name, action)
}

func formatResourceType(gvr schema.GroupVersionResource) string {
	if gvr.Group == "" {
		return gvr.Resource
	}
	return gvr.Resource + "." + gvr.Group
}

