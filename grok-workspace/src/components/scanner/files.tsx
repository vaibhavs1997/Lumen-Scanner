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
