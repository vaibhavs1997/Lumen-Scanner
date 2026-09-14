import { useRef } from "react";
import { ingestFiles } from "./ingest";

export function FilePickers({
  imageRef,
  pdfRef,
  captureRef,
}: {
  imageRef: React.RefObject<HTMLInputElement | null>;
  pdfRef: React.RefObject<HTMLInputElement | null>;
  captureRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label="Choose photos"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void ingestFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Take a photo"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void ingestFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Choose a PDF"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void ingestFiles(files);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function useFilePickers() {
  const imageRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  return {
    imageRef,
    pdfRef,
    captureRef,
    pickImages: () => imageRef.current?.click(),
    pickPdf: () => {
      // Load the PDF parser while the system picker is open so choosing a file
      // does not pay the lazy-module startup cost afterwards.
      void import("@/lib/scan/pdf")
        .then(({ preloadPdfProcessing }) => preloadPdfProcessing())
        .catch(() => undefined);
      pdfRef.current?.click();
    },
    pickCapture: () => captureRef.current?.click(),
  };
}
