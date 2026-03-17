package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// GVR identifies a Kubernetes resource type.
type GVR struct {
	Group    string `yaml:"group"`
	Version  string `yaml:"version"`
	Resource string `yaml:"resource"`
}

// ResourceFilter controls which resources to watch.
type ResourceFilter struct {
	Include []GVR `yaml:"include"`
	Exclude []GVR `yaml:"exclude"`
}

// NamespaceFilter controls which namespaces to watch.
type NamespaceFilter struct {
	Include []string `yaml:"include"`
	Exclude []string `yaml:"exclude"`
}

// RemoteBackend is a backend in another cluster that this instance can proxy to.
type RemoteBackend struct {
	Name string `yaml:"name"`
	URL  string `yaml:"url"`
}

// Config is the backend configuration.
type Config struct {
	Resources      ResourceFilter  `yaml:"resources"`
	Namespaces     NamespaceFilter `yaml:"namespaces"`
	RemoteBackends []RemoteBackend `yaml:"remoteBackends"`
}

// Load reads config from a YAML file. Returns default (watch-all) config if
// path is empty or the file does not exist.
func Load(path string) (*Config, error) {
	cfg := &Config{}
	if path == "" {
		return cfg, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, fmt.Errorf("reading config: %w", err)
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}
	return cfg, nil
}

// ShouldWatchResource returns true if the given GVR should be watched.
func (c *Config) ShouldWatchResource(group, version, resource string) bool {
	// Check exclude first
	for _, e := range c.Resources.Exclude {
		if e.Group == group && e.Version == version && e.Resource == resource {
			return false
		}
	}
	// If include list is set, must be in it
	if len(c.Resources.Include) > 0 {
		for _, i := range c.Resources.Include {
			if i.Group == group && i.Version == version && i.Resource == resource {
				return true
			}
		}
		return false
	}
	return true
}

// ShouldWatchNamespace returns true if the given namespace should be watched.
func (c *Config) ShouldWatchNamespace(ns string) bool {
	for _, e := range c.Namespaces.Exclude {
		if e == ns {
			return false
		}
	}
	if len(c.Namespaces.Include) > 0 {
		for _, i := range c.Namespaces.Include {
			if i == ns {
				return true
			}
		}
		return false
	}
	return true
}
