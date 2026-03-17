export interface VisualEvent {
  id: string;
  cluster: string;
  action: "CREATED" | "UPDATED" | "DELETED";
  resourceType: string;
  name: string;
  namespace: string;
  timestamp: string;
  // Frontend-only fields
  x: number;
  y: number;
  count: number;
  expiresAt: number;   // ms timestamp
  createdAt: number;   // ms timestamp — when the card was first shown
  refreshedAt: number; // ms timestamp — when the card was last refreshed (same as createdAt if never refreshed)
}

export type ServerMessage =
  | { type: "event"; data: Omit<VisualEvent, "x" | "y"> }
  | { type: "resources_updated"; data: string[] }
  | { type: "namespaces_updated"; data: string[] };
