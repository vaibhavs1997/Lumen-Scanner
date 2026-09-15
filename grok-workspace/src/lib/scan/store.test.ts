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
    draftDirty: false,
    draftSaving: false,
    draftError: null,
  });
}

function controllableIndexedDb() {
  let failWrites = true;
  const database = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const transaction = {
        error: null as DOMException | null,
        oncomplete: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: () => ({
          put() {
            queueMicrotask(() => {
              if (failWrites) {
                transaction.error = new DOMException("Storage quota exceeded", "QuotaExceededError");
                transaction.onerror?.(new Event("error"));
              } else {
                transaction.oncomplete?.(new Event("complete"));
              }
            });
            return {} as IDBRequest;
          },
        }),
      };
      return transaction as unknown as IDBTransaction;
    },
    close() {},
  };
  const factory = {
    open() {
      const request = {
        result: database as unknown as IDBDatabase,
        error: null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => request.onsuccess?.(new Event("success")));
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
  return {
    factory,
    allowWrites() {
      failWrites = false;
    },
  };
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

test("rejects a second import while another import owns the processing lock", async () => {
  resetState();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = useScanner.getState().addPdfFile(
    new File(["pdf"], "slow.pdf", { type: "application/pdf" }),
    async () => {
      await gate;
      return { importedPages: 0, totalPages: 0, truncated: false };
    },
  );
  await Promise.resolve();
  assert.equal(useScanner.getState().processing, true);

  await useScanner.getState().addImageBatch([new Blob(["image"], { type: "image/jpeg" })]);
  assert.equal(useScanner.getState().processing, true);
  assert.equal(useScanner.getState().pages.length, 0);

  release();
  await first;
  assert.equal(useScanner.getState().processing, false);
});

test("reports when the document limit truncates a PDF import", async () => {
  const restoreCanvas = installCanvasEnvironment();
  resetState();
  try {
    await useScanner.getState().addPdfFile(
      new File(["pdf"], "long.pdf", { type: "application/pdf" }),
      async (_file, onPage) => {
        const canvas = document.createElement("canvas");
        canvas.width = 40;
        canvas.height = 40;
        await onPage(canvas, 1, 1);
        return { importedPages: 1, totalPages: 5, truncated: true };
      },
    );

    const state = useScanner.getState();
    assert.equal(state.pages.length, 1);
    assert.match(state.error ?? "", /Imported 1 of 5 PDF pages/);
    state.pages.forEach((item) => {
      URL.revokeObjectURL(item.sourceUrl);
      URL.revokeObjectURL(item.resultUrl);
    });
  } finally {
    resetState();
    restoreCanvas();
  }
});

test("exposes a failed automatic draft save and keeps the document dirty", async () => {
  const previous = globalThis.indexedDB;
  const previousWarn = console.warn;
  const original = page("unsaved");
  const database = controllableIndexedDb();
  Object.assign(globalThis, { indexedDB: database.factory });
  console.warn = () => undefined;
  resetState();
  try {
    useScanner.setState({ draftReady: true });
    useScanner.setState({ pages: [original] });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const state = useScanner.getState();
    assert.equal(state.draftDirty, true);
    assert.equal(state.draftSaving, false);
    assert.match(state.draftError ?? "", /aren't saved/);

    database.allowWrites();
    state.retryDraft();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(useScanner.getState().draftDirty, false);
    assert.equal(useScanner.getState().draftSaving, false);
    assert.equal(useScanner.getState().draftError, null);
  } finally {
    if (previous === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else Object.assign(globalThis, { indexedDB: previous });
    console.warn = previousWarn;
    URL.revokeObjectURL(original.sourceUrl);
    URL.revokeObjectURL(original.resultUrl);
    resetState();
  }
});
