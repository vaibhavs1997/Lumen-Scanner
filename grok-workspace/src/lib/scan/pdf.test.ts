import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { canvasesToPdf, processLoadedPdfPages } from "./pdf.ts";
import { installCanvasEnvironment, TestCanvas } from "./test-canvas.ts";

const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

test("exports every scan page and preserves document metadata", async () => {
  const image = new Blob([ONE_PIXEL_PNG], { type: "image/png" });
  const result = await canvasesToPdf(
    [
      { blob: image, width: 1, height: 1 },
      { blob: image, width: 1, height: 1 },
    ],
    "Quarterly receipts",
  );

  assert.equal(result.type, "application/pdf");
  const loaded = await PDFDocument.load(await result.arrayBuffer());
  assert.equal(loaded.getPageCount(), 2);
  assert.equal(loaded.getTitle(), "Quarterly receipts");
  assert.equal(loaded.getCreator(), "Lumen");
});

test("rejects an empty export instead of allowing the PDF library to invent a page", async () => {
  await assert.rejects(canvasesToPdf([], "Empty scan"), /without pages/);
});

test("rejects oversized PDF input before allocating its complete byte buffer", async () => {
  let read = false;
  const file = {
    size: 75 * 1024 * 1024 + 1,
    arrayBuffer: async () => {
      read = true;
      return new ArrayBuffer(0);
    },
  } as File;
  const { processPdfPages } = await import("./pdf.ts");
  await assert.rejects(processPdfPages(file, async () => {}), /smaller than 75 MB/);
  assert.equal(read, false);
});

test("imports at most 30 PDF pages and releases every rendered page canvas", async () => {
  const restore = installCanvasEnvironment();
  const cleaned: number[] = [];
  const rendered: number[] = [];
  const canvases: TestCanvas[] = [];
  const pdf = {
    numPages: 35,
    async getPage(pageNumber: number) {
      return {
        getViewport({ scale }: { scale: number }) {
          return { width: 200 * scale, height: 300 * scale };
        },
        render() {
          rendered.push(pageNumber);
          return { promise: Promise.resolve() };
        },
        cleanup() {
          cleaned.push(pageNumber);
        },
      };
    },
  };
  try {
    const result = await processLoadedPdfPages(
      pdf as unknown as Parameters<typeof processLoadedPdfPages>[0],
      async (canvas, pageNumber, pageCount) => {
        assert.equal(pageCount, 30);
        assert.equal(pageNumber, canvases.length + 1);
        assert.equal(canvas.width, 440);
        assert.equal(canvas.height, 660);
        canvases.push(canvas as unknown as TestCanvas);
      },
    );
    assert.deepEqual(result, { importedPages: 30, totalPages: 35, truncated: true });
    assert.deepEqual(rendered, Array.from({ length: 30 }, (_, index) => index + 1));
    assert.deepEqual(cleaned, rendered);
    assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
  } finally {
    restore();
  }
});
