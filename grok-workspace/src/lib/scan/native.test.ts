import assert from "node:assert/strict";
import { test } from "node:test";
import { sendNativeFile } from "./native.ts";

test("streams bounded chunks and waits for native completion", async () => {
  const source = new Uint8Array(1_100_000);
  for (let index = 0; index < source.length; index += 1) source[index] = index % 251;

  const received: Uint8Array[] = [];
  let finishSeen!: () => void;
  const reachedFinish = new Promise<void>((resolve) => {
    finishSeen = resolve;
  });
  let finishMessage: { id: string } | undefined;
  let settled = false;

  const bridge = {
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    postMessage(raw: string) {
      const message = JSON.parse(raw) as { id: string; type: string; data?: string };
      if (message.type === "abort") return;
      if (message.type === "finish") {
        finishMessage = message;
        finishSeen();
        return;
      }
      if (message.type === "chunk") received.push(Uint8Array.from(Buffer.from(message.data!, "base64")));
      const phase = message.type === "begin" ? "ready" : "chunk";
      bridge.onmessage?.({ data: JSON.stringify({ id: message.id, phase, ok: true }) } as MessageEvent<string>);
    },
  };

  (globalThis as { window?: unknown }).window = {
    LumenNativeBridge: bridge,
    setTimeout,
    clearTimeout,
  };
  try {
    const transfer = sendNativeFile(new Blob([source], { type: "application/pdf" }), "save", "scan.pdf");
    void transfer.finally(() => {
      settled = true;
    });
    await reachedFinish;
    assert.equal(settled, false, "the promise must remain pending until the native completion reply");
    assert.ok(received.length > 1);
    assert.ok(received.every((chunk) => chunk.byteLength <= 512 * 1024));
    assert.deepEqual(Buffer.concat(received.map((chunk) => Buffer.from(chunk))), Buffer.from(source));

    bridge.onmessage?.({
      data: JSON.stringify({ id: finishMessage!.id, phase: "complete", ok: true }),
    } as MessageEvent<string>);
    await transfer;
    assert.equal(settled, true);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});
