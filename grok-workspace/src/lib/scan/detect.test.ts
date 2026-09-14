import assert from "node:assert/strict";
import { test } from "node:test";
import { detectCornersFromGray, detectCornersFromGrayWithConfidence } from "./detect.ts";

function rectangleImage(
  width: number,
  height: number,
  background: number,
  document: number,
) {
  const gray = new Uint8Array(width * height).fill(background);
  for (let y = 12; y <= 67; y++) {
    for (let x = 16; x <= 83; x++) gray[y * width + x] = document;
  }
  return gray;
}

function assertDetectedRectangle(gray: Uint8Array) {
  const corners = detectCornersFromGray(gray, 100, 80);
  assert.ok(corners);
  const expected = [
    { x: 0.16, y: 0.15 },
    { x: 0.83, y: 0.15 },
    { x: 0.83, y: 0.84 },
    { x: 0.16, y: 0.84 },
  ];
  corners.forEach((corner, index) => {
    assert.ok(Math.abs(corner.x - expected[index]!.x) < 0.04);
    assert.ok(Math.abs(corner.y - expected[index]!.y) < 0.04);
  });
}

test("detects a light page on a dark background", () => {
  assertDetectedRectangle(rectangleImage(100, 80, 20, 240));
});

test("detects a dark page on a light background", () => {
  assertDetectedRectangle(rectangleImage(100, 80, 240, 20));
});

test("rejects a component that fills and touches the complete frame", () => {
  assert.equal(detectCornersFromGray(new Uint8Array(100 * 80).fill(240), 100, 80), null);
});

test("rejects a large L-shaped distractor that does not resemble a document", () => {
  const gray = new Uint8Array(100 * 80).fill(20);
  for (let y = 10; y < 70; y++) {
    for (let x = 15; x < 32; x++) gray[y * 100 + x] = 240;
  }
  for (let y = 53; y < 70; y++) {
    for (let x = 15; x < 85; x++) gray[y * 100 + x] = 240;
  }
  assert.equal(detectCornersFromGray(gray, 100, 80), null);
});

test("reports confidence for a valid rectangular page", () => {
  const detection = detectCornersFromGrayWithConfidence(
    rectangleImage(100, 80, 20, 240),
    100,
    80,
  );
  assert.ok(detection.corners);
  assert.ok(detection.confidence >= 0.5);
});
