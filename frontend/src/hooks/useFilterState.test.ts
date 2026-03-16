import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilterState } from "./useFilterState";

describe("useFilterState", () => {
  it("starts with empty selected sets", () => {
    const { result } = renderHook(() => useFilterState());
    expect(result.current.selectedNamespaces.size).toBe(0);
    expect(result.current.selectedResources.size).toBe(0);
  });

  describe("toggleNamespace", () => {
    it("adds a namespace when not selected", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.toggleNamespace("default"));
      expect(result.current.selectedNamespaces.has("default")).toBe(true);
    });

    it("removes a namespace when already selected", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.toggleNamespace("default"));
      act(() => result.current.toggleNamespace("default"));
      expect(result.current.selectedNamespaces.has("default")).toBe(false);
    });
  });

  describe("toggleAllNamespaces", () => {
    it("selects all given namespaces", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.toggleAllNamespaces(["default", "kube-system"], true));
      expect(result.current.selectedNamespaces.has("default")).toBe(true);
      expect(result.current.selectedNamespaces.has("kube-system")).toBe(true);
    });

    it("deselects all given namespaces", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.toggleAllNamespaces(["default", "kube-system"], true));
      act(() => result.current.toggleAllNamespaces(["default", "kube-system"], false));
      expect(result.current.selectedNamespaces.size).toBe(0);
    });

    it("only deselects the given namespaces, leaving others intact", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.toggleAllNamespaces(["default", "kube-system", "staging"], true));
      act(() => result.current.toggleAllNamespaces(["default"], false));
      expect(result.current.selectedNamespaces.has("default")).toBe(false);
      expect(result.current.selectedNamespaces.has("kube-system")).toBe(true);
      expect(result.current.selectedNamespaces.has("staging")).toBe(true);
    });
  });

  describe("toggleResource / toggleAllResources", () => {
    it("adds and removes a resource type", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.toggleResource("pods"));
      expect(result.current.selectedResources.has("pods")).toBe(true);
      act(() => result.current.toggleResource("pods"));
      expect(result.current.selectedResources.has("pods")).toBe(false);
    });

    it("selects and deselects all resource types", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.toggleAllResources(["pods", "deployments.apps"], true));
      expect(result.current.selectedResources.size).toBe(2);
      act(() => result.current.toggleAllResources(["pods", "deployments.apps"], false));
      expect(result.current.selectedResources.size).toBe(0);
    });
  });

  describe("autoSelect", () => {
    it("selects newly discovered namespaces and resources", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.autoSelect(["default", "kube-system"], ["pods", "deployments.apps"]));
      expect(result.current.selectedNamespaces).toEqual(new Set(["default", "kube-system"]));
      expect(result.current.selectedResources).toEqual(new Set(["pods", "deployments.apps"]));
    });

    it("does not re-add already known items", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.autoSelect(["default"], ["pods"]));
      // Manually deselect them
      act(() => result.current.toggleNamespace("default"));
      act(() => result.current.toggleResource("pods"));
      // autoSelect again with the same items — should not re-add them
      act(() => result.current.autoSelect(["default"], ["pods"]));
      expect(result.current.selectedNamespaces.has("default")).toBe(false);
      expect(result.current.selectedResources.has("pods")).toBe(false);
    });

    it("adds only truly new items on subsequent calls", () => {
      const { result } = renderHook(() => useFilterState());
      act(() => result.current.autoSelect(["default"], ["pods"]));
      act(() => result.current.autoSelect(["default", "staging"], ["pods", "deployments.apps"]));
      expect(result.current.selectedNamespaces).toEqual(new Set(["default", "staging"]));
      expect(result.current.selectedResources).toEqual(new Set(["pods", "deployments.apps"]));
    });
  });
});
