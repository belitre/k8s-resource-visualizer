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
    selectedNamespaces: new Set<string>(),
    onToggleNamespace: vi.fn(),
    onToggleAllNamespaces: vi.fn(),
    selectedResources: new Set<string>(),
    onToggleResource: vi.fn(),
    onToggleAllResources: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<Sidebar {...props} />), props };
}

function makeBackend(overrides = {}) {
  return {
    url: "http://localhost:8080",
    clusterName: "prod",
    namespaces: ["default", "kube-system"],
    resources: ["deployments.apps", "pods"],
    status: "connected",
    removable: true,
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
    expect(
      screen.getByText(/No backends connected/)
    ).toBeInTheDocument();
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

  it("renders backend with cluster name", () => {
    const backend = makeBackend({ clusterName: "prod-cluster" });
    renderSidebar({ backends: [backend] });

    expect(screen.getByText("prod-cluster")).toBeInTheDocument();
  });

  it("shows namespace filter when namespaces exist", () => {
    const backend = makeBackend();
    renderSidebar({
      backends: [backend],
      selectedNamespaces: new Set(["default", "kube-system"]),
    });

    expect(screen.getByText("All Namespaces")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("kube-system")).toBeInTheDocument();
  });

  it("shows resource type filter when resources exist", () => {
    const backend = makeBackend();
    renderSidebar({
      backends: [backend],
      selectedResources: new Set(["deployments.apps", "pods"]),
    });

    expect(screen.getByText("All Resource Types")).toBeInTheDocument();
    expect(screen.getByText("deployments.apps")).toBeInTheDocument();
    expect(screen.getByText("pods")).toBeInTheDocument();
  });

  it("calls onToggleNamespace when clicking a namespace checkbox", () => {
    const backend = makeBackend({ namespaces: ["default"] });
    const { props } = renderSidebar({
      backends: [backend],
      selectedNamespaces: new Set<string>(),
    });

    const checkboxes = screen.getAllByRole("checkbox");
    // Find the "default" namespace checkbox
    const nsCheckbox = checkboxes.find((cb) => {
      const label = cb.closest("label");
      return label?.textContent?.includes("default");
    })!;
    fireEvent.click(nsCheckbox);

    expect(props.onToggleNamespace).toHaveBeenCalledWith("default");
  });

  it("calls onToggleResource when clicking a resource checkbox", () => {
    const backend = makeBackend({ namespaces: [], resources: ["pods"] });
    const { props } = renderSidebar({
      backends: [backend],
      selectedResources: new Set<string>(),
    });

    const checkboxes = screen.getAllByRole("checkbox");
    const resCheckbox = checkboxes.find((cb) => {
      const label = cb.closest("label");
      return label?.textContent?.includes("pods");
    })!;
    fireEvent.click(resCheckbox);

    expect(props.onToggleResource).toHaveBeenCalledWith("pods");
  });

  it("calls onRemoveBackend when clicking remove button", () => {
    const backend = makeBackend({ namespaces: [], resources: [] });
    const { props } = renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByTitle("Remove backend"));

    expect(props.onRemoveBackend).toHaveBeenCalledWith("http://localhost:8080");
  });

  it("does not show remove button for non-removable backends", () => {
    const backend = makeBackend({ namespaces: [], resources: [], removable: false });
    renderSidebar({ backends: [backend] });

    expect(screen.queryByTitle("Remove backend")).not.toBeInTheDocument();
  });

  it("updates duration when slider changes", () => {
    const { props } = renderSidebar();

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "30" } });

    expect(props.onDurationChange).toHaveBeenCalledWith(30);
  });

  it("calls onToggleAllNamespaces for select all", () => {
    const backend = makeBackend();
    const { props } = renderSidebar({
      backends: [backend],
      selectedNamespaces: new Set<string>(),
    });

    const selectAlls = screen.getAllByText("Select all");
    const nsSelectAll = selectAlls[0].closest("label")!.querySelector("input")!;
    fireEvent.click(nsSelectAll);

    expect(props.onToggleAllNamespaces).toHaveBeenCalledWith(
      ["default", "kube-system"],
      true
    );
  });

  it("calls onToggleAllResources for select all", () => {
    const backend = makeBackend();
    const { props } = renderSidebar({
      backends: [backend],
      selectedResources: new Set<string>(),
    });

    const selectAlls = screen.getAllByText("Select all");
    const resSelectAll = selectAlls[1].closest("label")!.querySelector("input")!;
    fireEvent.click(resSelectAll);

    expect(props.onToggleAllResources).toHaveBeenCalledWith(
      ["deployments.apps", "pods"],
      true
    );
  });

  it("filters namespaces by search text", () => {
    const backend = makeBackend({ namespaces: ["default", "kube-system", "monitoring"] });
    renderSidebar({
      backends: [backend],
      selectedNamespaces: new Set(["default", "kube-system", "monitoring"]),
    });

    const nsInput = screen.getByPlaceholderText("Filter namespaces…");
    fireEvent.change(nsInput, { target: { value: "kube" } });

    expect(screen.getByText("kube-system")).toBeInTheDocument();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
    expect(screen.queryByText("monitoring")).not.toBeInTheDocument();
  });

  it("filters resources by search text", () => {
    const backend = makeBackend({ resources: ["deployments.apps", "pods", "services"] });
    renderSidebar({
      backends: [backend],
      selectedResources: new Set(["deployments.apps", "pods", "services"]),
    });

    const resInput = screen.getByPlaceholderText("Filter resources…");
    fireEvent.change(resInput, { target: { value: "deploy" } });

    expect(screen.getByText("deployments.apps")).toBeInTheDocument();
    expect(screen.queryByText("pods")).not.toBeInTheDocument();
    expect(screen.queryByText("services")).not.toBeInTheDocument();
  });

  it("select all with filter only toggles filtered items", () => {
    const backend = makeBackend({ namespaces: ["default", "kube-system", "monitoring"] });
    const { props } = renderSidebar({
      backends: [backend],
      selectedNamespaces: new Set<string>(),
    });

    const nsInput = screen.getByPlaceholderText("Filter namespaces…");
    fireEvent.change(nsInput, { target: { value: "kube" } });

    const selectAlls = screen.getAllByText(/Select all/);
    const nsSelectAll = selectAlls[0].closest("label")!.querySelector("input")!;
    fireEvent.click(nsSelectAll);

    expect(props.onToggleAllNamespaces).toHaveBeenCalledWith(["kube-system"], true);
  });
});
