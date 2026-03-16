import { describe, it, expect } from "vitest";
import { mergeEvent } from "./eventMerge";
import type { VisualEvent } from "../types";

function makeEvent(overrides: Partial<VisualEvent> = {}): VisualEvent {
  return {
    id: "cluster-pods-default-nginx-CREATED",
    cluster: "cluster",
    action: "CREATED",
    resourceType: "pods",
    name: "nginx",
    namespace: "default",
    timestamp: "2024-01-01T00:00:00Z",
    x: 0.5,
    y: 0.5,
    count: 1,
    expiresAt: 0,
    createdAt: 0,
    refreshedAt: 0,
    ...overrides,
  };
}

describe("mergeEvent", () => {
  it("adds a new event when list is empty", () => {
    const now = 1000;
    const result = mergeEvent([], makeEvent(), 10, now);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
    expect(result[0].expiresAt).toBe(now + 10_000);
    expect(result[0].createdAt).toBe(now);
    expect(result[0].refreshedAt).toBe(now);
  });

  it("adds a new event when no ID match exists", () => {
    const existing = [makeEvent({ id: "other-id", expiresAt: 2000 })];
    const result = mergeEvent(existing, makeEvent(), 10, 1000);
    expect(result).toHaveLength(2);
  });

  it("increments counter when existing event is still alive", () => {
    const now = 1000;
    const existing = [makeEvent({ expiresAt: now + 5000, count: 1, createdAt: 500 })];
    const result = mergeEvent(existing, makeEvent(), 10, now);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
    expect(result[0].expiresAt).toBe(now + 10_000);
    expect(result[0].refreshedAt).toBe(now);
    // createdAt is preserved from the original event
    expect(result[0].createdAt).toBe(500);
  });

  it("preserves x/y position when incrementing counter", () => {
    const now = 1000;
    const existing = [makeEvent({ expiresAt: now + 5000, x: 0.3, y: 0.7 })];
    const incoming = makeEvent({ x: 0.9, y: 0.1 }); // incoming has different position
    const result = mergeEvent(existing, incoming, 10, now);
    expect(result[0].x).toBe(0.3); // original position preserved
    expect(result[0].y).toBe(0.7);
  });

  it("starts fresh (count=1) when existing event has expired", () => {
    const now = 5000;
    const existing = [makeEvent({ expiresAt: now - 1, count: 3, createdAt: 100 })];
    const result = mergeEvent(existing, makeEvent(), 10, now);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
    expect(result[0].createdAt).toBe(now);
    expect(result[0].expiresAt).toBe(now + 10_000);
  });

  it("does not mutate the original array", () => {
    const now = 1000;
    const existing = [makeEvent({ expiresAt: now + 5000 })];
    const original = [...existing];
    mergeEvent(existing, makeEvent(), 10, now);
    expect(existing).toEqual(original);
  });

  it("unrelated events are not affected when merging", () => {
    const now = 1000;
    const other = makeEvent({ id: "other", expiresAt: now + 5000, count: 1 });
    const target = makeEvent({ id: "target", expiresAt: now + 5000, count: 1 });
    const result = mergeEvent([other, target], makeEvent({ id: "target" }), 10, now);
    expect(result.find((e) => e.id === "other")?.count).toBe(1);
    expect(result.find((e) => e.id === "target")?.count).toBe(2);
  });
});
