import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptiveBlackAndWhite, enhanceDocumentPixels } from "./filters.ts";

test("keeps flash falloff and page edges white while preserving dark text", () => {
  const width = 160;
  const height = 120;
  const gray = new Uint8Array(width * height);
  const centerX = width / 2;
  const centerY = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.hypot((x - centerX) / centerX, (y - centerY) / centerY);
      gray[y * width + x] = Math.max(115, Math.round(250 - distance * 82));
    }
  }
  for (let y = 54; y < 61; y++) {
    for (let x = 35; x < 125; x++) gray[y * width + x] = 35;
  }

  const result = adaptiveBlackAndWhite(gray, width, height);
  let darkBorderPixels = 0;
  let borderPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < 10 || x >= width - 10 || y < 10 || y >= height - 10) {
        borderPixels++;
        if (result[y * width + x]! < 128) darkBorderPixels++;
      }
    }
  }

  assert.ok(darkBorderPixels / borderPixels < 0.01, "flash-darkened page edges should remain white");
  for (let y = 55; y < 60; y++) {
    for (let x = 40; x < 120; x++) assert.equal(result[y * width + x], 32);
  }
});

test("keeps the center of thick dark marks instead of reducing them to edges", () => {
  const width = 96;
  const height = 96;
  const gray = new Uint8Array(width * height).fill(238);
  for (let y = 24; y < 72; y++) {
    for (let x = 24; x < 72; x++) gray[y * width + x] = 44;
  }

  const result = adaptiveBlackAndWhite(gray, width, height);
  assert.equal(result[48 * width + 48], 32);
  assert.equal(result[8 * width + 8], 252);
});

test("enhance normalizes broad shadows across the complete page", () => {
  const width = 120;
  const height = 80;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = 150 + Math.round((x / (width - 1)) * 70);
      const i = (y * width + x) * 4;
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
  }
  const beforeDifference = pixels[(60 * 4)]! - pixels[4]!;
  const enhanced = enhanceDocumentPixels(pixels, width, height);
  const left = enhanced[(40 * width + 10) * 4]!;
  const right = enhanced[(40 * width + 110) * 4]!;

  assert.ok(left > pixels[(40 * width + 10) * 4]!, "shadowed page area should be lifted");
  assert.ok(Math.abs(right - left) < Math.abs(beforeDifference), "lighting should be more even");
});
