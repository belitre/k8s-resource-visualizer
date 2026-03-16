// Pastel colors that stand out on the dark canvas background
const PALETTE = [
  "#a78bfa", // purple
  "#67e8f9", // cyan
  "#86efac", // green
  "#fcd34d", // yellow
  "#f9a8d4", // pink
  "#93c5fd", // blue
  "#fdba74", // orange
  "#d9f99d", // lime
  "#c4b5fd", // violet
  "#6ee7b7", // teal
];

const assigned = new Map<string, string>();
let nextIdx = 0;

// Returns a stable color for a cluster name for the lifetime of the page.
// If configColor is provided it overrides any previously assigned random color.
export function getClusterColor(clusterName: string, configColor?: string): string {
  if (configColor) {
    assigned.set(clusterName, configColor);
    return configColor;
  }
  if (!assigned.has(clusterName)) {
    assigned.set(clusterName, PALETTE[nextIdx % PALETTE.length]);
    nextIdx++;
  }
  return assigned.get(clusterName)!;
}
