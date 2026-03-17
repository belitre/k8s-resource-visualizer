import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Sidebar } from "./Sidebar";

function renderSidebar(overrides = {}) {
  const defaults = {
    backends: [],
    duration: 10,
    onDurationChange: vi.fn(),
    onAddBackend: vi.fn(),
    onRemoveBackend: vi.fn(),
    onToggleBackend: vi.fn(),
    namespaces: [],
    selectedNamespaces: new Set<string>(),
    onToggleNamespace: vi.fn(),
    onToggleAllNamespaces: vi.fn(),
    resources: [],
    selectedResources: new Set<string>(),
    onToggleResource: vi.fn(),
    onToggleAllResources: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<Sidebar {...props} />), props };
}

function makeBackend(overrides = {}) {
  return {
    url: "http://localhost:8080",
    clusterName: "prod",
    status: "connected",
    removable: true,
    enabled: true,
    ...overrides,
  };
}

describe("Sidebar", () => {
  it("renders title and duration slider", () => {
    renderSidebar();
    expect(screen.getByText("K8s Resource Visualizer")).toBeInTheDocument();
    expect(screen.getByText("Event Duration: 10s")).toBeInTheDocument();
  });

  it("shows no-backends message when empty", () => {
    renderSidebar();
    expect(screen.getByText(/No backends connected/)).toBeInTheDocument();
  });

  it("calls onAddBackend when adding a URL", () => {
    const { props } = renderSidebar();
    const input = screen.getByPlaceholderText("http://backend-url:8080");
    fireEvent.change(input, { target: { value: "http://localhost:8080" } });
    fireEvent.click(screen.getByText("Add"));
    expect(props.onAddBackend).toHaveBeenCalledWith("http://localhost:8080");
  });

  it("calls onAddBackend on Enter key", () => {
    const { props } = renderSidebar();
    const input = screen.getByPlaceholderText("http://backend-url:8080");
    fireEvent.change(input, { target: { value: "http://localhost:8080" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onAddBackend).toHaveBeenCalledWith("http://localhost:8080");
  });

  it("does not add empty URL", () => {
    const { props } = renderSidebar();
    fireEvent.click(screen.getByText("Add"));
    expect(props.onAddBackend).not.toHaveBeenCalled();
  });

  it("renders backend with cluster name and status dot", () => {
    renderSidebar({ backends: [makeBackend({ clusterName: "prod-cluster" })] });
    expect(screen.getByText("prod-cluster")).toBeInTheDocument();
  });

  it("calls onToggleBackend when clicking backend enable checkbox", () => {
    const backend = makeBackend();
    const { props } = renderSidebar({ backends: [backend] });
    const checkbox = screen.getAllByRole("checkbox").find((cb) =>
      cb.getAttribute("title")?.includes("Disable events")
    )!;
    fireEvent.click(checkbox);
    expect(props.onToggleBackend).toHaveBeenCalledWith("http://localhost:8080");
  });

  it("backend checkbox is unchecked when disabled", () => {
    const backend = makeBackend({ enabled: false });
    renderSidebar({ backends: [backend] });
    const checkbox = screen.getAllByRole("checkbox").find((cb) =>
      cb.getAttribute("title")?.includes("Enable events")
    )!;
    expect(checkbox).not.toBeChecked();
  });

  it("calls onRemoveBackend when clicking remove button", () => {
    const { props } = renderSidebar({ backends: [makeBackend()] });
    fireEvent.click(screen.getByTitle("Remove backend"));
    expect(props.onRemoveBackend).toHaveBeenCalledWith("http://localhost:8080");
  });

  it("does not show remove button for non-removable backends", () => {
    renderSidebar({ backends: [makeBackend({ removable: false })] });
    expect(screen.queryByTitle("Remove backend")).not.toBeInTheDocument();
  });

  it("collapses and expands backends list", () => {
    renderSidebar({ backends: [makeBackend()] });
    expect(screen.getByText("prod")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Backends/));
    expect(screen.queryByText("prod")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Backends/));
    expect(screen.getByText("prod")).toBeInTheDocument();
  });

  it("updates duration when slider changes", () => {
    const { props } = renderSidebar();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "30" } });
    expect(props.onDurationChange).toHaveBeenCalledWith(30);
  });

  it("renders global namespaces section", () => {
    renderSidebar({
      namespaces: ["", "default", "kube-system"],
      selectedNamespaces: new Set(["", "default", "kube-system"]),
    });
    expect(screen.getByText("Namespaces")).toBeInTheDocument();
    expect(screen.getByText("Non-namespaced")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("kube-system")).toBeInTheDocument();
  });

  it("calls onToggleNamespace when clicking a namespace checkbox", () => {
    const { props } = renderSidebar({
      namespaces: ["", "default"],
      selectedNamespaces: new Set<string>(),
    });
    const checkbox = screen.getAllByRole("checkbox").find((cb) =>
      cb.closest("label")?.textContent?.includes("default")
    )!;
    fireEvent.click(checkbox);
    expect(props.onToggleNamespace).toHaveBeenCalledWith("default");
  });

  it("calls onToggleNamespace for non-namespaced checkbox", () => {
    const { props } = renderSidebar({
      namespaces: ["", "default"],
      selectedNamespaces: new Set(["", "default"]),
    });
    const checkbox = screen.getAllByRole("checkbox").find((cb) =>
      cb.closest("label")?.textContent?.includes("Non-namespaced")
    )!;
    fireEvent.click(checkbox);
    expect(props.onToggleNamespace).toHaveBeenCalledWith("");
  });

  it("calls onToggleAllNamespaces for select all in namespaces", () => {
    const { props } = renderSidebar({
      namespaces: ["", "default", "kube-system"],
      selectedNamespaces: new Set<string>(),
    });
    const nsSelectAll = screen.getAllByText("Select all")[0].closest("label")!.querySelector("input")!;
    fireEvent.click(nsSelectAll);
    expect(props.onToggleAllNamespaces).toHaveBeenCalledWith(["", "default", "kube-system"], true);
  });

  it("renders global resource types section", () => {
    renderSidebar({
      resources: ["deployments.apps", "pods"],
      selectedResources: new Set(["deployments.apps", "pods"]),
    });
    expect(screen.getByText("Resource Types")).toBeInTheDocument();
    expect(screen.getByText("deployments.apps")).toBeInTheDocument();
    expect(screen.getByText("pods")).toBeInTheDocument();
  });

  it("calls onToggleResource when clicking a resource checkbox", () => {
    const { props } = renderSidebar({
      resources: ["pods"],
      selectedResources: new Set<string>(),
    });
    const checkbox = screen.getAllByRole("checkbox").find((cb) =>
      cb.closest("label")?.textContent?.includes("pods")
    )!;
    fireEvent.click(checkbox);
    expect(props.onToggleResource).toHaveBeenCalledWith("pods");
  });

  it("calls onToggleAllResources for select all in resource types", () => {
    const { props } = renderSidebar({
      resources: ["deployments.apps", "pods"],
      selectedResources: new Set<string>(),
    });
    const resSelectAll = screen.getAllByText("Select all")[1].closest("label")!.querySelector("input")!;
    fireEvent.click(resSelectAll);
    expect(props.onToggleAllResources).toHaveBeenCalledWith(["deployments.apps", "pods"], true);
  });

  it("filters namespaces by search text", () => {
    renderSidebar({
      namespaces: ["", "default", "kube-system", "monitoring"],
      selectedNamespaces: new Set(["", "default", "kube-system", "monitoring"]),
    });
    fireEvent.change(screen.getByPlaceholderText("Filter namespaces…"), { target: { value: "kube" } });
    expect(screen.getByText("kube-system")).toBeInTheDocument();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
    expect(screen.queryByText("monitoring")).not.toBeInTheDocument();
  });

  it("filters resource types by search text", () => {
    renderSidebar({
      resources: ["deployments.apps", "pods", "services"],
      selectedResources: new Set(["deployments.apps", "pods", "services"]),
    });
    fireEvent.change(screen.getByPlaceholderText("Filter resource types…"), { target: { value: "deploy" } });
    expect(screen.getByText("deployments.apps")).toBeInTheDocument();
    expect(screen.queryByText("pods")).not.toBeInTheDocument();
    expect(screen.queryByText("services")).not.toBeInTheDocument();
  });

  it("select all with namespace filter only toggles filtered items", () => {
    const { props } = renderSidebar({
      namespaces: ["", "default", "kube-system", "monitoring"],
      selectedNamespaces: new Set<string>(),
    });
    fireEvent.change(screen.getByPlaceholderText("Filter namespaces…"), { target: { value: "kube" } });
    const nsSelectAll = screen.getAllByText(/Select all/)[0].closest("label")!.querySelector("input")!;
    fireEvent.click(nsSelectAll);
    expect(props.onToggleAllNamespaces).toHaveBeenCalledWith(["kube-system"], true);
  });

  it("collapses and expands namespaces section", () => {
    renderSidebar({
      namespaces: ["", "default"],
      selectedNamespaces: new Set(["", "default"]),
    });
    expect(screen.getByText("default")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Namespaces"));
    expect(screen.queryByText("default")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Namespaces"));
    expect(screen.getByText("default")).toBeInTheDocument();
  });

  it("collapses and expands resource types section", () => {
    renderSidebar({
      resources: ["pods"],
      selectedResources: new Set(["pods"]),
    });
    expect(screen.getByText("pods")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Resource Types"));
    expect(screen.queryByText("pods")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Resource Types"));
    expect(screen.getByText("pods")).toBeInTheDocument();
  });
});
