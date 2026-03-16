import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDrag } from "./useDrag";

function makeDivRef(rect: Partial<DOMRect> = {}) {
  const cardRect = { left: 50, top: 50, width: 100, height: 50, ...rect } as DOMRect;
  const canvasRect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect;

  const card = document.createElement("div");
  card.getBoundingClientRect = () => cardRect;

  const canvas = document.createElement("div");
  canvas.getBoundingClientRect = () => canvasRect;
  canvas.appendChild(card);

  const ref = { current: card };
  return ref;
}

function fireMouseEvent(type: string, x: number, y: number) {
  document.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}

describe("useDrag", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("initialises position from initialPos", () => {
    const ref = makeDivRef();
    const { result } = renderHook(() =>
      useDrag(ref as React.RefObject<HTMLDivElement>, { x: 0.3, y: 0.4 }, { onDragEnd: vi.fn() })
    );
    expect(result.current.pos).toEqual({ x: 0.3, y: 0.4 });
    expect(result.current.isDragging).toBe(false);
  });

  it("sets isDragging true on mousedown", () => {
    const ref = makeDivRef();
    const { result } = renderHook(() =>
      useDrag(ref as React.RefObject<HTMLDivElement>, { x: 0, y: 0 }, { onDragEnd: vi.fn() })
    );
    act(() => {
      result.current.handleMouseDown({ clientX: 60, clientY: 60, preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLDivElement>);
    });
    expect(result.current.isDragging).toBe(true);
  });

  it("calls onDragStart on mousedown", () => {
    const ref = makeDivRef();
    const onDragStart = vi.fn();
    const { result } = renderHook(() =>
      useDrag(ref as React.RefObject<HTMLDivElement>, { x: 0, y: 0 }, { onDragEnd: vi.fn(), onDragStart })
    );
    act(() => {
      result.current.handleMouseDown({ clientX: 60, clientY: 60, preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLDivElement>);
    });
    expect(onDragStart).toHaveBeenCalledOnce();
  });

  it("updates position on mousemove during drag", () => {
    const ref = makeDivRef();
    const { result } = renderHook(() =>
      useDrag(ref as React.RefObject<HTMLDivElement>, { x: 0, y: 0 }, { onDragEnd: vi.fn() })
    );
    // mousedown: card is at (50,50), click at (60,60) → offsetX=10, offsetY=10
    act(() => {
      result.current.handleMouseDown({ clientX: 60, clientY: 60, preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLDivElement>);
    });
    // mousemove: move to (410,310) → newLeft=400, newTop=300 → x=0.5, y=0.5
    act(() => { fireMouseEvent("mousemove", 410, 310); });
    expect(result.current.pos.x).toBeCloseTo(0.5);
    expect(result.current.pos.y).toBeCloseTo(0.5);
  });

  it("clamps position to [0, 1]", () => {
    const ref = makeDivRef();
    const { result } = renderHook(() =>
      useDrag(ref as React.RefObject<HTMLDivElement>, { x: 0, y: 0 }, { onDragEnd: vi.fn() })
    );
    act(() => {
      result.current.handleMouseDown({ clientX: 60, clientY: 60, preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLDivElement>);
    });
    act(() => { fireMouseEvent("mousemove", -500, -500); }); // way out of bounds
    expect(result.current.pos.x).toBe(0);
    expect(result.current.pos.y).toBe(0);

    act(() => { fireMouseEvent("mousemove", 5000, 5000); }); // way out of bounds
    expect(result.current.pos.x).toBe(1);
    expect(result.current.pos.y).toBe(1);
  });

  it("calls onDragEnd with final position when mouse moved significantly", () => {
    const ref = makeDivRef();
    const onDragEnd = vi.fn();
    const { result } = renderHook(() =>
      useDrag(ref as React.RefObject<HTMLDivElement>, { x: 0, y: 0 }, { onDragEnd })
    );
    act(() => {
      result.current.handleMouseDown({ clientX: 60, clientY: 60, preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLDivElement>);
    });
    act(() => { fireMouseEvent("mousemove", 410, 310); });
    act(() => { fireMouseEvent("mouseup", 410, 310); });
    expect(onDragEnd).toHaveBeenCalledOnce();
    expect(onDragEnd.mock.calls[0][0]).toBeCloseTo(0.5);
    expect(onDragEnd.mock.calls[0][1]).toBeCloseTo(0.5);
  });

  it("calls onClick instead of onDragEnd when mouse did not move", () => {
    const ref = makeDivRef();
    const onDragEnd = vi.fn();
    const onClick = vi.fn();
    const { result } = renderHook(() =>
      useDrag(ref as React.RefObject<HTMLDivElement>, { x: 0, y: 0 }, { onDragEnd, onClick })
    );
    act(() => {
      result.current.handleMouseDown({ clientX: 60, clientY: 60, preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLDivElement>);
    });
    // mouseup at same position — no movement
    act(() => { fireMouseEvent("mouseup", 60, 60); });
    expect(onClick).toHaveBeenCalledOnce();
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it("sets isDragging false on mouseup", () => {
    const ref = makeDivRef();
    const { result } = renderHook(() =>
      useDrag(ref as React.RefObject<HTMLDivElement>, { x: 0, y: 0 }, { onDragEnd: vi.fn() })
    );
    act(() => {
      result.current.handleMouseDown({ clientX: 60, clientY: 60, preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLDivElement>);
    });
    act(() => { fireMouseEvent("mousemove", 410, 310); });
    act(() => { fireMouseEvent("mouseup", 410, 310); });
    expect(result.current.isDragging).toBe(false);
  });
});
