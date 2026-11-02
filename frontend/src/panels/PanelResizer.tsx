import { useRef } from "react";
export function PanelResizer({ label, onDelta, value, min, max }: { label: string; onDelta: (delta: number) => void; value?: number; min?: number; max?: number }) {
  const start = useRef<number | null>(null);
  return <div className="panel-resizer" role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); onDelta((event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 40 : 16)); } }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); start.current = event.clientX; }} onPointerMove={(event) => { if (start.current !== null) { onDelta(event.clientX - start.current); start.current = event.clientX; } }} onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }} />;
}
