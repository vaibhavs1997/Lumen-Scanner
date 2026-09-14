import { detectDocumentCorners } from "./detect.ts";
import { applyFilter } from "./filters.ts";
import { denormalizeQuad } from "./geometry.ts";
import { blobToCanvas, canvasToBlob, fitCanvas } from "./image.ts";
import { warpPerspective } from "./perspective.ts";
import type { Quad, ScanFilter } from "./types.ts";

export async function canvasFromSource(source: Blob | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  if (source instanceof HTMLCanvasElement) return fitCanvas(source);
  return blobToCanvas(source);
}

export async function scanCanvas(
  source: HTMLCanvasElement,
  corners: Quad,
  filter: ScanFilter,
): Promise<{ blob: Blob; width: number; height: number; canvas: HTMLCanvasElement }> {
  const px = denormalizeQuad(corners, source.width, source.height);
  const warped = warpPerspective(source, px);
  const filtered = applyFilter(warped, filter);
  const blob = await canvasToBlob(filtered, "image/jpeg", filter === "bw" ? 0.88 : 0.92);
  return { blob, width: filtered.width, height: filtered.height, canvas: filtered };
}

export async function autoScan(source: Blob | HTMLCanvasElement, filter: ScanFilter = "enhance") {
  const canvas = await canvasFromSource(source);
  const detection = detectDocumentCorners(canvas);
  const corners = detection.corners;
  const result = await scanCanvas(canvas, corners, filter);
  return { corners, filter, detected: detection.detected, confidence: detection.confidence, ...result };
}
