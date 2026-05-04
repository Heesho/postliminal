import type { Position } from "@/types/project";

export const CANVAS_GRID_GAP = 20;
export const CANVAS_SNAP_GRID: [number, number] = [
  CANVAS_GRID_GAP,
  CANVAS_GRID_GAP,
];

export function snapCanvasPosition(position: Position): Position {
  const x = Number.isFinite(position.x) ? position.x : 0;
  const y = Number.isFinite(position.y) ? position.y : 0;

  return {
    x: Math.round(x / CANVAS_GRID_GAP) * CANVAS_GRID_GAP,
    y: Math.round(y / CANVAS_GRID_GAP) * CANVAS_GRID_GAP,
  };
}
