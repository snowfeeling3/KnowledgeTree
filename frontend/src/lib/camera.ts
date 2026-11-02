import type { Point } from "./organic-geometry";

export type CameraState = Readonly<{ x: number; y: number; scale: number }>;
export type Viewport = Readonly<{ width: number; height: number }>;

export const DEFAULT_CAMERA: CameraState = Object.freeze({ x: 36, y: 36, scale: 1 });

/** Camera changes never receive layout or geometry. They only move the view transform. */
export function panCamera(camera: CameraState, dx: number, dy: number): CameraState {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

export function zoomCameraBy(camera: CameraState, factor: number, min: number, max: number): CameraState {
  return { ...camera, scale: clampScale(camera.scale * factor, min, max) };
}

export function zoomCameraAt(camera: CameraState, pointerX: number, pointerY: number, factor: number, min = 0.35, max = 2.8): CameraState {
  const scale = clampScale(camera.scale * factor, min, max);
  const worldX = (pointerX - camera.x) / camera.scale;
  const worldY = (pointerY - camera.y) / camera.scale;
  return { scale, x: pointerX - worldX * scale, y: pointerY - worldY * scale };
}

export function centerCameraOn(camera: CameraState, viewport: Viewport, worldX: number, worldY: number): CameraState {
  return { ...camera, x: viewport.width / 2 - worldX * camera.scale, y: viewport.height / 2 - worldY * camera.scale };
}

export function fitCameraToPoints(points: readonly Point[], viewport: Viewport, limits?: { minScale?: number; maxScale?: number }): CameraState {
  if (points.length === 0) return { ...DEFAULT_CAMERA };
  const padding = 74;
  const left = Math.min(...points.map((item) => item.x - 18));
  const right = Math.max(...points.map((item) => item.x + 18));
  const top = Math.min(...points.map((item) => item.y - 18));
  const bottom = Math.max(...points.map((item) => item.y + 44));
  const width = Math.max(right - left, 1);
  const height = Math.max(bottom - top, 1);
  const minScale = limits?.minScale ?? 0.42;
  const maxScale = limits?.maxScale ?? 1.2;
  const scale = Math.min(maxScale, Math.max(minScale, Math.min((viewport.width - padding * 2) / width, (viewport.height - padding * 2) / height)));
  return {
    scale,
    x: (viewport.width - width * scale) / 2 - left * scale,
    y: (viewport.height - height * scale) / 2 - top * scale,
  };
}

export function minimapFrame(points: readonly Point[]): { minX: number; minY: number; scale: number } {
  const minX = Math.min(...points.map((item) => item.x));
  const maxX = Math.max(...points.map((item) => item.x));
  const minY = Math.min(...points.map((item) => item.y));
  const maxY = Math.max(...points.map((item) => item.y));
  return {
    minX,
    minY,
    scale: Math.min(104 / Math.max(1, maxX - minX), 82 / Math.max(1, maxY - minY)),
  };
}

function clampScale(scale: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, scale));
}
