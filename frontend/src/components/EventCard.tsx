import { useEffect, useRef, useState } from "react";
import { useDrag } from "../hooks/useDrag";
import type { VisualEvent } from "../types";

interface EventCardProps {
  event: VisualEvent;
  clusterColor: string;
  onPositionChange: (id: string, x: number, y: number) => void;
  onTimerRestart: (id: string) => void;
}

interface ActionTheme {
  bg: string;
  border: string;
  label: string;      // action label + count badge bg
  labelText: string;  // count badge text
  text: string;       // primary text (name)
  muted: string;      // secondary text (resourceType, timestamps)
  nsBg: string;       // namespace badge background
  nsBorder: string;
  nsText: string;
}

const actionThemes: Record<string, ActionTheme> = {
  CREATED: {
    bg:        "#ccfbf1",
    border:    "#5eead4",
    label:     "#0f766e",
    labelText: "#ffffff",
    text:      "#134e4a",
    muted:     "#0f766e",
    nsBg:      "#99f6e4",
    nsBorder:  "#5eead4",
    nsText:    "#0f766e",
  },
  UPDATED: {
    bg:        "#ede9fe",
    border:    "#c4b5fd",
    label:     "#5b21b6",
    labelText: "#ffffff",
    text:      "#3b0764",
    muted:     "#6d28d9",
    nsBg:      "#ddd6fe",
    nsBorder:  "#c4b5fd",
    nsText:    "#5b21b6",
  },
  DELETED: {
    bg:        "#ffe4e6",
    border:    "#fda4af",
    label:     "#9f1239",
    labelText: "#ffffff",
    text:      "#881337",
    muted:     "#be123c",
    nsBg:      "#fecdd3",
    nsBorder:  "#fda4af",
    nsText:    "#9f1239",
  },
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function EventCard({ event, clusterColor, onPositionChange, onTimerRestart }: EventCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { pos, isDragging, handleMouseDown } = useDrag(
    cardRef,
    { x: event.x, y: event.y },
    {
      onDragStart: () => onTimerRestart(event.id),
      onDragEnd: (x, y) => { onPositionChange(event.id, x, y); onTimerRestart(event.id); },
      onClick: () => onTimerRestart(event.id),
    }
  );

  // Restart CSS animation whenever expiresAt changes (counter refresh, explicit timer restart)
  const [animKey, setAnimKey] = useState(0);
  const prevExpiresAtRef = useRef(event.expiresAt);
  useEffect(() => {
    if (event.expiresAt !== prevExpiresAtRef.current) {
      prevExpiresAtRef.current = event.expiresAt;
      setAnimKey((k) => k + 1);
    }
  }, [event.expiresAt]);


  const theme = actionThemes[event.action] ?? actionThemes.DELETED;
  const remainingS = Math.max(0, (event.expiresAt - Date.now()) / 1000);

  return (
    <div
      ref={cardRef}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        zIndex: isDragging ? 10 : 1,
      }}
    >
      <div
        key={animKey}
        style={{
          background: theme.bg,
          border: `1.5px solid ${theme.border}`,
          borderRadius: "6px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
          minWidth: "200px",
          maxWidth: "300px",
          fontSize: "13px",
          fontFamily: "system-ui, sans-serif",
          animation: `fadeIn 0.3s ease-in, fadeOut ${remainingS}s linear forwards`,
          animationPlayState: isDragging ? "paused" : "running",
          overflow: "hidden",
        }}
      >
        {/* Cluster header */}
        <div style={{
          background: clusterColor,
          color: "#0f1117",
          fontWeight: 700,
          fontSize: "11px",
          padding: "3px 10px",
          letterSpacing: "0.3px",
          textAlign: "center",
        }}>
          {event.cluster}
        </div>

        {/* Card body */}
        <div style={{ padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontWeight: 700, color: theme.label, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px" }}>
              {event.action}
            </span>
            {event.count > 1 && (
              <span style={{ background: theme.label, borderRadius: "10px", padding: "1px 6px", fontSize: "11px", color: theme.labelText, fontWeight: 700 }}>
                ×{event.count}
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600, marginBottom: "6px", color: theme.text }}>{event.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span style={{ color: theme.muted, fontSize: "12px" }}>{event.resourceType}</span>
            {event.namespace && (
              <span style={{
                background: theme.nsBg,
                border: `1px solid ${theme.nsBorder}`,
                borderRadius: "4px",
                padding: "1px 7px",
                fontSize: "11px",
                color: theme.nsText,
                fontWeight: 600,
                letterSpacing: "0.2px",
              }}>
                {event.namespace}
              </span>
            )}
          </div>
          <div style={{ color: theme.muted, fontSize: "11px", lineHeight: "1.6", opacity: 0.8 }}>
            <div>created: {formatTime(event.createdAt)}</div>
            {event.count > 1 && <div>refreshed: {formatTime(event.refreshedAt)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
