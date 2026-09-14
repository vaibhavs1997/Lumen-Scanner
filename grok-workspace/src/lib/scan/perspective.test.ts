import assert from "node:assert/strict";
import { test } from "node:test";
import { warpPerspective } from "./perspective.ts";
import { installCanvasEnvironment, makeCanvas, solidPixels, TestCanvas } from "./test-canvas.ts";
import type { Quad } from "./types.ts";

test("uses the canvas crop path for axis-aligned corners", () => {
  const restore = installCanvasEnvironment();
  try {
    const source = makeCanvas(40, 40);
    const corners: Quad = [
      { x: 4, y: 5 },
      { x: 35, y: 5 },
      { x: 35, y: 30 },
      { x: 4, y: 30 },
    ];
    const output = warpPerspective(source as unknown as HTMLCanvasElement, corners) as unknown as TestCanvas;
    assert.equal(output.width, 32);
    assert.equal(output.height, 32);
    assert.deepEqual(output.drawCalls[0], [4, 5, 31, 25, 0, 0, 32, 32]);
  } finally {
    restore();
  }
});

test("warps a skewed page into an opaque, bounded output", () => {
  const restore = installCanvasEnvironment();
  try {
    const pixels = solidPixels(40, 40, 0);
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const index = (y * 40 + x) * 4;
        pixels[index] = x * 6;
        pixels[index + 1] = y * 6;
        pixels[index + 2] = 80;
        pixels[index + 3] = 255;
      }
    }
    const source = makeCanvas(40, 40, pixels);
    const corners: Quad = [
      { x: 5, y: 4 },
      { x: 35, y: 8 },
      { x: 32, y: 35 },
      { x: 8, y: 31 },
    ];
    const output = warpPerspective(source as unknown as HTMLCanvasElement, corners) as unknown as TestCanvas;
    assert.equal(output.width, 32);
    assert.equal(output.height, 32);
    assert.ok(output.pixels.some((value, index) => index % 4 !== 3 && value > 0));
    for (let index = 3; index < output.pixels.length; index += 4) {
      assert.equal(output.pixels[index], 255);
    }
  } finally {
    restore();
  }
});
