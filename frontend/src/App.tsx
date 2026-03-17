import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventCanvas } from "./components/EventCanvas";
import { Sidebar } from "./components/Sidebar";
import { useBackendConnection } from "./hooks/useBackendConnection";
import { mergeEvent } from "./utils/eventMerge";
import { getClusterColor } from "./utils/clusterColor";
import type { DefaultResourceRule, ResourceInfo, VisualEvent } from "./types";

type BackendEntry = string | { url: string; color?: string };

function matchesDefaultResource(r: ResourceInfo, rules: DefaultResourceRule[]): boolean {
  return rules.some(
    (rule) =>
      (rule.group === "*" || rule.group === r.group) &&
      (rule.version === "*" || rule.version === r.version) &&
      (rule.resource === "*" || rule.resource === r.resource)
  );
}

interface BackendInfo {
  clusterName: string;
  namespaces: string[];
  resources: ResourceInfo[];
  status: string;
}

interface ProxyBackendInfo {
  name: string;
  color?: string;
}

function BackendBridge({
  url,
  isProxy,
  onEvent,
  onConnectionChange,
  onProxyBackendsDiscovered,
}: {
  url: string;
  isProxy: boolean;
  onEvent: (event: VisualEvent) => void;
  onConnectionChange: (url: string, info: BackendInfo) => void;
  onProxyBackendsDiscovered: (primaryUrl: string, backends: ProxyBackendInfo[]) => void;
}) {
  const connection = useBackendConnection(url, onEvent);
  const callbackRef = useRef(onConnectionChange);
  callbackRef.current = onConnectionChange;
  const discoveryCallbackRef = useRef(onProxyBackendsDiscovered);
  discoveryCallbackRef.current = onProxyBackendsDiscovered;

  const { clusterName, namespaces, resources, status } = connection;
  useEffect(() => {
    callbackRef.current(url, { clusterName, namespaces, resources, status });
  }, [url, clusterName, namespaces, resources, status]);

  // When a non-proxy backend connects, discover its proxy backends.
  // Skipped for proxy backends to prevent recursive discovery.
  useEffect(() => {
    if (isProxy || status !== "connected") return;
    const base = url.replace(/\/+$/, "");
    fetch(`${base}/api/proxy-backends`)
      .then((r) => r.json())
      .then((backends: ProxyBackendInfo[]) => {
        if (backends.length > 0) discoveryCallbackRef.current(url, backends);
      })
      .catch(() => {});
  }, [url, isProxy, status]);

  return null;
}

interface GlobalFilter {
  selectedNamespaces: Set<string>;
  selectedResources: Set<string>;
  knownNamespaces: Set<string>;
  knownResources: Set<string>;
}

export default function App() {
  const selfUrl = window.location.origin;
  const [backendUrls, setBackendUrls] = useState<string[]>([selfUrl]);
  const [backendInfoMap, setBackendInfoMap] = useState<Map<string, BackendInfo>>(new Map());
  const [configBackends, setConfigBackends] = useState<Set<string>>(new Set([selfUrl]));
  // URLs auto-discovered via /api/proxy-backends — not removable, not recursed into
  const [proxyBackendUrls, setProxyBackendUrls] = useState<Set<string>>(new Set());
  const [disabledBackends, setDisabledBackends] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<VisualEvent[]>([]);
  const [duration, setDuration] = useState(10);
  const [clusterColorMap, setClusterColorMap] = useState<Map<string, string>>(new Map());
  // Maps backend URL → configured color from config.json
  const configColorsRef = useRef<Map<string, string>>(new Map());
  const defaultResourcesRef = useRef<DefaultResourceRule[]>([]);
  // Tracks backends whose initial resource list has already been processed
  const initializedBackendsRef = useRef<Set<string>>(new Set());
  // Global filter state shared across all clusters
  const [globalFilter, setGlobalFilter] = useState<GlobalFilter>({
    selectedNamespaces: new Set(),
    selectedResources: new Set(),
    knownNamespaces: new Set(),
    knownResources: new Set(),
  });

  useEffect(() => {
    fetch("/config.json")
      .then((r) => r.json())
      .then((config: { selfColor?: string; backends?: BackendEntry[]; defaultResources?: DefaultResourceRule[] }) => {
        if (config.defaultResources) defaultResourcesRef.current = config.defaultResources;
        const colorMap = new Map<string, string>();
        if (config.selfColor) colorMap.set(selfUrl, config.selfColor);
        const extraUrls: string[] = [];
        for (const entry of config.backends ?? []) {
          const url = typeof entry === "string" ? entry : entry.url;
          const color = typeof entry === "string" ? undefined : entry.color;
          extraUrls.push(url);
          if (color) colorMap.set(url, color);
        }
        configColorsRef.current = colorMap;
        if (extraUrls.length > 0) {
          setConfigBackends((prev) => new Set([...prev, ...extraUrls]));
          setBackendUrls((prev) => {
            const next = [...prev];
            for (const url of extraUrls) {
              if (!next.includes(url)) next.push(url);
            }
            return next;
          });
        }
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true));
  }, [selfUrl]);

  // Remove expired events on a 500ms tick, regardless of filter visibility
  useEffect(() => {
    const interval = setInterval(() => {
      setEvents((prev) => prev.filter((e) => Date.now() < e.expiresAt));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleEvent = useCallback((event: VisualEvent) => {
    setEvents((prev) => mergeEvent(prev, event, duration, Date.now()));
  }, [duration]);

  const handleTimerRestart = useCallback((id: string) => {
    setEvents((prev) =>
      prev.map((e) => e.id === id ? { ...e, expiresAt: Date.now() + duration * 1000 } : e)
    );
  }, [duration]);

  const handlePositionChange = useCallback((id: string, x: number, y: number) => {
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, x, y } : e));
  }, []);

  const autoSelectGlobal = useCallback((namespaces: string[], resources: ResourceInfo[], isInitialLoad: boolean) => {
    setGlobalFilter((prev) => {
      const newNs = new Set(prev.selectedNamespaces);
      const newRes = new Set(prev.selectedResources);
      const newKnownNs = new Set(prev.knownNamespaces);
      const newKnownRes = new Set(prev.knownResources);
      let changed = false;

      // "" sentinel always selected so non-namespaced resources are visible by default
      if (!newNs.has("")) { newNs.add(""); changed = true; }

      for (const ns of namespaces) {
        if (!newKnownNs.has(ns)) {
          newKnownNs.add(ns);
          changed = true;
          const hasRealNsSelected = [...newNs].some((n) => n !== "");
          if (prev.knownNamespaces.size === 0 || hasRealNsSelected) {
            newNs.add(ns);
          }
        }
      }

      for (const r of resources) {
        if (!newKnownRes.has(r.key)) {
          newKnownRes.add(r.key);
          changed = true;
          // On a backend's initial load, only select resources matching defaultResources.
          // For subsequent updates (new CRDs), also auto-select if the user already has
          // resources selected — mirrors the namespace auto-select behaviour.
          const hasResourcesSelected = prev.selectedResources.size > 0;
          if (matchesDefaultResource(r, defaultResourcesRef.current) || (!isInitialLoad && hasResourcesSelected)) {
            newRes.add(r.key);
          }
        }
      }

      if (!changed) return prev;
      return { selectedNamespaces: newNs, selectedResources: newRes, knownNamespaces: newKnownNs, knownResources: newKnownRes };
    });
  }, []);

  const handleToggleNamespace = useCallback((ns: string) => {
    setGlobalFilter((prev) => {
      const next = new Set(prev.selectedNamespaces);
      if (next.has(ns)) next.delete(ns); else next.add(ns);
      return { ...prev, selectedNamespaces: next };
    });
  }, []);

  const handleToggleAllNamespaces = useCallback((namespaces: string[], selected: boolean) => {
    setGlobalFilter((prev) => {
      const next = new Set(prev.selectedNamespaces);
      for (const ns of namespaces) {
        if (selected) next.add(ns); else next.delete(ns);
      }
      return { ...prev, selectedNamespaces: next };
    });
  }, []);

  const handleToggleResource = useCallback((rt: string) => {
    setGlobalFilter((prev) => {
      const next = new Set(prev.selectedResources);
      if (next.has(rt)) next.delete(rt); else next.add(rt);
      return { ...prev, selectedResources: next };
    });
  }, []);

  const handleToggleAllResources = useCallback((resources: string[], selected: boolean) => {
    setGlobalFilter((prev) => {
      const next = new Set(prev.selectedResources);
      for (const rt of resources) {
        if (selected) next.add(rt); else next.delete(rt);
      }
      return { ...prev, selectedResources: next };
    });
  }, []);

  const handleToggleBackend = useCallback((url: string) => {
    setDisabledBackends((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }, []);

  const handleConnectionChange = useCallback((url: string, info: BackendInfo) => {
    setBackendInfoMap((prev) => new Map(prev).set(url, info));
    if (info.clusterName) {
      const isInitialLoad = !initializedBackendsRef.current.has(url);
      if (isInitialLoad && info.resources.length > 0) initializedBackendsRef.current.add(url);
      autoSelectGlobal(info.namespaces, info.resources, isInitialLoad);
      const color = getClusterColor(info.clusterName, configColorsRef.current.get(url));
      setClusterColorMap((prev) =>
        prev.get(info.clusterName) === color ? prev : new Map(prev).set(info.clusterName, color)
      );
    }
  }, [autoSelectGlobal]);

  const handleProxyBackendsDiscovered = useCallback((primaryUrl: string, backends: ProxyBackendInfo[]) => {
    const base = primaryUrl.replace(/\/+$/, "");
    const newUrls: string[] = [];
    for (const b of backends) {
      const proxyUrl = `${base}/proxy/${b.name}`;
      newUrls.push(proxyUrl);
      if (b.color) configColorsRef.current.set(proxyUrl, b.color);
    }
    setProxyBackendUrls((prev) => {
      const next = new Set(prev);
      for (const u of newUrls) next.add(u);
      return next;
    });
    setBackendUrls((prev) => {
      const next = [...prev];
      for (const u of newUrls) {
        if (!next.includes(u)) next.push(u);
      }
      return next;
    });
  }, []);

  const addBackend = useCallback((url: string) => {
    setBackendUrls((prev) => prev.includes(url) ? prev : [...prev, url]);
  }, []);

  const removeBackend = useCallback((url: string) => {
    setBackendUrls((prev) => prev.filter((u) => u !== url));
    setBackendInfoMap((prev) => {
      const next = new Map(prev);
      next.delete(url);
      return next;
    });
  }, []);

  const backendsForSidebar = backendUrls.map((url) => {
    const info = backendInfoMap.get(url);
    const clusterName = info?.clusterName ?? "";
    return {
      url,
      clusterName,
      status: info?.status ?? "connecting",
      removable: !configBackends.has(url) && !proxyBackendUrls.has(url),
      enabled: !disabledBackends.has(url),
      color: clusterName ? clusterColorMap.get(clusterName) : undefined,
    };
  });

  const allNamespaces = useMemo(() => {
    const nsSet = new Set<string>();
    for (const info of backendInfoMap.values()) {
      for (const ns of info.namespaces) nsSet.add(ns);
    }
    return ["", ...Array.from(nsSet).sort()];
  }, [backendInfoMap]);

  const allResources = useMemo(() => {
    const map = new Map<string, ResourceInfo>();
    for (const info of backendInfoMap.values()) {
      for (const r of info.resources) map.set(r.key, r);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [backendInfoMap]);

  // When resources or namespaces disappear from all backends, remove them from
  // knownResources/knownNamespaces so they are treated as new if they reappear.
  useEffect(() => {
    const currentKeys = new Set(allResources.map((r) => r.key));
    setGlobalFilter((prev) => {
      const newKnownRes = new Set([...prev.knownResources].filter((k) => currentKeys.has(k)));
      if (newKnownRes.size === prev.knownResources.size) return prev;
      return { ...prev, knownResources: newKnownRes };
    });
  }, [allResources]);

  useEffect(() => {
    const currentNs = new Set(allNamespaces);
    setGlobalFilter((prev) => {
      const newKnownNs = new Set([...prev.knownNamespaces].filter((ns) => currentNs.has(ns)));
      if (newKnownNs.size === prev.knownNamespaces.size) return prev;
      return { ...prev, knownNamespaces: newKnownNs };
    });
  }, [allNamespaces]);

  // Set of cluster names whose backend is disabled — used to filter events
  const disabledClusters = useMemo(() => {
    const result = new Set<string>();
    for (const [url, info] of backendInfoMap) {
      if (disabledBackends.has(url) && info.clusterName) {
        result.add(info.clusterName);
      }
    }
    return result;
  }, [disabledBackends, backendInfoMap]);

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    return events.filter((e) => {
      if (now >= e.expiresAt) return false;
      if (disabledClusters.has(e.cluster)) return false;
      if (!globalFilter.selectedNamespaces.has(e.namespace)) return false;
      if (!globalFilter.selectedResources.has(e.resourceType)) return false;
      return true;
    });
  }, [events, disabledClusters, globalFilter.selectedNamespaces, globalFilter.selectedResources]);

  const [configLoaded, setConfigLoaded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Sidebar
        backends={backendsForSidebar}
        duration={duration}
        onDurationChange={setDuration}
        onAddBackend={addBackend}
        onRemoveBackend={removeBackend}
        onToggleBackend={handleToggleBackend}
        namespaces={allNamespaces}
        selectedNamespaces={globalFilter.selectedNamespaces}
        onToggleNamespace={handleToggleNamespace}
        onToggleAllNamespaces={handleToggleAllNamespaces}
        resources={allResources}
        selectedResources={globalFilter.selectedResources}
        onToggleResource={handleToggleResource}
        onToggleAllResources={handleToggleAllResources}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />
      <EventCanvas
        events={filteredEvents}
        clusterColorMap={clusterColorMap}
        onPositionChange={handlePositionChange}
        onTimerRestart={handleTimerRestart}
      />
      {configLoaded && backendUrls.map((url) => (
        <BackendBridge
          key={url}
          url={url}
          isProxy={proxyBackendUrls.has(url)}
          onEvent={handleEvent}
          onConnectionChange={handleConnectionChange}
          onProxyBackendsDiscovered={handleProxyBackendsDiscovered}
        />
      ))}
    </div>
  );
}
