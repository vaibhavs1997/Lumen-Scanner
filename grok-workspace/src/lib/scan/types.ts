export type Point = { x: number; y: number };

export type Quad = [Point, Point, Point, Point];

export type ScanFilter = "enhance" | "bw" | "gray" | "photo";

export const MAX_DOCUMENT_PAGES = 30;
export const MAX_IMAGE_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_INPUT_BYTES = 75 * 1024 * 1024;

export type ScanPage = {
  id: string;
  sourceUrl: string;
  sourceBlob: Blob;
  resultUrl: string;
  resultBlob: Blob;
  corners: Quad;
  filter: ScanFilter;
  width: number;
  height: number;
};

export const FILTERS: { id: ScanFilter; label: string; hint: string }[] = [
  { id: "enhance", label: "Enhance", hint: "Clean color scan" },
  { id: "bw", label: "B&W", hint: "High-contrast text" },
  { id: "gray", label: "Gray", hint: "Soft mono" },
];
