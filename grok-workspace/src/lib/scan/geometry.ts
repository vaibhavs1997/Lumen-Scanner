import type { Point, Quad } from "./types.ts";

export function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function orderCorners(points: Point[]): Quad {
  if (points.length !== 4) {
    throw new Error("Expected 4 corners");
  }
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = [sorted[0]!, sorted[1]!].sort((a, b) => a.x - b.x);
  const bottom = [sorted[2]!, sorted[3]!].sort((a, b) => a.x - b.x);
  return [top[0]!, top[1]!, bottom[1]!, bottom[0]!];
}

export function defaultCorners(): Quad {
  return [
    { x: 0.04, y: 0.04 },
    { x: 0.96, y: 0.04 },
    { x: 0.96, y: 0.96 },
    { x: 0.04, y: 0.96 },
  ];
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function isValidNormalizedQuad(
  quad: Quad,
  minArea = 0.005,
  minEdge = 0.02,
): boolean {
  if (
    quad.some(
      ({ x, y }) =>
        !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1,
    )
  ) {
    return false;
  }

  const [tl, tr, br, bl] = quad;
  if (tl.x >= tr.x || bl.x >= br.x || tl.y >= bl.y || tr.y >= br.y) return false;
  for (let index = 0; index < 4; index++) {
    if (dist(quad[index]!, quad[(index + 1) % 4]!) < minEdge) return false;
  }

  let twiceArea = 0;
  let winding = 0;
  for (let index = 0; index < 4; index++) {
    const previous = quad[index]!;
    const current = quad[(index + 1) % 4]!;
    const next = quad[(index + 2) % 4]!;
    twiceArea += previous.x * current.y - current.x * previous.y;
    const cross =
      (current.x - previous.x) * (next.y - current.y) -
      (current.y - previous.y) * (next.x - current.x);
    if (cross <= 1e-6) return false;
    winding += cross;
  }
  return winding > 0 && twiceArea / 2 >= minArea;
}

export function normalizeQuad(quad: Quad, width: number, height: number): Quad {
  return orderCorners(
    quad.map((p) => ({
      x: clamp01(p.x / width),
      y: clamp01(p.y / height),
    })),
  );
}

export function denormalizeQuad(quad: Quad, width: number, height: number): Quad {
  return quad.map((p) => ({
    x: p.x * width,
    y: p.y * height,
  })) as Quad;
}

export function outputSize(quad: Quad, maxEdge: number): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const width = Math.max(dist(tl, tr), dist(bl, br));
  const height = Math.max(dist(tl, bl), dist(tr, br));
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return {
    width: Math.max(32, Math.round(width * scale)),
    height: Math.max(32, Math.round(height * scale)),
  };
}

export function invert3x3(m: Float64Array): Float64Array | null {
  const a = m[0]!,
    b = m[1]!,
    c = m[2]!;
  const d = m[3]!,
    e = m[4]!,
    f = m[5]!;
  const g = m[6]!,
    h = m[7]!,
    i = m[8]!;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return new Float64Array([
    A * inv,
    (c * h - b * i) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    (c * d - a * f) * inv,
    C * inv,
    (b * g - a * h) * inv,
    (a * e - b * d) * inv,
  ]);
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row]![col]!) > Math.abs(M[pivot]![col]!)) pivot = row;
    }
    const pivotRow = M[pivot]!;
    M[pivot] = M[col]!;
    M[col] = pivotRow;
    if (Math.abs(pivotRow[col]!) < 1e-12) return null;
    const div = pivotRow[col]!;
    for (let j = col; j <= n; j++) pivotRow[j]! /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row]![col]!;
      if (f === 0) continue;
      for (let j = col; j <= n; j++) M[row]![j]! -= f * pivotRow[j]!;
    }
  }
  return M.map((row) => row[n]!);
}

export function homography(src: Quad, dst: Quad): Float64Array | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  if (!h) return null;
  return new Float64Array([...h, 1]);
}
