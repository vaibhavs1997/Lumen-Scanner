import { useRef } from "react";

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
