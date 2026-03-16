import type { VisualEvent } from "../types";

/**
 * Merges an incoming event into the current events array.
 * - If an event with the same ID is still alive: increment its counter and reset expiry.
 * - If an event with the same ID has expired: replace it fresh (count = 1).
 * - If no matching event: append it.
 */
export function mergeEvent(prev: VisualEvent[], incoming: VisualEvent, duration: number, now: number): VisualEvent[] {
  const idx = prev.findIndex((e) => e.id === incoming.id);
  const expiresAt = now + duration * 1000;

  if (idx >= 0 && prev[idx].expiresAt > now) {
    const updated = [...prev];
    updated[idx] = { ...prev[idx], count: prev[idx].count + 1, timestamp: incoming.timestamp, expiresAt, refreshedAt: now };
    return updated;
  }

  const newEvent = { ...incoming, expiresAt, createdAt: now, refreshedAt: now };
  if (idx >= 0) {
    const updated = [...prev];
    updated[idx] = newEvent;
    return updated;
  }
  return [...prev, newEvent];
}
