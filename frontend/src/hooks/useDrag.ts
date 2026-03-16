import { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";

interface DragState {
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  canvasRect: DOMRect;
}

interface UseDragCallbacks {
  onDragEnd: (x: number, y: number) => void;
  onDragStart?: () => void;
  onClick?: () => void;
}

const DRAG_THRESHOLD_PX = 5;

export function useDrag(
  cardRef: RefObject<HTMLDivElement | null>,
  initialPos: { x: number; y: number },
  callbacks: UseDragCallbacks
) {
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragState = useRef<DragState | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const card = cardRef.current!;
    const cardRect = card.getBoundingClientRect();
    const canvasRect = card.parentElement!.getBoundingClientRect();

    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - cardRect.left,
      offsetY: e.clientY - cardRect.top,
      canvasRect,
    };
    setIsDragging(true);
    callbacksRef.current.onDragStart?.();

    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const { offsetX, offsetY, canvasRect } = dragState.current;
      setPos({
        x: Math.max(0, Math.min(1, (e.clientX - offsetX - canvasRect.left) / canvasRect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - offsetY - canvasRect.top) / canvasRect.height)),
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!dragState.current) return;
      const { startX, startY } = dragState.current;
      const moved = Math.hypot(e.clientX - startX, e.clientY - startY) > DRAG_THRESHOLD_PX;
      dragState.current = null;
      setIsDragging(false);
      if (moved) {
        callbacksRef.current.onDragEnd(posRef.current.x, posRef.current.y);
      } else {
        callbacksRef.current.onClick?.();
      }
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return { pos, isDragging, handleMouseDown };
}
