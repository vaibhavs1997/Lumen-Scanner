import type { Quad, ScanFilter, ScanPage } from "./types.ts";

const DB_NAME = "lumen-scanner";
const STORE_NAME = "drafts";
const CURRENT_DRAFT = "current";
const DB_VERSION = 1;

type StoredPage = {
  id: string;
  sourceBlob: Blob;
  resultBlob: Blob;
  corners: Quad;
  filter: ScanFilter;
  width: number;
  height: number;
};

type StoredDraft = {
  version: 1;
  title: string;
  pages: StoredPage[];
  updatedAt: number;
};

export type RestoredDraft = {
  title: string;
  pages: ScanPage[];
};

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open draft storage"));
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Draft storage request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Draft storage failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Draft storage was cancelled"));
  });
}

export async function loadDraft(): Promise<RestoredDraft | null> {
  const db = await openDatabase();
  if (!db) return null;
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const completed = transactionDone(transaction);
    const stored = (await runRequest(
      transaction.objectStore(STORE_NAME).get(CURRENT_DRAFT),
    )) as StoredDraft | undefined;
    await completed;
    if (!stored || stored.version !== 1 || !Array.isArray(stored.pages)) return null;
    return {
      title: typeof stored.title === "string" ? stored.title : "Scan",
      pages: stored.pages.map((page) => ({
        ...page,
        sourceUrl: URL.createObjectURL(page.sourceBlob),
        resultUrl: URL.createObjectURL(page.resultBlob),
      })),
    };
  } finally {
    db.close();
  }
}

export async function saveDraft(title: string, pages: ScanPage[]): Promise<void> {
  if (pages.length === 0) {
    await clearDraft();
    return;
  }
  const db = await openDatabase();
  if (!db) return;
  try {
    const stored: StoredDraft = {
      version: 1,
      title,
      pages: pages.map(
        ({ id, sourceBlob, resultBlob, corners, filter, width, height }) => ({
          id,
          sourceBlob,
          resultBlob,
          corners,
          filter,
          width,
          height,
        }),
      ),
      updatedAt: Date.now(),
    };
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(stored, CURRENT_DRAFT);
    await completed;
  } finally {
    db.close();
  }
}

export async function clearDraft(): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(CURRENT_DRAFT);
    await completed;
  } finally {
    db.close();
  }
}
