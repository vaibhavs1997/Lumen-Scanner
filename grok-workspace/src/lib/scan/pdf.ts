import { PDFDocument } from "pdf-lib";
import { MAX_DOCUMENT_PAGES, MAX_PDF_INPUT_BYTES } from "./types.ts";

type PdfJsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;

export type PdfPageProcessor = (
  canvas: HTMLCanvasElement,
  pageNumber: number,
  pageCount: number,
) => Promise<void>;

export type PdfImportResult = {
  importedPages: number;
  totalPages: number;
  truncated: boolean;
};

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfjs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export function preloadPdfProcessing(): Promise<PdfJsModule> {
  return loadPdfjs();
}

export async function processPdfPages(
  file: File,
  processPage: PdfPageProcessor,
  maxPages = MAX_DOCUMENT_PAGES,
): Promise<PdfImportResult> {
  if (file.size > MAX_PDF_INPUT_BYTES) {
    throw new Error("That PDF is too large. Choose a file smaller than 75 MB.");
  }
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  try {
    return await processLoadedPdfPages(pdf, processPage, maxPages);
  } finally {
    try {
      await pdf.cleanup();
    } finally {
      await loadingTask.destroy();
    }
  }
}

export async function processLoadedPdfPages(
  pdf: PdfDocument,
  processPage: PdfPageProcessor,
  maxPages = MAX_DOCUMENT_PAGES,
): Promise<PdfImportResult> {
  const pageCount = Math.min(pdf.numPages, Math.max(0, maxPages));
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const canvas = document.createElement("canvas");
    try {
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(2.2, 1600 / Math.max(unscaled.width, unscaled.height));
      const viewport = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unsupported");
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      await processPage(canvas, i, pageCount);
    } finally {
      page.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }
  }
  return {
    importedPages: pageCount,
    totalPages: pdf.numPages,
    truncated: pageCount < pdf.numPages,
  };
}

export async function canvasesToPdf(
  pages: { blob: Blob; width: number; height: number }[],
  title: string,
): Promise<Blob> {
  if (pages.length === 0) throw new Error("Cannot create a PDF without pages.");
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("Lumen");
  doc.setProducer("Lumen");
  for (const page of pages) {
    const bytes = new Uint8Array(await page.blob.arrayBuffer());
    const isPng = page.blob.type.includes("png");
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const maxW = 595;
    const maxH = 842;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    const pdfPage = doc.addPage([w, h]);
    pdfPage.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  const out = await doc.save();
  const copy = new Uint8Array(out.byteLength);
  copy.set(out);
  return new Blob([copy], { type: "application/pdf" });
}
