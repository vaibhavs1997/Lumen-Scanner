import type { Quad } from "./types.ts";
import { homography, invert3x3, outputSize } from "./geometry.ts";

export function warpPerspective(
  source: HTMLCanvasElement,
  corners: Quad,
  maxEdge = 1600,
): HTMLCanvasElement {
  const srcCtx = source.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) throw new Error("Canvas unsupported");
  const sw = source.width;
  const sh = source.height;
  const { width, height } = outputSize(corners, maxEdge);

  // The common path for PDFs and fallback edge detection is an axis-aligned
  // crop. Let the browser's native, hardware-accelerated scaler handle it.
  const [tl, tr, br, bl] = corners;
  const axisAligned =
    Math.abs(tl.y - tr.y) < 0.5 &&
    Math.abs(bl.y - br.y) < 0.5 &&
    Math.abs(tl.x - bl.x) < 0.5 &&
    Math.abs(tr.x - br.x) < 0.5;
  if (axisAligned) {
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    ctx.drawImage(
      source,
      tl.x,
      tl.y,
      Math.max(1, tr.x - tl.x),
      Math.max(1, bl.y - tl.y),
      0,
      0,
      width,
      height,
    );
    return out;
  }

  const srcData = srcCtx.getImageData(0, 0, sw, sh).data;
  const dst: Quad = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  const H = homography(dst, corners) ?? invert3x3(homography(corners, dst) ?? new Float64Array(9));
  if (!H) {
    const copy = document.createElement("canvas");
    copy.width = sw;
    copy.height = sh;
    copy.getContext("2d")?.drawImage(source, 0, 0);
    return copy;
  }

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  const image = ctx.createImageData(width, height);
  const dest = image.data;
  const h0 = H[0]!, h1 = H[1]!, h2 = H[2]!;
  const h3 = H[3]!, h4 = H[4]!, h5 = H[5]!;
  const h6 = H[6]!, h7 = H[7]!, h8 = H[8]!;

  // Keep the inner loop allocation-free. The old sampler created a four-item
  // array for every pixel, causing long garbage-collection pauses on Android.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const den = h6 * x + h7 * y + h8;
      const sx = (h0 * x + h1 * y + h2) / den;
      const sy = (h3 * x + h4 * y + h5) / den;
      const i = (y * width + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        const cx = Math.min(sw - 1, Math.max(0, Math.round(sx)));
        const cy = Math.min(sh - 1, Math.max(0, Math.round(sy)));
        const si = (cy * sw + cx) * 4;
        dest[i] = srcData[si]!;
        dest[i + 1] = srcData[si + 1]!;
        dest[i + 2] = srcData[si + 2]!;
      } else {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const dx = sx - x0;
        const dy = sy - y0;
        const topLeft = (y0 * sw + x0) * 4;
        const topRight = topLeft + 4;
        const bottomLeft = topLeft + sw * 4;
        const bottomRight = bottomLeft + 4;
        const w00 = (1 - dx) * (1 - dy);
        const w10 = dx * (1 - dy);
        const w01 = (1 - dx) * dy;
        const w11 = dx * dy;
        dest[i] =
          srcData[topLeft]! * w00 + srcData[topRight]! * w10 +
          srcData[bottomLeft]! * w01 + srcData[bottomRight]! * w11;
        dest[i + 1] =
          srcData[topLeft + 1]! * w00 + srcData[topRight + 1]! * w10 +
          srcData[bottomLeft + 1]! * w01 + srcData[bottomRight + 1]! * w11;
        dest[i + 2] =
          srcData[topLeft + 2]! * w00 + srcData[topRight + 2]! * w10 +
          srcData[bottomLeft + 2]! * w01 + srcData[bottomRight + 2]! * w11;
      }
      dest[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return out;
}
