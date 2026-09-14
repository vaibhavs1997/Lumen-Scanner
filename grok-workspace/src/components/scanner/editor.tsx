import { useCallback, useEffect, useState } from "react";
import { Crop, RotateCcw, RotateCw, ScanSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectDocumentCorners } from "@/lib/scan/detect";
import { canvasFromSource } from "@/lib/scan/process";
import { useScanner } from "@/lib/scan/store";
import { FILTERS, type Quad, type ScanFilter } from "@/lib/scan/types";
import { cn } from "@/lib/utils";
import { CropOverlay } from "./crop";

export function EditorOverlay() {
  const editor = useScanner((s) => s.editor);
  const processing = useScanner((s) => s.processing);
  const updateEditor = useScanner((s) => s.updateEditor);
  const previewEditor = useScanner((s) => s.previewEditor);
  const rotateEditor = useScanner((s) => s.rotateEditor);
  const applyEditor = useScanner((s) => s.applyEditor);
  const closeEditor = useScanner((s) => s.closeEditor);
  const [tab, setTab] = useState<"adjust" | "preview">("preview");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeEditor]);

  const onCorners = useCallback(
    (corners: Quad) => updateEditor({ corners }),
    [updateEditor],
  );

  if (!editor) return null;

  const sourceBlob = editor.sourceBlob;

  async function setFilter(filter: ScanFilter) {
    if (processing) return;
    const currentEditor = useScanner.getState().editor;
    if (!currentEditor) return;
    if (filter === currentEditor.filter && currentEditor.previewCurrent) {
      setTab("preview");
      return;
    }
    updateEditor({ filter });
    setTab("preview");
    await previewEditor();
  }

  async function autoDetect() {
    const canvas = await canvasFromSource(sourceBlob);
    const detection = detectDocumentCorners(canvas);
    updateEditor({ corners: detection.corners });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="font-display text-lg tracking-tight">Adjust page</p>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={closeEditor}>
          <X className="size-5" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-4">
        {tab === "adjust" ? (
          <CropOverlay
            src={editor.sourceUrl}
            corners={editor.corners}
            onChange={onCorners}
          />
        ) : (
          <img
            src={editor.previewUrl}
            alt="Scanned preview"
            className="max-h-full max-w-full rounded-md bg-paper shadow-page outline outline-1 -outline-offset-1 outline-primary/10"
          />
        )}
      </div>

      <div className="border-t border-border bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          <div className="grid grid-cols-3 gap-1.5">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                disabled={processing}
                onClick={() => void setFilter(filter.id)}
                className={cn(
                  "flex h-12 flex-col items-center justify-center rounded-md px-1 text-center transition-colors duration-150",
                  editor.filter === filter.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent",
                )}
              >
                <span className="text-xs font-medium">{filter.label}</span>
              </button>
            ))}
          </div>
          {tab === "adjust" ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Rotate left"
                disabled={processing}
                onClick={() => void rotateEditor(-1)}
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Rotate right"
                disabled={processing}
                onClick={() => void rotateEditor(1)}
              >
                <RotateCw className="size-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={processing}
                onClick={() => void autoDetect()}
              >
                <ScanSearch className="size-4" />
                Auto edges
              </Button>
            </div>
          ) : null}
          <div className={tab === "preview" ? "grid grid-cols-2 gap-2" : "grid"}>
            {tab === "preview" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={processing}
                onClick={() => setTab("adjust")}
              >
                <Crop className="size-4" />
                Adjust edges
              </Button>
            ) : null}
            <Button type="button" disabled={processing} onClick={() => void applyEditor()}>
              Save page
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
