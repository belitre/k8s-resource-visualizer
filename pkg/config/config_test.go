package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadEmpty(t *testing.T) {
	cfg, err := Load("")
	if err != nil {
		t.Fatalf("Load('') error: %v", err)
	}
	if len(cfg.Resources.Include) != 0 || len(cfg.Resources.Exclude) != 0 {
		t.Error("expected empty resource filters")
	}
}

func TestLoadMissingFile(t *testing.T) {
	cfg, err := Load("/nonexistent/path.yaml")
	if err != nil {
		t.Fatalf("Load missing file error: %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}
}

func TestLoadValidFile(t *testing.T) {
	content := `
resources:
  include:
    - group: "apps"
      version: "v1"
      resource: "deployments"
  exclude:
    - group: ""
      version: "v1"
      resource: "events"
namespaces:
  include:
    - "default"
    - "production"
  exclude:
    - "kube-system"
`
	path := filepath.Join(t.TempDir(), "config.yaml")
	os.WriteFile(path, []byte(content), 0644)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load error: %v", err)
	}

	if len(cfg.Resources.Include) != 1 {
		t.Fatalf("expected 1 resource include, got %d", len(cfg.Resources.Include))
	}
	if cfg.Resources.Include[0].Resource != "deployments" {
		t.Errorf("expected deployments, got %s", cfg.Resources.Include[0].Resource)
	}
	if len(cfg.Resources.Exclude) != 1 {
		t.Fatalf("expected 1 resource exclude, got %d", len(cfg.Resources.Exclude))
	}
	if len(cfg.Namespaces.Include) != 2 {
		t.Fatalf("expected 2 namespace includes, got %d", len(cfg.Namespaces.Include))
	}
	if len(cfg.Namespaces.Exclude) != 1 {
		t.Fatalf("expected 1 namespace exclude, got %d", len(cfg.Namespaces.Exclude))
	}
}

func TestLoadRemoteBackends(t *testing.T) {
	content := `
remoteBackends:
  - name: cluster-b
    url: "http://cluster-b:8080"
  - name: cluster-c
    url: "https://cluster-c.example.com"
`
	path := filepath.Join(t.TempDir(), "config.yaml")
	os.WriteFile(path, []byte(content), 0644)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load error: %v", err)
	}
	if len(cfg.RemoteBackends) != 2 {
		t.Fatalf("expected 2 remote backends, got %d", len(cfg.RemoteBackends))
	}
	if cfg.RemoteBackends[0].Name != "cluster-b" || cfg.RemoteBackends[0].URL != "http://cluster-b:8080" {
		t.Errorf("unexpected first backend: %+v", cfg.RemoteBackends[0])
	}
	if cfg.RemoteBackends[1].Name != "cluster-c" || cfg.RemoteBackends[1].URL != "https://cluster-c.example.com" {
		t.Errorf("unexpected second backend: %+v", cfg.RemoteBackends[1])
	}
}

func TestLoadInvalidYAML(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.yaml")
	os.WriteFile(path, []byte(":::invalid"), 0644)

	_, err := Load(path)
	if err == nil {
		t.Fatal("expected error for invalid YAML")
	}
}

func TestShouldWatchResource(t *testing.T) {
	tests := []struct {
		name     string
		cfg      Config
		group    string
		version  string
		resource string
		want     bool
	}{
		{
			name: "empty config watches all",
			cfg:  Config{},
			group: "apps", version: "v1", resource: "deployments",
			want: true,
		},
		{
			name: "include list allows match",
			cfg: Config{Resources: ResourceFilter{
				Include: []GVR{{Group: "apps", Version: "v1", Resource: "deployments"}},
			}},
			group: "apps", version: "v1", resource: "deployments",
			want: true,
		},
		{
			name: "include list blocks non-match",
			cfg: Config{Resources: ResourceFilter{
				Include: []GVR{{Group: "apps", Version: "v1", Resource: "deployments"}},
			}},
			group: "", version: "v1", resource: "pods",
			want: false,
		},
		{
			name: "exclude blocks match",
			cfg: Config{Resources: ResourceFilter{
				Exclude: []GVR{{Group: "", Version: "v1", Resource: "events"}},
			}},
			group: "", version: "v1", resource: "events",
			want: false,
		},
		{
			name: "exclude takes priority over include",
			cfg: Config{Resources: ResourceFilter{
				Include: []GVR{{Group: "", Version: "v1", Resource: "events"}},
				Exclude: []GVR{{Group: "", Version: "v1", Resource: "events"}},
			}},
			group: "", version: "v1", resource: "events",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.cfg.ShouldWatchResource(tt.group, tt.version, tt.resource)
			if got != tt.want {
				t.Errorf("ShouldWatchResource() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestShouldWatchNamespace(t *testing.T) {
	tests := []struct {
		name string
		cfg  Config
		ns   string
		want bool
	}{
		{
			name: "empty config watches all",
			cfg:  Config{},
			ns:   "default",
			want: true,
		},
		{
			name: "include allows match",
			cfg:  Config{Namespaces: NamespaceFilter{Include: []string{"default"}}},
			ns:   "default",
			want: true,
		},
		{
			name: "include blocks non-match",
			cfg:  Config{Namespaces: NamespaceFilter{Include: []string{"default"}}},
			ns:   "kube-system",
			want: false,
		},
		{
			name: "exclude blocks match",
			cfg:  Config{Namespaces: NamespaceFilter{Exclude: []string{"kube-system"}}},
			ns:   "kube-system",
			want: false,
		},
		{
			name: "exclude priority over include",
			cfg: Config{Namespaces: NamespaceFilter{
				Include: []string{"kube-system"},
				Exclude: []string{"kube-system"},
			}},
			ns:   "kube-system",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.cfg.ShouldWatchNamespace(tt.ns)
			if got != tt.want {
				t.Errorf("ShouldWatchNamespace() = %v, want %v", got, tt.want)
			}
		})
	}
}
