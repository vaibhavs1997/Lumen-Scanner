import { toast } from "sonner";
import { useScanner } from "@/lib/scan/store";

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif|tif?f)$/i.test(file.name);
}

export async function ingestFiles(
  fileList: File[] | FileList,
) {
  const files = [...fileList];
  const images = files.filter(isImage);
  const pdfs = files.filter(isPdf);
  if (!images.length && !pdfs.length) {
    toast.error("Use a photo or a PDF.");
    return;
  }
  const { addImageBatch, addPdfFile } = useScanner.getState();
  for (const pdf of pdfs) {
    await addPdfFile(pdf);
  }
  await addImageBatch(images);
}

export function fileSlug(title: string) {
  const s = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return s || "scan";
}
