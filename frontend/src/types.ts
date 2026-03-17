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

// Rule for auto-selecting resources on startup. Use "*" to match any value.
export interface DefaultResourceRule {
  group: string;
  version: string;
  resource: string;
}

export interface ResourceInfo {
  group: string;
  version: string;
  resource: string;
  key: string; // matches VisualEvent.resourceType (e.g. "deployments.apps", "pods")
}

export type ServerMessage =
  | { type: "event"; data: Omit<VisualEvent, "x" | "y"> }
  | { type: "resources_updated"; data: ResourceInfo[] }
  | { type: "namespaces_updated"; data: string[] };
