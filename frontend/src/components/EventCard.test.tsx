import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EventCard } from "./EventCard";
import type { VisualEvent } from "../types";

function makeEvent(overrides: Partial<VisualEvent> = {}): VisualEvent {
  return {
    id: "test-1",
    cluster: "prod",
    action: "CREATED",
    resourceType: "deployments.apps",
    name: "my-deploy",
    namespace: "default",
    timestamp: "2026-03-16T10:00:00Z",
    x: 0.5,
    y: 0.3,
    count: 1,
    expiresAt: Date.now() + 10_000,
    createdAt: Date.now(),
    refreshedAt: Date.now(),
    ...overrides,
  };
}

const defaultProps = { onPositionChange: vi.fn(), onTimerRestart: vi.fn(), clusterColor: "#a78bfa" };

describe("EventCard", () => {
  it("renders event info", () => {
    render(<EventCard event={makeEvent()} {...defaultProps} />);

    expect(screen.getByText("CREATED")).toBeInTheDocument();
    expect(screen.getByText("prod")).toBeInTheDocument();
    expect(screen.getByText("my-deploy")).toBeInTheDocument();
    expect(screen.getByText(/deployments\.apps/)).toBeInTheDocument();
    expect(screen.getByText(/default/)).toBeInTheDocument();
  });

  it("renders DELETED event with correct label", () => {
    render(<EventCard event={makeEvent({ action: "DELETED" })} {...defaultProps} />);

    expect(screen.getByText("DELETED")).toBeInTheDocument();
  });

  it("renders UPDATED event with correct label", () => {
    render(<EventCard event={makeEvent({ action: "UPDATED" })} {...defaultProps} />);

    expect(screen.getByText("UPDATED")).toBeInTheDocument();
  });

  it("shows count badge when count > 1", () => {
    render(<EventCard event={makeEvent({ count: 3 })} {...defaultProps} />);

    expect(screen.getByText("×3")).toBeInTheDocument();
  });

  it("does not show count badge when count is 1", () => {
    render(<EventCard event={makeEvent({ count: 1 })} {...defaultProps} />);

    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });

  it("renders the cluster name in the header", () => {
    render(<EventCard event={makeEvent({ cluster: "staging" })} {...defaultProps} />);

    expect(screen.getByText("staging")).toBeInTheDocument();
  });

  it("renders cluster-scoped resource without namespace", () => {
    render(<EventCard event={makeEvent({ namespace: "", resourceType: "nodes" })} {...defaultProps} />);

    expect(screen.getByText("nodes")).toBeInTheDocument();
  });
});
