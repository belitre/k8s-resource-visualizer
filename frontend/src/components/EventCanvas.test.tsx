import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EventCanvas } from "./EventCanvas";
import type { VisualEvent } from "../types";

function makeEvent(id: string, cluster = "prod"): VisualEvent {
  return {
    id,
    cluster,
    action: "CREATED",
    resourceType: "deployments.apps",
    name: `deploy-${id}`,
    namespace: "default",
    timestamp: "2026-03-16T10:00:00Z",
    x: 0.5,
    y: 0.3,
    count: 1,
    expiresAt: Date.now() + 10_000,
    createdAt: Date.now(),
    refreshedAt: Date.now(),
  };
}

const defaultProps = {
  onPositionChange: vi.fn(),
  onTimerRestart: vi.fn(),
  clusterColorMap: new Map([["prod", "#a78bfa"]]),
};

describe("EventCanvas", () => {
  it("shows placeholder when no events", () => {
    render(<EventCanvas events={[]} {...defaultProps} />);
    expect(screen.getByText("Waiting for resource events…")).toBeInTheDocument();
  });

  it("renders event cards", () => {
    const events = [makeEvent("1"), makeEvent("2")];
    render(<EventCanvas events={events} {...defaultProps} />);

    expect(screen.getByText("deploy-1")).toBeInTheDocument();
    expect(screen.getByText("deploy-2")).toBeInTheDocument();
  });

  it("hides placeholder when events are present", () => {
    render(<EventCanvas events={[makeEvent("1")]} {...defaultProps} />);

    expect(screen.queryByText("Waiting for resource events…")).not.toBeInTheDocument();
  });
});
