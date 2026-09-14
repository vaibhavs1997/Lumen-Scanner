import assert from "node:assert/strict";
import { test } from "node:test";
import { fitCanvas, MAX_EDGE } from "./image.ts";
import { installCanvasEnvironment, makeCanvas, TestCanvas } from "./test-canvas.ts";

test("downscales oversized camera canvases before scan processing", () => {
  const restore = installCanvasEnvironment();
  try {
    const source = makeCanvas(4000, 2000);
    const resized = fitCanvas(source as unknown as HTMLCanvasElement) as unknown as TestCanvas;
    assert.notEqual(resized, source);
    assert.equal(resized.width, MAX_EDGE);
    assert.equal(resized.height, 800);
    assert.deepEqual(resized.drawCalls[0], [0, 0, 1600, 800]);
  } finally {
    restore();
  }
});

test("does not allocate another canvas when the input is already bounded", () => {
  const source = makeCanvas(1200, 900);
  assert.equal(fitCanvas(source as unknown as HTMLCanvasElement), source);
});
