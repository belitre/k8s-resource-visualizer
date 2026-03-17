import { useState } from "react";

interface BackendInfo {
  url: string;
  clusterName: string;
  status: string;
  removable: boolean;
  enabled: boolean;
}

interface SidebarProps {
  backends: BackendInfo[];
  duration: number;
  onDurationChange: (d: number) => void;
  onAddBackend: (url: string) => void;
  onRemoveBackend: (url: string) => void;
  onToggleBackend: (url: string) => void;
  namespaces: string[];
  selectedNamespaces: Set<string>;
  onToggleNamespace: (ns: string) => void;
  onToggleAllNamespaces: (namespaces: string[], selected: boolean) => void;
  resources: string[];
  selectedResources: Set<string>;
  onToggleResource: (rt: string) => void;
  onToggleAllResources: (resources: string[], selected: boolean) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const statusColors: Record<string, string> = {
  connected: "#22c55e",
  connecting: "#eab308",
  disconnected: "#94a3b8",
  error: "#ef4444",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  border: "1px solid #2a2d3d",
  borderRadius: "4px",
  fontSize: "12px",
  background: "#1a1c2a",
  color: "#c8cdd8",
  marginBottom: "6px",
  boxSizing: "border-box",
};

function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: "12px",
        textTransform: "uppercase",
        color: "#64748b",
        letterSpacing: "0.5px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {label}
      <span style={{ fontSize: "10px" }}>{open ? "▲" : "▼"}</span>
    </button>
  );
}

function CheckboxFilter({
  items,
  selected,
  onToggle,
  onToggleAll,
  filterPlaceholder,
  fontSize = "13px",
  getLabel = (item: string) => item,
}: {
  items: string[];
  selected: Set<string>;
  onToggle: (item: string) => void;
  onToggleAll: (items: string[], selected: boolean) => void;
  filterPlaceholder: string;
  fontSize?: string;
  getLabel?: (item: string) => string;
}) {
  const [filter, setFilter] = useState("");
  const filtered = filter ? items.filter((i) => getLabel(i).toLowerCase().includes(filter.toLowerCase())) : items;
  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i));

  return (
    <div style={{ padding: "0 16px 8px" }}>
      <input
        type="text"
        placeholder={filterPlaceholder}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={inputStyle}
      />
      <label style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", cursor: "pointer", fontSize, fontWeight: 600, borderBottom: "1px solid #1e2030", paddingBottom: "6px", marginBottom: "4px" }}>
        <input type="checkbox" checked={allSelected} onChange={() => onToggleAll(filtered, !allSelected)} />
        Select all{filter ? ` (${filtered.length})` : ""}
      </label>
      {filtered.map((item) => (
        <label key={item} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", cursor: "pointer", fontSize }}>
          <input type="checkbox" checked={selected.has(item)} onChange={() => onToggle(item)} />
          {getLabel(item)}
        </label>
      ))}
    </div>
  );
}

function BackendItem({ backend, onRemove, onToggle }: {
  backend: BackendInfo;
  onRemove: () => void;
  onToggle: () => void;
}) {
  return (
    <div style={{ borderTop: "1px solid #1e2030", padding: "8px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
      <input
        type="checkbox"
        checked={backend.enabled}
        onChange={onToggle}
        title={backend.enabled ? "Disable events from this backend" : "Enable events from this backend"}
      />
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColors[backend.status] ?? "#94a3b8", display: "inline-block", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: "13px", color: "#c8cdd8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {backend.clusterName || backend.url}
      </span>
      {backend.removable && (
        <button
          onClick={onRemove}
          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "18px", lineHeight: 1, flexShrink: 0 }}
          title="Remove backend"
        >
          &times;
        </button>
      )}
    </div>
  );
}

export function Sidebar({
  backends,
  duration,
  onDurationChange,
  onAddBackend,
  onRemoveBackend,
  onToggleBackend,
  namespaces,
  selectedNamespaces,
  onToggleNamespace,
  onToggleAllNamespaces,
  resources,
  selectedResources,
  onToggleResource,
  onToggleAllResources,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [newUrl, setNewUrl] = useState("");
  const [backendsOpen, setBackendsOpen] = useState(true);
  const [namespacesOpen, setNamespacesOpen] = useState(true);
  const [resourcesOpen, setResourcesOpen] = useState(true);

  const nsLabel = (item: string) => item === "" ? "Non-namespaced" : item;

  const handleAdd = () => {
    const url = newUrl.trim();
    if (url) {
      onAddBackend(url);
      setNewUrl("");
    }
  };

  if (collapsed) {
    return (
      <div style={{ width: "32px", minWidth: "32px", borderRight: "1px solid #1e2030", background: "#13151f", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "8px" }}>
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "18px", padding: "4px", lineHeight: 1 }}
        >
          ›
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: "300px", minWidth: "300px", borderRight: "1px solid #1e2030", background: "#13151f", color: "#c8cdd8", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", fontSize: "14px", overflow: "hidden" }}>
      <div style={{ padding: "16px", borderBottom: "1px solid #1e2030", fontWeight: 700, fontSize: "16px", color: "#e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        K8s Resource Visualizer
        <button
          onClick={onToggleCollapse}
          title="Collapse sidebar"
          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "18px", padding: "0 0 0 8px", lineHeight: 1 }}
        >
          ‹
        </button>
      </div>

      <div style={{ padding: "16px", borderBottom: "1px solid #1e2030" }}>
        <label style={{ fontWeight: 600, display: "block", marginBottom: "8px" }}>Event Duration: {duration}s</label>
        <input type="range" min={3} max={60} value={duration} onChange={(e) => onDurationChange(Number(e.target.value))} style={{ width: "100%" }} />
      </div>

      <div style={{ padding: "16px", borderBottom: "1px solid #1e2030" }}>
        <label style={{ fontWeight: 600, display: "block", marginBottom: "8px" }}>Add Backend</label>
        <div style={{ display: "flex", gap: "6px" }}>
          <input
            type="text"
            placeholder="http://backend-url:8080"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            style={{ flex: 1, padding: "6px 10px", border: "1px solid #2a2d3d", borderRadius: "4px", fontSize: "13px", background: "#1a1c2a", color: "#c8cdd8" }}
          />
          <button onClick={handleAdd} style={{ padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}>
            Add
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Backends */}
        <div style={{ borderBottom: "1px solid #1e2030" }}>
          <SectionHeader label={`Backends${backends.length > 0 ? ` (${backends.length})` : ""}`} open={backendsOpen} onToggle={() => setBackendsOpen((o) => !o)} />
          {backendsOpen && backends.length === 0 && (
            <div style={{ padding: "0 16px 12px", color: "#94a3b8", fontSize: "13px" }}>No backends connected. Add a backend URL above.</div>
          )}
          {backendsOpen && backends.map((backend) => (
            <BackendItem
              key={backend.url}
              backend={backend}
              onRemove={() => onRemoveBackend(backend.url)}
              onToggle={() => onToggleBackend(backend.url)}
            />
          ))}
        </div>

        {/* Namespaces */}
        <div style={{ borderBottom: "1px solid #1e2030" }}>
          <SectionHeader label="Namespaces" open={namespacesOpen} onToggle={() => setNamespacesOpen((o) => !o)} />
          {namespacesOpen && (
            <CheckboxFilter
              items={namespaces}
              selected={selectedNamespaces}
              onToggle={onToggleNamespace}
              onToggleAll={onToggleAllNamespaces}
              filterPlaceholder="Filter namespaces…"
              fontSize="12px"
              getLabel={nsLabel}
            />
          )}
        </div>

        {/* Resource Types */}
        <div style={{ borderBottom: "1px solid #1e2030" }}>
          <SectionHeader label="Resource Types" open={resourcesOpen} onToggle={() => setResourcesOpen((o) => !o)} />
          {resourcesOpen && (
            <CheckboxFilter
              items={resources}
              selected={selectedResources}
              onToggle={onToggleResource}
              onToggleAll={onToggleAllResources}
              filterPlaceholder="Filter resource types…"
              fontSize="12px"
            />
          )}
        </div>
      </div>
    </div>
  );
}
