import type { VisualEvent } from "../types";
import { EventCard } from "./EventCard";

interface EventCanvasProps {
  events: VisualEvent[];
  clusterColorMap: Map<string, string>;
  onPositionChange: (id: string, x: number, y: number) => void;
  onTimerRestart: (id: string) => void;
}

export function EventCanvas({ events, clusterColorMap, onPositionChange, onTimerRestart }: EventCanvasProps) {
  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "#0f1117",
      }}
    >
      {events.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#3b3f54",
            fontSize: "18px",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Waiting for resource events…
        </div>
      )}
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          clusterColor={clusterColorMap.get(event.cluster) ?? "#94a3b8"}
          onPositionChange={onPositionChange}
          onTimerRestart={onTimerRestart}
        />
      ))}
    </div>
  );
}
