import { useEffect, useRef, useState } from "react";
import { useDrag } from "../hooks/useDrag";
import type { VisualEvent } from "../types";

interface EventCardProps {
  event: VisualEvent;
  clusterColor: string;
  onPositionChange: (id: string, x: number, y: number) => void;
  onTimerRestart: (id: string) => void;
}

const actionColors: Record<string, string> = {
  CREATED: "#22c55e",
  UPDATED: "#eab308",
  DELETED: "#ef4444",
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

  const actionColor = actionColors[event.action] ?? "#94a3b8";
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
          background: "#1a1c2a",
          borderRadius: "6px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
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

        {/* Card body wrapped in action-color border */}
        <div style={{ border: `2px solid ${actionColor}`, borderTop: "none", borderRadius: "0 0 6px 6px", padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontWeight: 700, color: actionColor, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px" }}>
              {event.action}
            </span>
            {event.count > 1 && (
              <span style={{ background: actionColor, borderRadius: "10px", padding: "1px 6px", fontSize: "11px", color: "#0f1117", fontWeight: 700 }}>
                ×{event.count}
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600, marginBottom: "4px", color: "#e2e8f0" }}>{event.name}</div>
          <div style={{ color: "#7c8497", marginBottom: "4px" }}>
            {event.resourceType}{event.namespace && ` · ${event.namespace}`}
          </div>
          <div style={{ color: "#4a5068", fontSize: "11px", lineHeight: "1.6" }}>
            <div>created: {formatTime(event.createdAt)}</div>
            {event.count > 1 && <div>refreshed: {formatTime(event.refreshedAt)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
