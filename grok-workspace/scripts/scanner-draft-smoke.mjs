import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:8080/";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

async function readDraft() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("lumen-scanner", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction("drafts", "readonly").objectStore("drafts").get("current");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const draft = request.result;
            resolve(
              draft
                ? {
                    title: draft.title,
                    pages: draft.pages.map((entry) => ({
                      sourceSize: entry.sourceBlob.size,
                      resultSize: entry.resultBlob.size,
                      filter: entry.filter,
                      width: entry.width,
                      height: entry.height,
                      corners: entry.corners,
                    })),
                  }
                : null,
            );
            db.close();
          };
        };
      }),
  );
}

async function clearDraft() {
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("lumen-scanner", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction("drafts", "readwrite");
          transaction.objectStore("drafts").delete("current");
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
}

async function firstPagePixelStats() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("lumen-scanner", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction("drafts", "readonly").objectStore("drafts").get("current");
          request.onerror = () => reject(request.error);
          request.onsuccess = async () => {
            try {
              const canvasStats = (canvas) => {
                const context = canvas.getContext("2d");
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let sum = 0;
                let bright = 0;
                let count = 0;
                for (let i = 0; i < pixels.length; i += 80) {
                  const value = pixels[i];
                  sum += value;
                  if (value > 220) bright++;
                  count++;
                }
                return { mean: Math.round(sum / count), brightRatio: bright / count };
              };
              const stats = async (blob) => {
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                canvas.getContext("2d").drawImage(bitmap, 0, 0);
                bitmap.close();
                return canvasStats(canvas);
              };
              const first = request.result.pages[0];
              const [{ blobToCanvas }, { warpPerspective }, { denormalizeQuad }] = await Promise.all([
                import("/src/lib/scan/image.ts"),
                import("/src/lib/scan/perspective.ts"),
                import("/src/lib/scan/geometry.ts"),
              ]);
              const sourceCanvas = await blobToCanvas(first.sourceBlob);
              const warped = warpPerspective(
                sourceCanvas,
                denormalizeQuad(first.corners, sourceCanvas.width, sourceCanvas.height),
              );
              resolve({
                source: await stats(first.sourceBlob),
                warped: canvasStats(warped),
                result: await stats(first.resultBlob),
              });
            } catch (error) {
              reject(error);
            } finally {
              db.close();
            }
          };
        };
      }),
  );
}

try {
  await page.goto(url, { waitUntil: "networkidle" });
  const filterProbe = await page.evaluate(async () => {
    const { applyFilter } = await import("/src/lib/scan/filters.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    context.fillText("Lumen PDF page", 42, 80);
    const result = applyFilter(canvas, "enhance");
    return result.getContext("2d").getImageData(160, 240, 1, 1).data[0];
  });
  assert.ok(filterProbe > 240, `white-page enhancement returned ${filterProbe}`);
  await page.getByRole("button", { name: "Create multi-page scan" }).waitFor();
  await clearDraft();
  await page.reload({ waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Scan with camera" }).click();
  const captureButton = page.getByRole("button", { name: "Capture page" });
  await captureButton.waitFor();
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Capture page"]');
    const video = document.querySelector("video");
    return button && !button.disabled && video && getComputedStyle(video).opacity === "1";
  });
  assert.equal(await page.evaluate(() => window.LumenHandleBack?.()), true);
  await captureButton.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "Create multi-page scan" }).click();
  await page
    .locator('input[accept="image/*"][multiple]')
    .setInputFiles("artifacts/imagine_images/6b9d6467-ec2b-4c53-b0e9-ce7c8c793bff.jpg");
  await page.getByAltText("Page 1", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("heading", { name: "Add a page" }).waitFor();
  assert.equal(await page.evaluate(() => window.LumenHandleBack?.()), true);
  await page.getByRole("heading", { name: "Add a page" }).waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => window.LumenHandleBack?.()), false);

  await page.getByRole("button", { name: "Adjust" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).waitFor();
  assert.match(
    await page.getByRole("button", { name: "Enhance", exact: true }).getAttribute("class"),
    /bg-primary/,
  );
  assert.equal(await page.getByRole("button", { name: "Edges", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Adjust edges", exact: true }).click();
  await page.getByRole("button", { name: "Auto edges", exact: true }).waitFor();
  await page.evaluate(() => {
    window.__edgeProcessingLabels = [];
    window.__edgeObserver = new MutationObserver(() => {
      const message = document.body.innerText.match(/Refreshing your preview…/i)?.[0];
      if (message) window.__edgeProcessingLabels.push(message);
    });
    window.__edgeObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const firstCorner = page.getByRole("button", { name: "Corner 1" });
  const cornerBox = await firstCorner.boundingBox();
  assert.ok(cornerBox);
  await page.mouse.move(cornerBox.x + cornerBox.width / 2, cornerBox.y + cornerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cornerBox.x + cornerBox.width / 2 + 12, cornerBox.y + cornerBox.height / 2 + 12);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const edgeProcessingLabels = await page.evaluate(() => {
    window.__edgeObserver?.disconnect();
    return window.__edgeProcessingLabels;
  });
  assert.deepEqual(edgeProcessingLabels, []);
  assert.equal(await page.evaluate(() => window.LumenHandleBack?.()), true);
  await page.getByRole("button", { name: "Close", exact: true }).waitFor({ state: "hidden" });
  await page.waitForTimeout(500);
  const savedSample = await readDraft();
  assert.equal(savedSample?.pages.length, 1);
  assert.ok(savedSample.pages[0].sourceSize > 0);
  assert.ok(savedSample.pages[0].resultSize > 0);
  const importedImage = savedSample.pages[0];

  await page.reload({ waitUntil: "networkidle" });
  await page.getByAltText("Page 1", { exact: true }).waitFor();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("button", { name: "New scan" }).click();
  await page.getByRole("button", { name: "Create multi-page scan" }).waitFor();
  await page.waitForTimeout(200);
  assert.equal(await readDraft(), null);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const pdfPage = pdf.addPage([320, 480]);
    pdfPage.drawRectangle({ x: 0, y: 0, width: 320, height: 480, color: rgb(1, 1, 1) });
    pdfPage.drawText(`Lumen PDF page ${i + 1}`, {
      x: 42,
      y: 400,
      size: 22,
      font,
      color: rgb(0.08, 0.08, 0.1),
    });
  }
  const pdfBytes = await pdf.save();
  await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles({
    name: "three-pages.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdfBytes),
  });
  await page.getByText("3 pages", { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  const savedPdf = await readDraft();
  assert.equal(savedPdf?.pages.length, 3);
  assert.ok(savedPdf.pages.every((entry) => entry.sourceSize > 0 && entry.resultSize > 0));
  const pixelStats = await firstPagePixelStats();
  const applicationErrors = errors.filter(
    (error) => error !== "Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED",
  );
  assert.deepEqual(applicationErrors, []);
  await page.screenshot({ path: "screenshots/scanner-persistence-mobile.png", fullPage: true });

  process.stdout.write(
    `${JSON.stringify({ filterProbe, smoothCameraStartup: true, friendlyProgressMessages: true, backNavigation: true, edgeAdjustmentWithoutRescan: true, importedImage, sampleRestored: true, clearPersisted: true, pdfPages: 3, pixelStats, applicationErrors })}\n`,
  );
} finally {
  await browser.close();
}
