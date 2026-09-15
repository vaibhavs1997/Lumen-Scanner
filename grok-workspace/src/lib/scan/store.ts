import { create } from "zustand";
import { format } from "date-fns";
import {
  MAX_DOCUMENT_PAGES,
  MAX_IMAGE_INPUT_BYTES,
  type Quad,
  type ScanFilter,
  type ScanPage,
} from "./types.ts";
import { autoScan, canvasFromSource, scanCanvas } from "./process.ts";
import { canvasToBlob, rotateCanvas } from "./image.ts";
import { detectDocumentCorners } from "./detect.ts";
import { defaultCorners } from "./geometry.ts";
import { loadDraft, saveDraft } from "./persistence.ts";

export type Editor = {
  pageId: string | null;
  sourceUrl: string;
  sourceBlob: Blob;
  previewUrl: string;
  previewBlob: Blob;
  previewWidth: number;
  previewHeight: number;
  previewCurrent: boolean;
  corners: Quad;
  filter: ScanFilter;
};

type PdfPageProcessor = typeof import("./pdf.ts").processPdfPages;

type ScannerState = {
  title: string;
  pages: ScanPage[];
  editor: Editor | null;
  cameraOpen: boolean;
  processing: boolean;
  processingLabel: string;
  error: string | null;
  draftReady: boolean;
  draftHydrating: boolean;
  draftDirty: boolean;
  draftSaving: boolean;
  draftError: string | null;
  setTitle: (title: string) => void;
  setCameraOpen: (open: boolean) => void;
  clearError: () => void;
  retryDraft: () => void;
  hydrateDraft: () => Promise<void>;
  addFromCanvas: (
    canvas: HTMLCanvasElement,
    openEditor: boolean,
    progressLabel?: string,
  ) => Promise<void>;
  addFromBlob: (blob: Blob, openEditor: boolean) => Promise<void>;
  addImageBatch: (blobs: Blob[]) => Promise<void>;
  addPdfFile: (file: File, processPages?: PdfPageProcessor) => Promise<void>;
  openEditor: (page: ScanPage) => void;
  openNewEditor: (canvas: HTMLCanvasElement) => Promise<void>;
  updateEditor: (patch: Partial<Pick<Editor, "corners" | "filter">>) => void;
  previewEditor: () => Promise<void>;
  rotateEditor: (dir: 1 | -1) => Promise<void>;
  applyEditor: () => Promise<void>;
  closeEditor: () => void;
  removePage: (id: string) => void;
  movePage: (id: string, dir: -1 | 1) => void;
  resetDocument: () => void;
};

function uid() {
  return crypto.randomUUID();
}

function defaultTitle() {
  return `Scan ${format(new Date(), "d MMM yyyy")}`;
}

function revoke(url: string | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function pageOwnsUrl(pages: ScanPage[], url: string): boolean {
  return pages.some((page) => page.sourceUrl === url || page.resultUrl === url);
}

function revokeEditorUrls(editor: Editor, pages: ScanPage[]) {
  const urls = new Set([editor.sourceUrl, editor.previewUrl]);
  for (const url of urls) {
    if (!pageOwnsUrl(pages, url)) revoke(url);
  }
}

function revokePage(page: ScanPage) {
  revoke(page.sourceUrl);
  revoke(page.resultUrl);
}

async function prepareAutoPage(
  source: Blob | HTMLCanvasElement,
): Promise<{ page: ScanPage; detected: boolean }> {
  const canvas = await canvasFromSource(source);
  const [sourceBlob, scanned] = await Promise.all([
    canvasToBlob(canvas, "image/jpeg", 0.9),
    autoScan(canvas, "enhance"),
  ]);
  let sourceUrl: string | undefined;
  let resultUrl: string | undefined;
  try {
    sourceUrl = URL.createObjectURL(sourceBlob);
    resultUrl = URL.createObjectURL(scanned.blob);
    return {
      detected: scanned.detected,
      page: {
        id: uid(),
        sourceUrl,
        sourceBlob,
        resultUrl,
        resultBlob: scanned.blob,
        corners: scanned.corners,
        filter: scanned.filter,
        width: scanned.width,
        height: scanned.height,
      },
    };
  } catch (err) {
    revoke(sourceUrl);
    revoke(resultUrl);
    throw err;
  }
}

export const useScanner = create<ScannerState>((set, get) => ({
  title: defaultTitle(),
  pages: [],
  editor: null,
  cameraOpen: false,
  processing: false,
  processingLabel: "",
  error: null,
  draftReady: false,
  draftHydrating: false,
  draftDirty: false,
  draftSaving: false,
  draftError: null,
  setTitle: (title) => set({ title }),
  setCameraOpen: (cameraOpen) => set({ cameraOpen }),
  clearError: () => set({ error: null }),
  retryDraft: () => {
    const state = get();
    if (!state.draftReady || state.draftSaving) return;
    set({ draftError: null });
    persistImmediately(state.title, state.pages);
  },

  hydrateDraft: async () => {
    const state = get();
    if (state.draftReady || state.draftHydrating) return;
    set({ draftHydrating: true });
    try {
      const draft = await loadDraft();
      if (draft && get().pages.length === 0) {
        set({ title: draft.title, pages: draft.pages });
      } else if (draft) {
        for (const page of draft.pages) {
          revoke(page.sourceUrl);
          revoke(page.resultUrl);
        }
      }
    } catch (err) {
      console.warn("Could not restore the saved draft", err);
    } finally {
      set({ draftReady: true, draftHydrating: false });
    }
  },

  addFromCanvas: async (canvas, openEditor, progressLabel = "Preparing your page…") => {
    if (get().processing) return;
    if (get().pages.length >= MAX_DOCUMENT_PAGES) {
      set({ error: `A document can contain up to ${MAX_DOCUMENT_PAGES} pages.` });
      return;
    }
    set({ processing: true, processingLabel: progressLabel, error: null });
    try {
      const { page, detected } = await prepareAutoPage(canvas);
      if (get().pages.length >= MAX_DOCUMENT_PAGES) {
        revokePage(page);
        set({
          processing: false,
          processingLabel: "",
          error: `A document can contain up to ${MAX_DOCUMENT_PAGES} pages.`,
        });
        return;
      }
      set((s) => ({
        pages: [...s.pages, page],
        processing: false,
        processingLabel: "",
        error: detected
          ? null
          : "Page edges weren’t clear, so a safe crop was used. Review the crop before exporting.",
      }));
      if (openEditor) get().openEditor(page);
    } catch (err) {
      set({
        processing: false,
        processingLabel: "",
        error:
          err instanceof Error ? err.message : "We couldn't prepare that page. Please try again.",
      });
    }
  },

  addFromBlob: async (blob, openEditor) => {
    if (get().processing) return;
    if (blob.size > MAX_IMAGE_INPUT_BYTES) {
      set({ error: "That image is too large. Choose an image smaller than 25 MB." });
      return;
    }
    set({ processing: true, processingLabel: "Scanning your photo…", error: null });
    try {
      const { page, detected } = await prepareAutoPage(blob);
      if (get().pages.length >= MAX_DOCUMENT_PAGES) {
        revokePage(page);
        set({
          processing: false,
          processingLabel: "",
          error: `A document can contain up to ${MAX_DOCUMENT_PAGES} pages.`,
        });
        return;
      }
      set((state) => ({
        pages: [...state.pages, page],
        processing: false,
        processingLabel: "",
        error: detected
          ? null
          : "Page edges weren't clear, so a safe crop was used. Review the crop before exporting.",
      }));
      if (openEditor) get().openEditor(page);
    } catch (err) {
      set({
        processing: false,
        processingLabel: "",
        error:
          err instanceof Error
            ? err.message
            : "We couldn't open that photo. Try a different image.",
      });
    }
  },

  addImageBatch: async (blobs) => {
    if (get().processing) return;
    if (blobs.length === 0) return;
    if (get().pages.length + blobs.length > MAX_DOCUMENT_PAGES) {
      set({ error: `A document can contain up to ${MAX_DOCUMENT_PAGES} pages.` });
      return;
    }
    if (blobs.some((blob) => blob.size > MAX_IMAGE_INPUT_BYTES)) {
      set({ error: "Each image must be smaller than 25 MB." });
      return;
    }
    set({ processing: true, processingLabel: `Scanning photo 1 of ${blobs.length}…`, error: null });
    const prepared: ScanPage[] = [];
    let needsCropReview = false;
    try {
      for (let index = 0; index < blobs.length; index++) {
        set({ processingLabel: `Scanning photo ${index + 1} of ${blobs.length}…` });
        const result = await prepareAutoPage(blobs[index]!);
        needsCropReview ||= !result.detected;
        prepared.push(result.page);
      }
      if (get().pages.length + prepared.length > MAX_DOCUMENT_PAGES) {
        for (const page of prepared) revokePage(page);
        set({
          processing: false,
          processingLabel: "",
          error: `A document can contain up to ${MAX_DOCUMENT_PAGES} pages.`,
        });
        return;
      }
      set((state) => ({
        pages: [...state.pages, ...prepared],
        processing: false,
        processingLabel: "",
        error: needsCropReview
          ? "Some page edges weren’t clear. Review those crops before exporting."
          : null,
      }));
    } catch (err) {
      for (const page of prepared) revokePage(page);
      set({
        processing: false,
        processingLabel: "",
        error:
          err instanceof Error
            ? err.message
            : "We couldn't scan those photos. Try selecting them again.",
      });
    }
  },

  addPdfFile: async (file, processPages) => {
    if (get().processing) return;
    const availablePages = MAX_DOCUMENT_PAGES - get().pages.length;
    if (availablePages <= 0) {
      set({ error: `A document can contain up to ${MAX_DOCUMENT_PAGES} pages.` });
      return;
    }
    set({ processing: true, processingLabel: "Opening your PDF…", error: null });
    const prepared: ScanPage[] = [];
    try {
      const processPdfPages = processPages ?? (await import("./pdf")).processPdfPages;
      const result = await processPdfPages(file, async (canvas, pageNumber, total) => {
        set({ processingLabel: `Preparing page ${pageNumber} of ${total}…` });
        const full: Quad = defaultCorners();
        const [sourceBlob, scanned] = await Promise.all([
          canvasToBlob(canvas, "image/jpeg", 0.9),
          scanCanvas(canvas, full, "enhance"),
        ]);
        let sourceUrl: string | undefined;
        let resultUrl: string | undefined;
        try {
          sourceUrl = URL.createObjectURL(sourceBlob);
          resultUrl = URL.createObjectURL(scanned.blob);
          prepared.push({
            id: uid(),
            sourceUrl,
            sourceBlob,
            resultUrl,
            resultBlob: scanned.blob,
            corners: full,
            filter: "enhance",
            width: scanned.width,
            height: scanned.height,
          });
        } catch (err) {
          revoke(sourceUrl);
          revoke(resultUrl);
          throw err;
        }
      }, availablePages);
      if (result.importedPages === 0) throw new Error("No pages found in that PDF.");
      if (result.importedPages !== prepared.length) throw new Error("The PDF import was incomplete.");
      if (get().pages.length + prepared.length > MAX_DOCUMENT_PAGES) {
        throw new Error(`A document can contain up to ${MAX_DOCUMENT_PAGES} pages.`);
      }
      set((state) => ({
        pages: [...state.pages, ...prepared],
        processing: false,
        processingLabel: "",
        error: result.truncated
          ? `Imported ${result.importedPages} of ${result.totalPages} PDF pages because a document can contain up to ${MAX_DOCUMENT_PAGES} pages.`
          : null,
      }));
    } catch (err) {
      for (const page of prepared) revokePage(page);
      set({
        processing: false,
        processingLabel: "",
        error:
          err instanceof Error
            ? err.message
            : "We couldn't open that PDF. Check the file and try again.",
      });
    }
  },

  openEditor: (page) => {
    set({
      editor: {
        pageId: page.id,
        sourceUrl: page.sourceUrl,
        sourceBlob: page.sourceBlob,
        previewUrl: page.resultUrl,
        previewBlob: page.resultBlob,
        previewWidth: page.width,
        previewHeight: page.height,
        previewCurrent: true,
        corners: page.corners,
        filter: page.filter,
      },
    });
  },

  openNewEditor: async (canvas) => {
    if (get().processing) return;
    if (get().pages.length >= MAX_DOCUMENT_PAGES) {
      set({ error: `A document can contain up to ${MAX_DOCUMENT_PAGES} pages.` });
      return;
    }
    set({ processing: true, processingLabel: "Scanning your photo…", error: null });
    try {
      const preparedCanvas = await canvasFromSource(canvas);
      const [sourceBlob, scanned] = await Promise.all([
        canvasToBlob(preparedCanvas, "image/jpeg", 0.9),
        autoScan(preparedCanvas, "enhance"),
      ]);
      const sourceUrl = URL.createObjectURL(sourceBlob);
      const previewUrl = URL.createObjectURL(scanned.blob);
      set({
        processing: false,
        processingLabel: "",
        editor: {
          pageId: null,
          sourceUrl,
          sourceBlob,
          previewUrl,
          previewBlob: scanned.blob,
          previewWidth: scanned.width,
          previewHeight: scanned.height,
          previewCurrent: true,
          corners: scanned.corners,
          filter: scanned.filter,
        },
      });
    } catch (err) {
      set({
        processing: false,
        processingLabel: "",
        error:
          err instanceof Error ? err.message : "We couldn't prepare that photo. Please try again.",
      });
    }
  },

  updateEditor: (patch) => {
    const editor = get().editor;
    if (!editor) return;
    const changed =
      (patch.corners !== undefined && patch.corners !== editor.corners) ||
      (patch.filter !== undefined && patch.filter !== editor.filter);
    set({
      editor: { ...editor, ...patch, previewCurrent: changed ? false : editor.previewCurrent },
    });
  },

  previewEditor: async () => {
    const editor = get().editor;
    if (!editor) return;
    set({ processing: true, processingLabel: "Refreshing your preview…" });
    try {
      const canvas = await canvasFromSource(editor.sourceBlob);
      const scanned = await scanCanvas(canvas, editor.corners, editor.filter);
      if (editor.previewUrl !== editor.sourceUrl && !pageOwnsUrl(get().pages, editor.previewUrl)) {
        revoke(editor.previewUrl);
      }
      set({
        processing: false,
        processingLabel: "",
        editor: {
          ...editor,
          previewUrl: URL.createObjectURL(scanned.blob),
          previewBlob: scanned.blob,
          previewWidth: scanned.width,
          previewHeight: scanned.height,
          previewCurrent: true,
        },
      });
    } catch (err) {
      set({
        processing: false,
        processingLabel: "",
        error:
          err instanceof Error ? err.message : "We couldn't refresh the preview. Please try again.",
      });
    }
  },

  rotateEditor: async (dir) => {
    const editor = get().editor;
    if (!editor) return;
    set({ processing: true, processingLabel: "Rotating your page…" });
    try {
      const canvas = await canvasFromSource(editor.sourceBlob);
      const rotated = rotateCanvas(canvas, dir);
      const corners = detectDocumentCorners(rotated).corners;
      const [sourceBlob, scanned] = await Promise.all([
        canvasToBlob(rotated, "image/jpeg", 0.92),
        scanCanvas(rotated, corners, editor.filter),
      ]);
      revokeEditorUrls(editor, get().pages);
      set({
        processing: false,
        processingLabel: "",
        editor: {
          ...editor,
          sourceBlob,
          sourceUrl: URL.createObjectURL(sourceBlob),
          previewUrl: URL.createObjectURL(scanned.blob),
          previewBlob: scanned.blob,
          previewWidth: scanned.width,
          previewHeight: scanned.height,
          previewCurrent: true,
          corners,
        },
      });
    } catch (err) {
      set({
        processing: false,
        processingLabel: "",
        error:
          err instanceof Error ? err.message : "We couldn't rotate the page. Please try again.",
      });
    }
  },

  applyEditor: async () => {
    const editor = get().editor;
    if (!editor) return;
    set({ processing: true, processingLabel: "Saving your page…" });
    try {
      let resultBlob = editor.previewBlob;
      let resultUrl = editor.previewUrl;
      let width = editor.previewWidth;
      let height = editor.previewHeight;
      if (!editor.previewCurrent) {
        const canvas = await canvasFromSource(editor.sourceBlob);
        const scanned = await scanCanvas(canvas, editor.corners, editor.filter);
        resultBlob = scanned.blob;
        resultUrl = URL.createObjectURL(scanned.blob);
        width = scanned.width;
        height = scanned.height;
      }
      const existing = editor.pageId ? get().pages.find((p) => p.id === editor.pageId) : null;
      if (existing) {
        if (existing.resultUrl !== resultUrl) revoke(existing.resultUrl);
        if (existing.sourceUrl !== editor.sourceUrl) revoke(existing.sourceUrl);
        const next: ScanPage = {
          ...existing,
          sourceUrl: editor.sourceUrl,
          sourceBlob: editor.sourceBlob,
          resultUrl,
          resultBlob,
          corners: editor.corners,
          filter: editor.filter,
          width,
          height,
        };
        set((s) => ({
          pages: s.pages.map((p) => (p.id === existing.id ? next : p)),
          editor: null,
          processing: false,
          processingLabel: "",
        }));
      } else {
        const page: ScanPage = {
          id: uid(),
          sourceUrl: editor.sourceUrl,
          sourceBlob: editor.sourceBlob,
          resultUrl,
          resultBlob,
          corners: editor.corners,
          filter: editor.filter,
          width,
          height,
        };
        set((s) => ({
          pages: [...s.pages, page],
          editor: null,
          processing: false,
          processingLabel: "",
        }));
      }
      if (editor.previewUrl !== editor.sourceUrl && editor.previewUrl !== resultUrl) {
        revoke(editor.previewUrl);
      }
    } catch (err) {
      set({
        processing: false,
        processingLabel: "",
        error: err instanceof Error ? err.message : "We couldn't save the page. Please try again.",
      });
    }
  },

  closeEditor: () => {
    const { editor, pages } = get();
    if (editor) revokeEditorUrls(editor, pages);
    set({ editor: null });
  },

  removePage: (id) => {
    const page = get().pages.find((p) => p.id === id);
    if (page) {
      revoke(page.sourceUrl);
      revoke(page.resultUrl);
    }
    set((s) => ({ pages: s.pages.filter((p) => p.id !== id) }));
  },

  movePage: (id, dir) => {
    set((s) => {
      const i = s.pages.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.pages.length) return s;
      const pages = [...s.pages];
      const a = pages[i]!;
      pages[i] = pages[j]!;
      pages[j] = a;
      return { pages };
    });
  },

  resetDocument: () => {
    const { pages, editor } = get();
    const urls = new Set<string>();
    for (const page of pages) {
      urls.add(page.sourceUrl);
      urls.add(page.resultUrl);
    }
    if (editor) {
      urls.add(editor.sourceUrl);
      urls.add(editor.previewUrl);
    }
    for (const url of urls) revoke(url);
    const title = defaultTitle();
    set({
      pages: [],
      editor: null,
      title,
      cameraOpen: false,
      error: null,
    });
  },
}));

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let persistQueue = Promise.resolve();
let draftRevision = 0;

function enqueueDraft(title: string, pages: ScanPage[], revision: number) {
  if (revision === draftRevision) {
    useScanner.setState({ draftSaving: true, draftError: null });
  }
  persistQueue = persistQueue
    .catch(() => undefined)
    .then(() => saveDraft(title, pages))
    .then(() => {
      if (revision === draftRevision) {
        useScanner.setState({ draftDirty: false, draftSaving: false, draftError: null });
      }
    })
    .catch((err) => {
      console.warn("Could not save the draft", err);
      if (revision === draftRevision) {
        useScanner.setState({
          draftDirty: true,
          draftSaving: false,
          draftError: "Changes aren't saved on this device. Free some storage, then retry.",
        });
      }
    });
}

function persistImmediately(title: string, pages: ScanPage[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = undefined;
  enqueueDraft(title, pages, draftRevision);
}

useScanner.subscribe((state, previous) => {
  if (!state.draftReady) return;
  const contentChanged = state.title !== previous.title || state.pages !== previous.pages;
  const processingFinished = previous.processing && !state.processing;
  if (!contentChanged && !processingFinished) return;
  if (contentChanged) {
    draftRevision += 1;
    useScanner.setState({ draftDirty: true, draftError: null });
  }
  if (persistTimer) clearTimeout(persistTimer);
  // During a multi-page import, wait until scanning finishes instead of
  // rewriting the complete (and growing) blob collection after every page.
  if (state.processing) {
    persistTimer = undefined;
    return;
  }
  if (state.pages !== previous.pages || processingFinished) {
    persistImmediately(state.title, state.pages);
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    const current = useScanner.getState();
    enqueueDraft(current.title, current.pages, draftRevision);
  }, 300);
});

if (typeof window !== "undefined") {
  const flushDirtyDraft = () => {
    const current = useScanner.getState();
    if (current.draftReady && current.draftDirty) {
      persistImmediately(current.title, current.pages);
    }
  };
  window.addEventListener("pagehide", flushDirtyDraft);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDirtyDraft();
  });
}
