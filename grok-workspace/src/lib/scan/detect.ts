import type { Quad } from "./types.ts";
import { defaultCorners, orderCorners } from "./geometry.ts";

function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (hist[i] ?? 0);
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 140;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = t;
    }
  }
  return threshold;
}

function morph(src: Uint8Array, w: number, h: number, dilate: boolean): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const acc = src[y * w + x]!;
      if (dilate) {
        if (
          acc ||
          src[y * w + x - 1] ||
          src[y * w + x + 1] ||
          src[(y - 1) * w + x] ||
          src[(y + 1) * w + x]
        ) {
          out[y * w + x] = 1;
        }
      } else {
        if (
          acc &&
          src[y * w + x - 1] &&
          src[y * w + x + 1] &&
          src[(y - 1) * w + x] &&
          src[(y + 1) * w + x]
        ) {
          out[y * w + x] = 1;
        }
      }
    }
  }
  return out;
}

function largestBlob(mask: Uint8Array, w: number, h: number): Int32Array | null {
  const parent = new Int32Array(w * h).fill(-1);
  const find = (i: number): number => {
    let x = i;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) parent[i] = i;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (x + 1 < w && mask[i + 1]) union(i, i + 1);
      if (y + 1 < h && mask[i + w]) union(i, i + w);
    }
  }
  const counts = new Map<number, number>();
  const borderTouches = new Map<number, number>();
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] < 0) continue;
    const root = find(i);
    counts.set(root, (counts.get(root) ?? 0) + 1);
    const x = i % w;
    const y = (i / w) | 0;
    let sides = borderTouches.get(root) ?? 0;
    if (x <= 2) sides |= 1;
    if (x >= w - 3) sides |= 2;
    if (y <= 2) sides |= 4;
    if (y >= h - 3) sides |= 8;
    borderTouches.set(root, sides);
  }
  let best = -1;
  let bestCount = 0;
  const minArea = w * h * 0.1;
  const maxArea = w * h * 0.94;
  for (const [root, count] of counts) {
    const touchedSides = bitCount(borderTouches.get(root) ?? 0);
    if (count >= minArea && count <= maxArea && touchedSides < 3 && count > bestCount) {
      best = root;
      bestCount = count;
    }
  }
  if (best < 0) return null;
  const pixels = new Int32Array(bestCount);
  let k = 0;
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] >= 0 && find(i) === best) pixels[k++] = i;
  }
  return pixels;
}

function bitCount(value: number): number {
  let count = 0;
  for (let bits = value; bits; bits >>= 1) count += bits & 1;
  return count;
}

function maskForThreshold(
  gray: Uint8Array,
  threshold: number,
  lightDocument: boolean,
  w: number,
  h: number,
): Uint8Array {
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    mask[i] = lightDocument ? (gray[i]! > threshold ? 1 : 0) : gray[i]! <= threshold ? 1 : 0;
  }
  const dilated = morph(mask, w, h, true);
  const closed = morph(dilated, w, h, true);
  const eroded = morph(closed, w, h, false);
  return morph(eroded, w, h, false);
}

function quadFromBlob(blob: Int32Array, w: number, h: number): Quad | null {
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;
  let tl = 0;
  let tr = 0;
  let br = 0;
  let bl = 0;
  for (let i = 0; i < blob.length; i++) {
    const idx = blob[i]!;
    const x = idx % w;
    const y = (idx / w) | 0;
    const sum = x + y;
    const diff = x - y;
    if (sum < minSum) {
      minSum = sum;
      tl = idx;
    }
    if (sum > maxSum) {
      maxSum = sum;
      br = idx;
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      tr = idx;
    }
    if (diff < minDiff) {
      minDiff = diff;
      bl = idx;
    }
  }

  const point = (idx: number) => ({ x: (idx % w) / w, y: ((idx / w) | 0) / h });
  try {
    const quad = orderCorners([point(tl), point(tr), point(br), point(bl)]);
    const center = quad.reduce(
      (sum, corner) => ({ x: sum.x + corner.x / 4, y: sum.y + corner.y / 4 }),
      { x: 0, y: 0 },
    );
    return quad.map((corner) => ({
      x: Math.min(1, Math.max(0, center.x + (corner.x - center.x) * 1.015)),
      y: Math.min(1, Math.max(0, center.y + (corner.y - center.y) * 1.015)),
    })) as Quad;
  } catch {
    return null;
  }
}

function quadArea(quad: Quad): number {
  let area = 0;
  for (let i = 0; i < quad.length; i++) {
    const current = quad[i]!;
    const next = quad[(i + 1) % quad.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function detectionConfidence(quad: Quad, blobPixels: number, width: number, height: number): number {
  const area = quadArea(quad);
  if (area < 0.1 || area > 0.94) return 0;
  const frameSides = [
    quad.some(({ x }) => x <= 0.035),
    quad.some(({ x }) => x >= 0.965),
    quad.some(({ y }) => y <= 0.035),
    quad.some(({ y }) => y >= 0.965),
  ].filter(Boolean).length;
  // Thresholding a foreground object also produces its background inverse.
  // Reject the inverse when morphology has merely inset the frame border.
  if (frameSides >= 3) return 0;

  const edges = quad.map((point, index) => {
    const next = quad[(index + 1) % quad.length]!;
    return { x: next.x - point.x, y: next.y - point.y };
  });
  const lengths = edges.map(({ x, y }) => Math.hypot(x, y));
  if (Math.min(...lengths) < 0.15) return 0;
  const horizontalRatio = Math.max(lengths[0]!, lengths[2]!) / Math.min(lengths[0]!, lengths[2]!);
  const verticalRatio = Math.max(lengths[1]!, lengths[3]!) / Math.min(lengths[1]!, lengths[3]!);
  if (horizontalRatio > 2.5 || verticalRatio > 2.5) return 0;
  const aspect = Math.max(lengths[0]!, lengths[2]!) / Math.max(lengths[1]!, lengths[3]!);
  if (aspect < 0.2 || aspect > 5) return 0;

  let maxAngleCosine = 0;
  let crossSign = 0;
  for (let index = 0; index < 4; index++) {
    const incoming = edges[(index + 3) % 4]!;
    const outgoing = edges[index]!;
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    const sign = Math.sign(cross);
    if (sign === 0 || (crossSign !== 0 && sign !== crossSign)) return 0;
    crossSign = sign;
    const cosine = Math.abs(
      (incoming.x * outgoing.x + incoming.y * outgoing.y) /
        (lengths[(index + 3) % 4]! * lengths[index]!),
    );
    maxAngleCosine = Math.max(maxAngleCosine, cosine);
  }
  if (maxAngleCosine > 0.82) return 0;

  const fillRatio = blobPixels / Math.max(1, area * width * height);
  if (fillRatio < 0.45 || fillRatio > 1.35) return 0;
  const rectangularity = Math.min(1, fillRatio);
  const angleQuality = 1 - maxAngleCosine;
  const areaQuality = Math.min(1, area / 0.35);
  return Math.max(0, Math.min(1, rectangularity * angleQuality * areaQuality));
}

export type CornerDetection = { corners: Quad | null; confidence: number };

export function detectCornersFromGrayWithConfidence(
  gray: Uint8Array,
  w: number,
  h: number,
): CornerDetection {
  if (gray.length !== w * h || w < 4 || h < 4) return { corners: null, confidence: 0 };
  const hist = new Uint32Array(256);
  let darkest = 255;
  let lightest = 0;
  for (let i = 0; i < gray.length; i++) {
    const value = gray[i]!;
    hist[value]!++;
    darkest = Math.min(darkest, value);
    lightest = Math.max(lightest, value);
  }
  if (lightest - darkest < 24) return { corners: null, confidence: 0 };
  const threshold = Math.max(96, Math.min(224, otsu(hist, gray.length)));
  const lightBlob = largestBlob(maskForThreshold(gray, threshold, true, w, h), w, h);
  const darkBlob = largestBlob(maskForThreshold(gray, threshold, false, w, h), w, h);
  const candidates = [lightBlob, darkBlob]
    .filter((blob): blob is Int32Array => blob !== null)
    .map((blob) => {
      const quad = quadFromBlob(blob, w, h);
      return { quad, confidence: quad ? detectionConfidence(quad, blob.length, w, h) : 0 };
    })
    .filter(
      (candidate): candidate is { quad: Quad; confidence: number } =>
        candidate.quad !== null && candidate.confidence >= 0.2,
    )
    .sort((a, b) => b.confidence - a.confidence);
  return candidates[0]
    ? { corners: candidates[0].quad, confidence: candidates[0].confidence }
    : { corners: null, confidence: 0 };
}

export function detectCornersFromGray(gray: Uint8Array, w: number, h: number): Quad | null {
  return detectCornersFromGrayWithConfidence(gray, w, h).corners;
}

export function detectDocumentCorners(
  canvas: HTMLCanvasElement,
): { corners: Quad; detected: boolean; confidence: number } {
  const srcW = canvas.width;
  const srcH = canvas.height;
  const maxDim = 420;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(32, Math.round(srcW * scale));
  const h = Math.max(32, Math.round(srcH * scale));
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { corners: defaultCorners(), detected: false, confidence: 0 };
  ctx.drawImage(canvas, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = Math.round(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
    gray[p] = g;
  }
  const detection = detectCornersFromGrayWithConfidence(gray, w, h);
  return {
    corners: detection.corners ?? defaultCorners(),
    detected: detection.corners !== null,
    confidence: detection.confidence,
  };
}
