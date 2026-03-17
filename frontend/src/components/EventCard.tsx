import { useEffect, useRef, useState } from "react";
import { useDrag } from "../hooks/useDrag";
import type { VisualEvent } from "../types";

// Kubernetes resource icons — Apache-2.0
// https://github.com/kubernetes/community/tree/master/icons
import k8sPod     from "../assets/k8s-icons/pod.svg";
import k8sDeploy  from "../assets/k8s-icons/deploy.svg";
import k8sCronjob from "../assets/k8s-icons/cronjob.svg";
import k8sHpa     from "../assets/k8s-icons/hpa.svg";
import k8sIng     from "../assets/k8s-icons/ing.svg";
import k8sRole    from "../assets/k8s-icons/role.svg";
import k8sSc      from "../assets/k8s-icons/sc.svg";
import k8sCrd     from "../assets/k8s-icons/crd.svg";

// CNCF project icons — https://github.com/cncf/artwork (Linux Foundation Trademark Usage Guidelines)
import iconCertManager from "../assets/k8s-icons/cert-manager.svg";
import iconArgo        from "../assets/k8s-icons/argo.svg";
import iconFlux        from "../assets/k8s-icons/flux.svg";
import iconPrometheus  from "../assets/k8s-icons/prometheus.svg";

interface EventCardProps {
  event: VisualEvent;
  clusterColor: string;
  onPositionChange: (id: string, x: number, y: number) => void;
  onTimerRestart: (id: string) => void;
}

interface ActionTheme {
  bg: string;
  border: string;
  label: string;
  labelText: string;
  text: string;
  muted: string;
  nsBg: string;
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

interface GroupStyle {
  accent: string;
  // svg: Kubernetes community icon (white circle background, coloured icon)
  // emoji: fallback for third-party groups without an official k8s icon
  overlaySvg?: string;
  overlayEmoji?: string;
}

const groupStyles: Record<string, GroupStyle> = {
  "":                              { accent: "#64748b", overlaySvg: k8sPod     },
  "apps":                          { accent: "#3b82f6", overlaySvg: k8sDeploy  },
  "batch":                         { accent: "#a855f7", overlaySvg: k8sCronjob },
  "autoscaling":                   { accent: "#f97316", overlaySvg: k8sHpa     },
  "policy":                        { accent: "#78716c"                          },
  "networking.k8s.io":             { accent: "#06b6d4", overlaySvg: k8sIng     },
  "gateway.networking.k8s.io":     { accent: "#0ea5e9", overlaySvg: k8sIng     },
  "rbac.authorization.k8s.io":     { accent: "#f59e0b", overlaySvg: k8sRole    },
  "storage.k8s.io":                { accent: "#10b981", overlaySvg: k8sSc      },
  "admissionregistration.k8s.io":  { accent: "#84cc16"                          },
  "apiextensions.k8s.io":          { accent: "#94a3b8", overlaySvg: k8sCrd     },
  "cert-manager.io":               { accent: "#ec4899", overlaySvg: iconCertManager },
  "acme.cert-manager.io":          { accent: "#ec4899", overlaySvg: iconCertManager },
  "monitoring.coreos.com":         { accent: "#ef4444", overlaySvg: iconPrometheus  },
  "argoproj.io":                   { accent: "#8b5cf6", overlaySvg: iconArgo        },
  "fluxcd.io":                     { accent: "#10b981", overlaySvg: iconFlux        },
  "source.toolkit.fluxcd.io":      { accent: "#10b981", overlaySvg: iconFlux        },
  "kustomize.toolkit.fluxcd.io":   { accent: "#10b981", overlaySvg: iconFlux        },
  "helm.toolkit.fluxcd.io":        { accent: "#10b981", overlaySvg: iconFlux        },
};

const defaultGroupStyle: GroupStyle = { accent: "#94a3b8" };

// resourceType format: "resource.group" (e.g. "deployments.apps") or "resource" (core group)
function extractGroup(resourceType: string): string {
  const dot = resourceType.indexOf(".");
  return dot === -1 ? "" : resourceType.slice(dot + 1);
}

function getGroupStyle(resourceType: string): GroupStyle {
  const group = extractGroup(resourceType);
  return groupStyles[group] ?? defaultGroupStyle;
}

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

  const [animKey, setAnimKey] = useState(0);
  const prevExpiresAtRef = useRef(event.expiresAt);
  useEffect(() => {
    if (event.expiresAt !== prevExpiresAtRef.current) {
      prevExpiresAtRef.current = event.expiresAt;
      setAnimKey((k) => k + 1);
    }
  }, [event.expiresAt]);

  const theme = actionThemes[event.action] ?? actionThemes.DELETED;
  const groupStyle = getGroupStyle(event.resourceType);
  const remainingS = Math.max(0, (event.expiresAt - Date.now()) / 1000);
  const hasOverlay = groupStyle.overlaySvg || groupStyle.overlayEmoji;

  return (
    <div
      ref={cardRef}
      onMouseDown={handleMouseDown}
      key={animKey}
      style={{
        position: "absolute",
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        zIndex: isDragging ? 10 : 1,
        animation: `fadeIn 0.3s ease-in, fadeOut ${remainingS}s linear forwards`,
        animationPlayState: isDragging ? "paused" : "running",
      }}
    >
      {/* position:relative wrapper so the overlay badge can escape the card */}
      <div style={{ position: "relative" }}>
        {hasOverlay && (
          <div style={{
            position: "absolute",
            top: "-10px",
            right: "-10px",
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            // SVG icons have their own colours — use white background so they show clearly.
            // Emoji icons are white text on the accent colour.
            background: groupStyle.overlaySvg ? "#ffffff" : groupStyle.accent,
            border: groupStyle.overlaySvg ? `2px solid ${groupStyle.accent}` : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            zIndex: 2,
          }}>
            {groupStyle.overlaySvg
              ? <img src={groupStyle.overlaySvg} width="22" height="22" alt="" />
              : groupStyle.overlayEmoji}
          </div>
        )}
        <div
          style={{
            background: theme.bg,
            border: `1.5px solid ${theme.border}`,
            borderRadius: "6px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
            minWidth: "200px",
            maxWidth: "300px",
            fontSize: "13px",
            fontFamily: "system-ui, sans-serif",
            overflow: "hidden",
          }}
        >
          {/* Zone 1: cluster */}
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
    </div>
  );
}
