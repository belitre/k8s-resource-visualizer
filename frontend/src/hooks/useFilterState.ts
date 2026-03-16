import { useCallback, useRef, useState } from "react";

export function useFilterState() {
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set());
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set());
  const knownNamespacesRef = useRef<Set<string>>(new Set());
  const knownResourcesRef = useRef<Set<string>>(new Set());

  // Auto-selects newly discovered items so they're visible by default
  const autoSelect = useCallback((namespaces: string[], resources: string[]) => {
    setSelectedNamespaces((prev) => {
      const next = new Set(prev);
      for (const ns of namespaces) {
        if (!knownNamespacesRef.current.has(ns)) {
          knownNamespacesRef.current.add(ns);
          next.add(ns);
        }
      }
      return next;
    });
    setSelectedResources((prev) => {
      const next = new Set(prev);
      for (const rt of resources) {
        if (!knownResourcesRef.current.has(rt)) {
          knownResourcesRef.current.add(rt);
          next.add(rt);
        }
      }
      return next;
    });
  }, []);

  const toggleNamespace = useCallback((ns: string) => {
    setSelectedNamespaces((prev) => {
      const next = new Set(prev);
      if (next.has(ns)) next.delete(ns);
      else next.add(ns);
      return next;
    });
  }, []);

  const toggleAllNamespaces = useCallback((namespaces: string[], selected: boolean) => {
    setSelectedNamespaces((prev) => {
      const next = new Set(prev);
      for (const ns of namespaces) {
        if (selected) next.add(ns);
        else next.delete(ns);
      }
      return next;
    });
  }, []);

  const toggleResource = useCallback((rt: string) => {
    setSelectedResources((prev) => {
      const next = new Set(prev);
      if (next.has(rt)) next.delete(rt);
      else next.add(rt);
      return next;
    });
  }, []);

  const toggleAllResources = useCallback((resources: string[], selected: boolean) => {
    setSelectedResources((prev) => {
      const next = new Set(prev);
      for (const rt of resources) {
        if (selected) next.add(rt);
        else next.delete(rt);
      }
      return next;
    });
  }, []);

  return {
    selectedNamespaces,
    selectedResources,
    autoSelect,
    toggleNamespace,
    toggleAllNamespaces,
    toggleResource,
    toggleAllResources,
  };
}
