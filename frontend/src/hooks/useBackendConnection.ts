import { useEffect, useRef, useState } from "react";
import type { ServerMessage, VisualEvent } from "../types";

interface BackendState {
  clusterName: string;
  namespaces: string[];
  resources: string[];
  status: "connecting" | "connected" | "disconnected" | "error";
}

export function useBackendConnection(
  url: string,
  onEvent: (event: VisualEvent) => void
) {
  const [state, setState] = useState<BackendState>({
    clusterName: "",
    namespaces: [],
    resources: [],
    status: "connecting",
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Fetch cluster info, namespaces, and resources
  useEffect(() => {
    const base = url.replace(/\/+$/, "");

    Promise.all([
      fetch(`${base}/api/info`).then((r) => r.json()),
      fetch(`${base}/api/namespaces`).then((r) => r.json()),
      fetch(`${base}/api/resources`).then((r) => r.json()),
    ])
      .then(([info, namespaces, resources]) => {
        setState((prev) => ({
          ...prev,
          clusterName: info.clusterName,
          namespaces: namespaces as string[],
          resources: resources as string[],
        }));
      })
      .catch((err) => {
        console.error(`Failed to fetch info from ${url}:`, err);
        setState((prev) => ({ ...prev, status: "error" }));
      });
  }, [url]);

  // WebSocket connection
  useEffect(() => {
    let active = true;
    const base = url.replace(/\/+$/, "");
    const wsUrl = base.replace(/^http/, "ws") + "/ws";

    function connect() {
      if (!active) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setState((prev) => ({ ...prev, status: "connected" }));
      };

      ws.onmessage = (evt) => {
        const msg: ServerMessage = JSON.parse(evt.data);
        if (msg.type === "event") {
          const event: VisualEvent = {
            ...msg.data,
            x: Math.random() * 0.85,
            y: Math.random() * 0.85,
            count: 1,
            expiresAt: 0,   // set by App.tsx handleEvent
            createdAt: 0,   // set by App.tsx handleEvent
            refreshedAt: 0, // set by App.tsx handleEvent
          };
          onEventRef.current(event);
        }
      };

      ws.onclose = () => {
        setState((prev) => ({ ...prev, status: "disconnected" }));
        if (active) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      active = false;
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [url]);

  return state;
}
