import assert from "node:assert/strict";
import { test } from "node:test";
import { homography, invert3x3, orderCorners, outputSize } from "./geometry.ts";
import type { Point, Quad } from "./types.ts";

function project(matrix: Float64Array, point: Point): Point {
  const denominator = matrix[6]! * point.x + matrix[7]! * point.y + matrix[8]!;
  return {
    x: (matrix[0]! * point.x + matrix[1]! * point.y + matrix[2]!) / denominator,
    y: (matrix[3]! * point.x + matrix[4]! * point.y + matrix[5]!) / denominator,
  };
}

function closeTo(actual: number, expected: number, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`);
}

test("orders an unordered skewed quadrilateral clockwise from top-left", () => {
  const ordered = orderCorners([
    { x: 91, y: 88 },
    { x: 14, y: 18 },
    { x: 8, y: 82 },
    { x: 87, y: 12 },
  ]);
  assert.deepEqual(ordered, [
    { x: 14, y: 18 },
    { x: 87, y: 12 },
    { x: 91, y: 88 },
    { x: 8, y: 82 },
  ]);
});

test("homography maps all four source corners and its inverse maps them back", () => {
  const source: Quad = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ];
  const destination: Quad = [
    { x: 12, y: 8 },
    { x: 92, y: 17 },
    { x: 84, y: 76 },
    { x: 18, y: 70 },
  ];
  const matrix = homography(source, destination);
  assert.ok(matrix);
  const inverse = invert3x3(matrix);
  assert.ok(inverse);
  source.forEach((point, index) => {
    const mapped = project(matrix, point);
    closeTo(mapped.x, destination[index]!.x);
    closeTo(mapped.y, destination[index]!.y);
    const restored = project(inverse, mapped);
    closeTo(restored.x, point.x);
    closeTo(restored.y, point.y);
  });
});

test("homography rejects a degenerate source and output sizing respects its cap", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ] as Quad;
  assert.equal(homography(line, line), null);

  const large: Quad = [
    { x: 0, y: 0 },
    { x: 3200, y: 0 },
    { x: 3200, y: 2400 },
    { x: 0, y: 2400 },
  ];
  assert.deepEqual(outputSize(large, 1600), { width: 1600, height: 1200 });
});
