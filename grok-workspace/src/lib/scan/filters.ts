import type { ScanFilter } from "./types.ts";

function filteredCopy(source: HTMLCanvasElement, filter: string): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.filter = filter;
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  return out;
}

function grayscale(data: Uint8ClampedArray): Uint8Array {
  const gray = new Uint8Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = Math.round(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
  }
  return gray;
}

function integralImage(gray: Uint8Array, width: number, height: number): Uint32Array {
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    for (let x = 1; x <= width; x++) {
      rowSum += gray[(y - 1) * width + x - 1]!;
      integral[y * stride + x] = integral[(y - 1) * stride + x]! + rowSum;
    }
  }
  return integral;
}

function localMean(
  integral: Uint32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): number {
  const stride = width + 1;
  const top = Math.max(0, y - radius);
  const bottom = Math.min(height, y + radius + 1);
  const left = Math.max(0, x - radius);
  const right = Math.min(width, x + radius + 1);
  const sum =
    integral[bottom * stride + right]! -
    integral[top * stride + right]! -
    integral[bottom * stride + left]! +
    integral[top * stride + left]!;
  return sum / ((right - left) * (bottom - top));
}

export function enhanceDocumentPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(source);
  const gray = grayscale(source);
  const integral = integralImage(gray, width, height);
  const radius = Math.max(24, Math.min(80, Math.round(Math.min(width, height) / 18)));

  // Normalize lighting over the whole sheet. This removes broad camera shadows
  // while retaining smaller details such as print, handwriting, and stamps.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const mean = localMean(integral, width, height, x, y, radius);
      const lift = Math.max(-16, Math.min(72, (236 - mean) * 0.72));
      const luminance = gray[p]!;
      const adjustedLuminance = (luminance + lift - 128) * 1.1 + 128;

      for (let channel = 0; channel < 3; channel++) {
        const adjustedChannel = (source[i + channel]! + lift - 128) * 1.1 + 128;
        result[i + channel] = Math.round(
          adjustedLuminance + (adjustedChannel - adjustedLuminance) * 0.86,
        );
      }
      result[i + 3] = source[i + 3]!;
    }
  }
  return result;
}

function enhanceDocument(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = filteredCopy(source, "none");
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;
  const image = ctx.getImageData(0, 0, out.width, out.height);
  image.data.set(enhanceDocumentPixels(image.data, out.width, out.height));
  ctx.putImageData(image, 0, 0);
  return out;
}

export function adaptiveBlackAndWhite(
  gray: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const integral = integralImage(gray, width, height);

  // A local threshold follows gradual flash falloff and page-edge shadows.
  // The integral image keeps the work linear even on a full 1600px scan.
  const radius = Math.max(12, Math.min(32, Math.round(Math.min(width, height) / 36)));
  const result = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mean = localMean(integral, width, height, x, y, radius);
      const value = gray[y * width + x]!;
      // A purely local threshold makes the middle of a thick dark glyph match
      // its neighborhood and disappear, leaving only an outline. Keep clearly
      // dark ink solid even when its entire local window is dark.
      result[y * width + x] = value < mean - 14 || value <= 96 ? 32 : 252;
    }
  }
  return result;
}

function blackAndWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = filteredCopy(source, "none");
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const data = image.data;
  const gray = new Uint8Array(out.width * out.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = Math.round(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
  }
  const binary = adaptiveBlackAndWhite(gray, out.width, out.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = binary[p]!;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

export function applyFilter(canvas: HTMLCanvasElement, filter: ScanFilter): HTMLCanvasElement {
  if (filter === "bw") return blackAndWhite(canvas);
  if (filter === "gray") {
    return filteredCopy(canvas, "grayscale(1) contrast(1.14) brightness(1.04)");
  }
  if (filter === "photo") {
    // Camera captures stay visually neutral, with only the requested 0.1%
    // lift so the scan is fractionally less dark than the source frame.
    return filteredCopy(canvas, "brightness(1.001)");
  }
  return enhanceDocument(canvas);
}
