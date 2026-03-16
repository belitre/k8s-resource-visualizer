import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventCanvas } from "./components/EventCanvas";
import { Sidebar } from "./components/Sidebar";
import { useBackendConnection } from "./hooks/useBackendConnection";
import { useFilterState } from "./hooks/useFilterState";
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

function BackendBridge({
  url,
  onEvent,
  onConnectionChange,
}: {
  url: string;
  onEvent: (event: VisualEvent) => void;
  onConnectionChange: (url: string, info: BackendInfo) => void;
}) {
  const connection = useBackendConnection(url, onEvent);
  const callbackRef = useRef(onConnectionChange);
  callbackRef.current = onConnectionChange;

  const { clusterName, namespaces, resources, status } = connection;
  useEffect(() => {
    callbackRef.current(url, { clusterName, namespaces, resources, status });
  }, [url, clusterName, namespaces, resources, status]);

  return null;
}

export default function App() {
  const [backendUrls, setBackendUrls] = useState<string[]>([]);
  const [backendInfoMap, setBackendInfoMap] = useState<Map<string, BackendInfo>>(new Map());
  const [configBackends, setConfigBackends] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<VisualEvent[]>([]);
  const [duration, setDuration] = useState(10);
  const [clusterColorMap, setClusterColorMap] = useState<Map<string, string>>(new Map());
  // Maps backend URL → configured color from config.json
  const configColorsRef = useRef<Map<string, string>>(new Map());

  const {
    selectedNamespaces, selectedResources,
    autoSelect,
    toggleNamespace, toggleAllNamespaces,
    toggleResource, toggleAllResources,
  } = useFilterState();

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

  const handleConnectionChange = useCallback((url: string, info: BackendInfo) => {
    setBackendInfoMap((prev) => new Map(prev).set(url, info));
    autoSelect(info.namespaces, info.resources);
    if (info.clusterName) {
      const color = getClusterColor(info.clusterName, configColorsRef.current.get(url));
      setClusterColorMap((prev) =>
        prev.get(info.clusterName) === color ? prev : new Map(prev).set(info.clusterName, color)
      );
    }
  }, [autoSelect]);

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
    return {
      url,
      clusterName: info?.clusterName ?? "",
      namespaces: info?.namespaces ?? [],
      resources: info?.resources ?? [],
      status: info?.status ?? "connecting",
      removable: !configBackends.has(url),
    };
  });

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    return events.filter(
      (e) =>
        now < e.expiresAt &&
        (e.namespace === "" || selectedNamespaces.has(e.namespace)) &&
        selectedResources.has(e.resourceType)
    );
  }, [events, selectedNamespaces, selectedResources]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Sidebar
        backends={backendsForSidebar}
        duration={duration}
        onDurationChange={setDuration}
        onAddBackend={addBackend}
        onRemoveBackend={removeBackend}
        selectedNamespaces={selectedNamespaces}
        onToggleNamespace={toggleNamespace}
        onToggleAllNamespaces={toggleAllNamespaces}
        selectedResources={selectedResources}
        onToggleResource={toggleResource}
        onToggleAllResources={toggleAllResources}
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
          onEvent={handleEvent}
          onConnectionChange={handleConnectionChange}
        />
      ))}
    </div>
  );
}
