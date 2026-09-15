import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clamp01, isValidNormalizedQuad } from "@/lib/scan/geometry";
import type { Quad } from "@/lib/scan/types";

type CropProps = {
  src: string;
  corners: Quad;
  onChange: (corners: Quad) => void;
};

export function CropOverlay({ src, corners, onChange }: CropProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const cornersRef = useRef(corners);
  cornersRef.current = corners;

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    if (drag === null) return;

    const move = (e: PointerEvent) => {
      const img = imgRef.current;
      const index = dragRef.current;
      if (!img || index === null) return;
      e.preventDefault();
      const rect = img.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const x = clamp01((e.clientX - rect.left) / rect.width);
      const y = clamp01((e.clientY - rect.top) / rect.height);
      const next = cornersRef.current.slice() as Quad;
      next[index] = { x, y };
      if (isValidNormalizedQuad(next)) onChange(next);
    };

    const up = () => {
      setDrag(null);
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, onChange]);

  const points = corners.map((c) => `${c.x},${c.y}`).join(" ");
  const hole = `M0,0 H1 V1 H0 Z M${corners[0].x},${corners[0].y} L${corners[1].x},${corners[1].y} L${corners[2].x},${corners[2].y} L${corners[3].x},${corners[3].y} Z`;

  return (
    <div className="relative mx-auto inline-block max-h-full max-w-full">
      <img
        ref={imgRef}
        src={src}
        alt="Original page"
        draggable={false}
        className="block max-h-[min(62dvh,720px)] max-w-full select-none rounded-md"
      />
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full rounded-md"
      >
        <path d={hole} fill="var(--color-background)" fillOpacity="0.55" fillRule="evenodd" />
        <polygon
          points={points}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="0.007"
        />
      </svg>
      {corners.map((corner, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Corner ${index + 1}`}
          className={cn(
            "absolute z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-border",
            "after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2",
            "touch-none cursor-grab active:cursor-grabbing",
          )}
          style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
            setDrag(index);
          }}
        />
      ))}
    </div>
  );
}
