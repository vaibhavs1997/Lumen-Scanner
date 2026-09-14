import assert from "node:assert/strict";
import { test } from "node:test";
import { useScanner } from "./store.ts";
import { installCanvasEnvironment, solidPixels } from "./test-canvas.ts";
import type { ScanPage } from "./types.ts";

function page(id: string): ScanPage {
  const blob = new Blob([id], { type: "image/jpeg" });
  return {
    id,
    sourceUrl: URL.createObjectURL(blob),
    sourceBlob: blob,
    resultUrl: URL.createObjectURL(blob),
    resultBlob: blob,
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    filter: "enhance",
    width: 20,
    height: 20,
  };
}

function resetState(pages: ScanPage[] = []) {
  useScanner.setState({
    title: "Test scan",
    pages,
    editor: null,
    processing: false,
    processingLabel: "",
    error: null,
    draftReady: false,
    draftHydrating: false,
  });
}

test("moves, removes, and resets pages without corrupting their order", () => {
  const pages = [page("one"), page("two"), page("three")];
  resetState(pages);
  useScanner.getState().movePage("two", -1);
  assert.deepEqual(useScanner.getState().pages.map(({ id }) => id), ["two", "one", "three"]);
  useScanner.getState().movePage("two", -1);
  assert.deepEqual(useScanner.getState().pages.map(({ id }) => id), ["two", "one", "three"]);
  useScanner.getState().removePage("one");
  assert.deepEqual(useScanner.getState().pages.map(({ id }) => id), ["two", "three"]);
  useScanner.getState().resetDocument();
  assert.equal(useScanner.getState().pages.length, 0);
  assert.match(useScanner.getState().title, /^Scan /);
});

test("a failed image batch is atomic and clears the busy state", async () => {
  const restoreCanvas = installCanvasEnvironment();
  const previousCreateImageBitmap = globalThis.createImageBitmap;
  Object.assign(globalThis, {
    createImageBitmap: async (blob: Blob) => {
      if (blob.type === "image/bad") throw new Error("decode failed");
      return {
        width: 40,
        height: 40,
        pixels: solidPixels(40, 40),
        close() {},
      };
    },
  });
  resetState();
  try {
    await useScanner
      .getState()
      .addImageBatch([new Blob(["good"], { type: "image/jpeg" }), new Blob(["bad"], { type: "image/bad" })]);
    const state = useScanner.getState();
    assert.equal(state.pages.length, 0);
    assert.equal(state.processing, false);
    assert.match(state.error ?? "", /decode failed/);
  } finally {
    Object.assign(globalThis, { createImageBitmap: previousCreateImageBitmap });
    restoreCanvas();
  }
});

test("rejects a batch that would exceed the document page limit before decoding", async () => {
  const pages = Array.from({ length: 30 }, (_, index) => page(String(index)));
  resetState(pages);
  await useScanner.getState().addImageBatch([new Blob(["extra"], { type: "image/jpeg" })]);
  const state = useScanner.getState();
  assert.equal(state.pages.length, 30);
  assert.equal(state.processing, false);
  assert.match(state.error ?? "", /up to 30 pages/);
  state.pages.forEach((item) => {
    URL.revokeObjectURL(item.sourceUrl);
    URL.revokeObjectURL(item.resultUrl);
  });
  resetState();
});

test("a failed PDF import rolls back every prepared page", async () => {
  const restoreCanvas = installCanvasEnvironment();
  const existing = page("existing");
  resetState([existing]);
  try {
    const processPages = async (
      _file: File,
      onPage: (canvas: HTMLCanvasElement, pageNumber: number, total: number) => Promise<void>,
    ) => {
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 40;
      await onPage(canvas, 1, 2);
      throw new Error("page 2 failed");
    };

    await useScanner
      .getState()
      .addPdfFile(new File(["pdf"], "broken.pdf", { type: "application/pdf" }), processPages);

    const state = useScanner.getState();
    assert.deepEqual(state.pages.map(({ id }) => id), ["existing"]);
    assert.equal(state.processing, false);
    assert.equal(state.processingLabel, "");
    assert.match(state.error ?? "", /page 2 failed/);
  } finally {
    URL.revokeObjectURL(existing.sourceUrl);
    URL.revokeObjectURL(existing.resultUrl);
    resetState();
    restoreCanvas();
  }
});
