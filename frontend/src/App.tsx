import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventCanvas } from "./components/EventCanvas";
import { Sidebar } from "./components/Sidebar";
import { useBackendConnection } from "./hooks/useBackendConnection";
import { mergeEvent } from "./utils/eventMerge";
import { getClusterColor } from "./utils/clusterColor";
import type { VisualEvent } from "./types";

type BackendEntry = string | { url: string; color?: string };

interface BackendInfo {
  clusterName: string;
  namespaces: string[];
  resources: string[];
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

export default function App() {
  const [backendUrls, setBackendUrls] = useState<string[]>([]);
  const [backendInfoMap, setBackendInfoMap] = useState<Map<string, BackendInfo>>(new Map());
  const [configBackends, setConfigBackends] = useState<Set<string>>(new Set());
  // URLs auto-discovered via /api/proxy-backends — not removable, not recursed into
  const [proxyBackendUrls, setProxyBackendUrls] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<VisualEvent[]>([]);
  const [duration, setDuration] = useState(10);
  const [clusterColorMap, setClusterColorMap] = useState<Map<string, string>>(new Map());
  // Maps backend URL → configured color from config.json
  const configColorsRef = useRef<Map<string, string>>(new Map());
  // Per-cluster filter state keyed by clusterName
  const [clusterFilterMap, setClusterFilterMap] = useState<Map<string, { selectedNamespaces: Set<string>; selectedResources: Set<string>; knownResources: Set<string> }>>(new Map());

  useEffect(() => {
    fetch("/config.json")
      .then((r) => r.json())
      .then((config: { backends?: BackendEntry[] }) => {
        if (!config.backends) return;
        const urls: string[] = [];
        const colorMap = new Map<string, string>();
        for (const entry of config.backends) {
          const url = typeof entry === "string" ? entry : entry.url;
          const color = typeof entry === "string" ? undefined : entry.color;
          urls.push(url);
          if (color) colorMap.set(url, color);
        }
        configColorsRef.current = colorMap;
        setConfigBackends(new Set(urls));
        setBackendUrls((prev) => {
          const next = [...prev];
          for (const url of urls) {
            if (!next.includes(url)) next.push(url);
          }
          return next;
        });
      })
      .catch(() => {});
  }, []);

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

  const autoSelectForCluster = useCallback((clusterName: string, namespaces: string[], resources: string[]) => {
    if (!clusterName) return;
    setClusterFilterMap((prev) => {
      const isNew = !prev.has(clusterName);
      const existing = prev.get(clusterName) ?? { selectedNamespaces: new Set<string>(), selectedResources: new Set<string>(), knownResources: new Set<string>() };
      const newNs = new Set(existing.selectedNamespaces);
      const newRes = new Set(existing.selectedResources);
      const newKnown = new Set(existing.knownResources);
      let changed = isNew;
      // Always select "" so non-namespaced resources are visible by default
      if (!newNs.has("")) { newNs.add(""); changed = true; }
      for (const ns of namespaces) {
        if (!newNs.has(ns)) { newNs.add(ns); changed = true; }
      }
      for (const rt of resources) {
        const isActuallyNew = !newKnown.has(rt);
        if (isActuallyNew) {
          newKnown.add(rt);
          changed = true;
          // Auto-select only if first connection OR user has some resources selected
          if (isNew || newRes.size > 0) {
            newRes.add(rt);
          }
        }
      }
      if (!changed) return prev;
      return new Map(prev).set(clusterName, { selectedNamespaces: newNs, selectedResources: newRes, knownResources: newKnown });
    });
  }, []);

  const handleToggleClusterNamespace = useCallback((clusterName: string, ns: string) => {
    setClusterFilterMap((prev) => {
      const existing = prev.get(clusterName);
      if (!existing) return prev;
      const next = new Set(existing.selectedNamespaces);
      if (next.has(ns)) next.delete(ns); else next.add(ns);
      return new Map(prev).set(clusterName, { ...existing, selectedNamespaces: next });
    });
  }, []);

  const handleToggleAllClusterNamespaces = useCallback((clusterName: string, namespaces: string[], selected: boolean) => {
    setClusterFilterMap((prev) => {
      const existing = prev.get(clusterName);
      if (!existing) return prev;
      const next = new Set(existing.selectedNamespaces);
      for (const ns of namespaces) {
        if (selected) next.add(ns); else next.delete(ns);
      }
      return new Map(prev).set(clusterName, { ...existing, selectedNamespaces: next });
    });
  }, []);

  const handleToggleClusterResource = useCallback((clusterName: string, rt: string) => {
    setClusterFilterMap((prev) => {
      const existing = prev.get(clusterName);
      if (!existing) return prev;
      const next = new Set(existing.selectedResources);
      if (next.has(rt)) next.delete(rt); else next.add(rt);
      return new Map(prev).set(clusterName, { ...existing, selectedResources: next });
    });
  }, []);

  const handleToggleAllClusterResources = useCallback((clusterName: string, resources: string[], selected: boolean) => {
    setClusterFilterMap((prev) => {
      const existing = prev.get(clusterName);
      if (!existing) return prev;
      const next = new Set(existing.selectedResources);
      for (const rt of resources) {
        if (selected) next.add(rt); else next.delete(rt);
      }
      return new Map(prev).set(clusterName, { ...existing, selectedResources: next });
    });
  }, []);

  const handleConnectionChange = useCallback((url: string, info: BackendInfo) => {
    setBackendInfoMap((prev) => new Map(prev).set(url, info));
    autoSelectForCluster(info.clusterName, info.namespaces, info.resources);
    if (info.clusterName) {
      const color = getClusterColor(info.clusterName, configColorsRef.current.get(url));
      setClusterColorMap((prev) =>
        prev.get(info.clusterName) === color ? prev : new Map(prev).set(info.clusterName, color)
      );
    }
  }, [autoSelectForCluster]);

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
    const clusterFilter = clusterFilterMap.get(clusterName);
    return {
      url,
      clusterName,
      namespaces: info?.namespaces ?? [],
      resources: info?.resources ?? [],
      status: info?.status ?? "connecting",
      removable: !configBackends.has(url) && !proxyBackendUrls.has(url),
      selectedNamespaces: clusterFilter?.selectedNamespaces ?? new Set<string>(),
      selectedResources: clusterFilter?.selectedResources ?? new Set<string>(),
    };
  });

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    return events.filter((e) => {
      if (now >= e.expiresAt) return false;
      const clusterFilter = clusterFilterMap.get(e.cluster);
      if (clusterFilter) {
        if (!clusterFilter.selectedNamespaces.has(e.namespace)) return false;
        if (!clusterFilter.selectedResources.has(e.resourceType)) return false;
      }
      return true;
    });
  }, [events, clusterFilterMap]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Sidebar
        backends={backendsForSidebar}
        duration={duration}
        onDurationChange={setDuration}
        onAddBackend={addBackend}
        onRemoveBackend={removeBackend}
        onToggleClusterNamespace={handleToggleClusterNamespace}
        onToggleAllClusterNamespaces={handleToggleAllClusterNamespaces}
        onToggleClusterResource={handleToggleClusterResource}
        onToggleAllClusterResources={handleToggleAllClusterResources}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />
      <EventCanvas
        events={filteredEvents}
        clusterColorMap={clusterColorMap}
        onPositionChange={handlePositionChange}
        onTimerRestart={handleTimerRestart}
      />
      {backendUrls.map((url) => (
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
