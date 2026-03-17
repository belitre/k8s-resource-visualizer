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
    onToggleClusterNamespace: vi.fn(),
    onToggleAllClusterNamespaces: vi.fn(),
    onToggleClusterResource: vi.fn(),
    onToggleAllClusterResources: vi.fn(),
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
    namespaces: ["default", "kube-system"],
    resources: ["deployments.apps", "pods"],
    status: "connected",
    removable: true,
    selectedNamespaces: new Set(["", "default", "kube-system"]),
    selectedResources: new Set(["deployments.apps", "pods"]),
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

  it("shows namespace filter when backend is expanded", () => {
    const backend = makeBackend();
    renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    expect(screen.getByText("Namespaces")).toBeInTheDocument();
    expect(screen.getByText("Non-namespaced")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("kube-system")).toBeInTheDocument();
  });

  it("shows resource type filter when backend is expanded", () => {
    const backend = makeBackend();
    renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    expect(screen.getByText("Resource Types")).toBeInTheDocument();
    expect(screen.getByText("deployments.apps")).toBeInTheDocument();
    expect(screen.getByText("pods")).toBeInTheDocument();
  });

  it("calls onToggleClusterNamespace when clicking a namespace checkbox", () => {
    const backend = makeBackend({ namespaces: ["default"], selectedNamespaces: new Set<string>() });
    const { props } = renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    const checkboxes = screen.getAllByRole("checkbox");
    const nsCheckbox = checkboxes.find((cb) => {
      const label = cb.closest("label");
      return label?.textContent?.includes("default");
    })!;
    fireEvent.click(nsCheckbox);

    expect(props.onToggleClusterNamespace).toHaveBeenCalledWith("prod", "default");
  });

  it("calls onToggleClusterResource when clicking a resource checkbox", () => {
    const backend = makeBackend({ namespaces: [], resources: ["pods"], selectedResources: new Set<string>() });
    const { props } = renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    const checkboxes = screen.getAllByRole("checkbox");
    const resCheckbox = checkboxes.find((cb) => {
      const label = cb.closest("label");
      return label?.textContent?.includes("pods");
    })!;
    fireEvent.click(resCheckbox);

    expect(props.onToggleClusterResource).toHaveBeenCalledWith("prod", "pods");
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

  it("calls onToggleAllClusterNamespaces for select all", () => {
    const backend = makeBackend({ selectedNamespaces: new Set<string>() });
    const { props } = renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    const selectAlls = screen.getAllByText("Select all");
    const nsSelectAll = selectAlls[0].closest("label")!.querySelector("input")!;
    fireEvent.click(nsSelectAll);

    expect(props.onToggleAllClusterNamespaces).toHaveBeenCalledWith(
      "prod",
      ["", "default", "kube-system"],
      true
    );
  });

  it("calls onToggleClusterNamespace for non-namespaced checkbox", () => {
    const backend = makeBackend({ selectedNamespaces: new Set(["", "default", "kube-system"]) });
    const { props } = renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    const nonNsCheckbox = screen.getAllByRole("checkbox").find((cb) => {
      const label = cb.closest("label");
      return label?.textContent?.includes("Non-namespaced");
    })!;
    fireEvent.click(nonNsCheckbox);

    expect(props.onToggleClusterNamespace).toHaveBeenCalledWith("prod", "");
  });

  it("calls onToggleAllClusterResources for select all", () => {
    const backend = makeBackend({ selectedResources: new Set<string>() });
    const { props } = renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    const selectAlls = screen.getAllByText("Select all");
    const resSelectAll = selectAlls[1].closest("label")!.querySelector("input")!;
    fireEvent.click(resSelectAll);

    expect(props.onToggleAllClusterResources).toHaveBeenCalledWith(
      "prod",
      ["deployments.apps", "pods"],
      true
    );
  });

  it("filters namespaces by search text when backend is expanded", () => {
    const backend = makeBackend({
      namespaces: ["default", "kube-system", "monitoring"],
      selectedNamespaces: new Set(["default", "kube-system", "monitoring"]),
    });
    renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    const nsInputs = screen.getAllByPlaceholderText("Filter…");
    fireEvent.change(nsInputs[0], { target: { value: "kube" } });

    expect(screen.getByText("kube-system")).toBeInTheDocument();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
    expect(screen.queryByText("monitoring")).not.toBeInTheDocument();
  });

  it("filters resources by search text when backend is expanded", () => {
    const backend = makeBackend({
      resources: ["deployments.apps", "pods", "services"],
      selectedResources: new Set(["deployments.apps", "pods", "services"]),
    });
    renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    const resInputs = screen.getAllByPlaceholderText("Filter…");
    fireEvent.change(resInputs[1], { target: { value: "deploy" } });

    expect(screen.getByText("deployments.apps")).toBeInTheDocument();
    expect(screen.queryByText("pods")).not.toBeInTheDocument();
    expect(screen.queryByText("services")).not.toBeInTheDocument();
  });

  it("select all with filter only toggles filtered items", () => {
    const backend = makeBackend({
      namespaces: ["default", "kube-system", "monitoring"],
      selectedNamespaces: new Set<string>(),
    });
    const { props } = renderSidebar({ backends: [backend] });

    fireEvent.click(screen.getByText("prod"));

    const nsInputs = screen.getAllByPlaceholderText("Filter…");
    fireEvent.change(nsInputs[0], { target: { value: "kube" } });

    const selectAlls = screen.getAllByText(/Select all/);
    const nsSelectAll = selectAlls[0].closest("label")!.querySelector("input")!;
    fireEvent.click(nsSelectAll);

    expect(props.onToggleAllClusterNamespaces).toHaveBeenCalledWith("prod", ["kube-system"], true);
  });
});
