// Fewer bridge acknowledgements makes multi-page PDF save/share much faster.
// 512 KiB remains comfortably below practical WebMessage string limits after
// base64 expansion.
const CHUNK_BYTES = 512 * 1024;
const REPLY_TIMEOUT_MS = 5 * 60 * 1000;

type NativeAction = "save" | "share";

type NativeMessageBridge = {
  postMessage: (message: string) => void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
};

type NativeReply = {
  id: string;
  phase: "ready" | "chunk" | "complete";
  ok: boolean;
  error?: string;
};

type PendingReply = {
  phase: NativeReply["phase"];
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: number;
};

declare global {
  interface Window {
    LumenNativeBridge?: NativeMessageBridge;
  }
}

const pendingReplies = new Map<string, PendingReply>();
let connectedBridge: NativeMessageBridge | undefined;

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && typeof window.LumenNativeBridge?.postMessage === "function";
}

function getBridge(): NativeMessageBridge {
  const bridge = typeof window !== "undefined" ? window.LumenNativeBridge : undefined;
  if (!bridge || typeof bridge.postMessage !== "function") {
    throw new Error("Native file service is unavailable.");
  }
  if (bridge !== connectedBridge) {
    connectedBridge = bridge;
    bridge.onmessage = handleReply;
  }
  return bridge;
}

function handleReply(event: MessageEvent<string>) {
  try {
    const reply = JSON.parse(String(event.data)) as NativeReply;
    const pending = pendingReplies.get(reply.id);
    if (!pending || reply.phase !== pending.phase) return;
    window.clearTimeout(pending.timeout);
    pendingReplies.delete(reply.id);
    if (reply.ok) pending.resolve();
    else pending.reject(new Error(reply.error || "The native file operation failed."));
  } catch {
    // Ignore malformed replies. The request timeout still provides a useful failure.
  }
}

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function postAndWait(
  bridge: NativeMessageBridge,
  id: string,
  phase: NativeReply["phase"],
  payload: object,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingReplies.delete(id);
      reject(new Error("The native file operation timed out."));
    }, REPLY_TIMEOUT_MS);
    pendingReplies.set(id, { phase, resolve, reject, timeout });
    try {
      bridge.postMessage(JSON.stringify(payload));
    } catch (error) {
      window.clearTimeout(timeout);
      pendingReplies.delete(id);
      reject(error instanceof Error ? error : new Error("Could not contact the native file service."));
    }
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const block = 32 * 1024;
  for (let offset = 0; offset < bytes.length; offset += block) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + block));
  }
  return btoa(binary);
}

export async function sendNativeFile(
  blob: Blob,
  action: NativeAction,
  filename: string,
  title?: string,
): Promise<void> {
  const bridge = getBridge();
  const id = requestId();
  const mime = blob.type || "application/octet-stream";

  try {
    await postAndWait(bridge, id, "ready", {
      id,
      type: "begin",
      action,
      filename,
      mime,
      title: title || filename,
      size: blob.size,
    });

    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
      await postAndWait(bridge, id, "chunk", {
        id,
        type: "chunk",
        data: bytesToBase64(bytes),
      });
    }

    await postAndWait(bridge, id, "complete", { id, type: "finish" });
  } catch (error) {
    try {
      bridge.postMessage(JSON.stringify({ id, type: "abort" }));
    } catch {
      // The original error is more useful than a best-effort cleanup failure.
    }
    throw error;
  }
}
