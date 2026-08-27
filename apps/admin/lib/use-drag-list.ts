"use client";

import { useState, type DragEvent } from "react";

/**
 * Native HTML5 drag reordering for the row lists (pages, sections, repeat
 * items). Deliberately dependency-free — the design only needs a grab handle,
 * a drop line, and a from/to callback.
 */
export function useDragList(onMove: (from: number, to: number) => void) {
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const reset = () => {
    setFrom(null);
    setOver(null);
  };

  return {
    /** Index currently being hovered, so the caller can show a drop line. */
    overIndex: from === null ? null : over,
    draggingIndex: from,
    rowProps(index: number) {
      return {
        draggable: true,
        onDragStart: () => setFrom(index),
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          if (over !== index) setOver(index);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          if (from !== null && from !== index) onMove(from, index);
          reset();
        },
        onDragEnd: reset,
      };
    },
  };
}
