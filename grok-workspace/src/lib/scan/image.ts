// 1600px keeps small document text crisp while substantially reducing the
// pixel work performed by perspective correction and enhancement on phones.
export const MAX_EDGE = 1600;

export function fitCanvas(canvas: HTMLCanvasElement, maxEdge = MAX_EDGE): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
  if (scale === 1) return canvas;
  const resized = document.createElement("canvas");
  resized.width = Math.max(1, Math.round(canvas.width * scale));
  resized.height = Math.max(1, Math.round(canvas.height * scale));
  const context = resized.getContext("2d");
  if (!context) throw new Error("Canvas unsupported");
  context.drawImage(canvas, 0, 0, resized.width, resized.height);
  return resized;
}

export async function blobToCanvas(blob: Blob, maxEdge = MAX_EDGE): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    bitmap = await createImageBitmap(blob);
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas unsupported");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode image"));
      },
      type,
      quality,
    );
  });
}

export function rotateCanvas(source: HTMLCanvasElement, dir: 1 | -1): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.height;
  out.height = source.width;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const { isNativeApp, sendNativeFile } = await import("./native.ts");
  if (isNativeApp()) {
    await sendNativeFile(blob, "save", filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareOrDownload(blob: Blob, filename: string, title: string) {
  const { isNativeApp, sendNativeFile } = await import("./native.ts");
  if (isNativeApp()) {
    await sendNativeFile(blob, "share", filename, title);
    return;
  }
  const file = new File([blob], filename, { type: blob.type });
  const payload = { files: [file], title, text: title };
  if (typeof navigator.share === "function" && navigator.canShare?.(payload)) {
    try {
      await navigator.share(payload);
      return;
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return;
    }
  }
  await downloadBlob(blob, filename);
}
