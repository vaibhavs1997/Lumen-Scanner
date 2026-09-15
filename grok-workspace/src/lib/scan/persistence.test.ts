import assert from "node:assert/strict";
import { test } from "node:test";
import { clearDraft, loadDraft, saveDraft } from "./persistence.ts";
import type { ScanPage } from "./types.ts";

type RequestState<T> = {
  result: T;
  error: DOMException | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onupgradeneeded?: ((event: Event) => void) | null;
};

type TransactionState = {
  error: DOMException | null;
  oncomplete: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onabort: ((event: Event) => void) | null;
  objectStore: () => IDBObjectStore;
};

function memoryIndexedDb() {
  const records = new Map<IDBValidKey, unknown>();
  let created = false;
  let failWrites = false;

  const database = {
    objectStoreNames: { contains: () => created },
    createObjectStore() {
      created = true;
      return {} as IDBObjectStore;
    },
    transaction() {
      const transaction: TransactionState = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () =>
          ({
            get(key: IDBValidKey) {
              const request: RequestState<unknown> = {
                result: records.get(key),
                error: null,
                onsuccess: null,
                onerror: null,
              };
              queueMicrotask(() => {
                request.onsuccess?.(new Event("success"));
                queueMicrotask(() => transaction.oncomplete?.(new Event("complete")));
              });
              return request as unknown as IDBRequest<unknown>;
            },
            put(value: unknown, key: IDBValidKey) {
              queueMicrotask(() => {
                if (failWrites) {
                  transaction.error = new DOMException("Storage quota exceeded", "QuotaExceededError");
                  transaction.onerror?.(new Event("error"));
                } else {
                  records.set(key, value);
                  transaction.oncomplete?.(new Event("complete"));
                }
              });
              return {} as IDBRequest;
            },
            delete(key: IDBValidKey) {
              queueMicrotask(() => {
                records.delete(key);
                transaction.oncomplete?.(new Event("complete"));
              });
              return {} as IDBRequest;
            },
          }) as IDBObjectStore,
      };
      return transaction as unknown as IDBTransaction;
    },
    close() {},
  };

  const factory = {
    open() {
      const request: RequestState<IDBDatabase> = {
        result: database as unknown as IDBDatabase,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        if (!created) request.onupgradeneeded?.(new Event("upgradeneeded"));
        request.onsuccess?.(new Event("success"));
      });
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;

  return {
    factory,
    records,
    failNextWrites() {
      failWrites = true;
    },
  };
}

function samplePage(): ScanPage {
  const sourceBlob = new Blob(["source"], { type: "image/jpeg" });
  const resultBlob = new Blob(["result"], { type: "image/jpeg" });
  return {
    id: "page-1",
    sourceBlob,
    resultBlob,
    sourceUrl: URL.createObjectURL(sourceBlob),
    resultUrl: URL.createObjectURL(resultBlob),
    corners: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ],
    filter: "gray",
    width: 1200,
    height: 900,
  };
}

async function withDatabase(run: (database: ReturnType<typeof memoryIndexedDb>) => Promise<void>) {
  const previous = globalThis.indexedDB;
  const database = memoryIndexedDb();
  Object.assign(globalThis, { indexedDB: database.factory });
  try {
    await run(database);
  } finally {
    if (previous === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else Object.assign(globalThis, { indexedDB: previous });
  }
}

test("round-trips page blobs and regenerates temporary object URLs", async () => {
  await withDatabase(async ({ records }) => {
    const original = samplePage();
    await saveDraft("Expense report", [original]);
    const stored = records.get("current") as { pages: Array<Record<string, unknown>> };
    assert.equal("sourceUrl" in stored.pages[0]!, false);
    assert.equal("resultUrl" in stored.pages[0]!, false);

    const restored = await loadDraft();
    assert.ok(restored);
    assert.equal(restored.title, "Expense report");
    assert.equal(restored.pages.length, 1);
    assert.equal(await restored.pages[0]!.sourceBlob.text(), "source");
    assert.match(restored.pages[0]!.sourceUrl, /^blob:/);

    URL.revokeObjectURL(original.sourceUrl);
    URL.revokeObjectURL(original.resultUrl);
    URL.revokeObjectURL(restored.pages[0]!.sourceUrl);
    URL.revokeObjectURL(restored.pages[0]!.resultUrl);
  });
});

test("clearing an empty document removes the persisted draft", async () => {
  await withDatabase(async ({ records }) => {
    const original = samplePage();
    await saveDraft("Temporary", [original]);
    assert.equal(records.has("current"), true);
    await clearDraft();
    assert.equal(records.has("current"), false);
    assert.equal(await loadDraft(), null);
    URL.revokeObjectURL(original.sourceUrl);
    URL.revokeObjectURL(original.resultUrl);
  });
});

test("surfaces IndexedDB quota failures instead of reporting a successful save", async () => {
  await withDatabase(async (database) => {
    database.failNextWrites();
    const original = samplePage();
    await assert.rejects(saveDraft("Too large", [original]), {
      name: "QuotaExceededError",
    });
    URL.revokeObjectURL(original.sourceUrl);
    URL.revokeObjectURL(original.resultUrl);
  });
});

test("reports unavailable draft storage instead of silently succeeding", async () => {
  const previous = globalThis.indexedDB;
  delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  const original = samplePage();
  try {
    await assert.rejects(saveDraft("Unavailable", [original]), /storage is unavailable/);
  } finally {
    if (previous !== undefined) Object.assign(globalThis, { indexedDB: previous });
    URL.revokeObjectURL(original.sourceUrl);
    URL.revokeObjectURL(original.resultUrl);
  }
});
