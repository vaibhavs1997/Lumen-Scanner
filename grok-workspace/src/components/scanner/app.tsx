import { useEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { toast } from "sonner";
import { CameraOverlay } from "@/components/scanner/camera";
import { EditorOverlay } from "@/components/scanner/editor";
import { FilePickers, useFilePickers } from "@/components/scanner/files";
import { ingestFiles } from "@/components/scanner/ingest";
import { ProcessingOverlay } from "@/components/scanner/processing";
import { TabBar } from "@/components/scanner/tab-bar";
import { Workspace } from "@/components/scanner/workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useScanner } from "@/lib/scan/store";
import { EmptyState } from "./empty";
import { HelpDialog } from "./help";
import { Mark } from "./mark";

declare global {
  interface Window {
    LumenHandleBack?: () => boolean;
  }
}

export function ScannerApp() {
  const pages = useScanner((s) => s.pages);
  const editor = useScanner((s) => s.editor);
  const cameraOpen = useScanner((s) => s.cameraOpen);
  const processing = useScanner((s) => s.processing);
  const processingLabel = useScanner((s) => s.processingLabel);
  const error = useScanner((s) => s.error);
  const draftReady = useScanner((s) => s.draftReady);
  const setCameraOpen = useScanner((s) => s.setCameraOpen);
  const resetDocument = useScanner((s) => s.resetDocument);
  const closeEditor = useScanner((s) => s.closeEditor);
  const clearError = useScanner((s) => s.clearError);
  const hydrateDraft = useScanner((s) => s.hydrateDraft);
  const pickers = useFilePickers();
  const [dragging, setDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const busy = !draftReady || processing || exporting;
  const backStateRef = useRef({
    helpOpen,
    editor,
    cameraOpen,
    confirmNew,
    addOpen,
    dragging,
    workspaceOpen,
    pageCount: pages.length,
    busy,
  });
  backStateRef.current = {
    helpOpen,
    editor,
    cameraOpen,
    confirmNew,
    addOpen,
    dragging,
    workspaceOpen,
    pageCount: pages.length,
    busy,
  };

  useEffect(() => {
    void hydrateDraft();
  }, [hydrateDraft]);

  useEffect(() => {
    if (pages.length > 0) setWorkspaceOpen(true);
  }, [pages.length]);

  useEffect(() => {
    const preload = () => {
      void import("@/lib/scan/pdf")
        .then(({ preloadPdfProcessing }) => preloadPdfProcessing())
        .catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preload, 250);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!error) return;
    toast.error(error);
    clearError();
  }, [error, clearError]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const files = e.clipboardData?.files;
      if (files?.length) void ingestFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    const handleBack = () => {
      const state = backStateRef.current;
      if (state.helpOpen) {
        setHelpOpen(false);
        return true;
      }
      if (state.editor) {
        closeEditor();
        return true;
      }
      if (state.cameraOpen) {
        setCameraOpen(false);
        return true;
      }
      if (state.confirmNew) {
        setConfirmNew(false);
        return true;
      }
      if (state.addOpen) {
        setAddOpen(false);
        return true;
      }
      if (state.dragging) {
        setDragging(false);
        return true;
      }
      if (state.workspaceOpen && state.pageCount === 0) {
        setWorkspaceOpen(false);
        return true;
      }
      return state.busy;
    };
    window.LumenHandleBack = handleBack;
    return () => {
      if (window.LumenHandleBack === handleBack) delete window.LumenHandleBack;
    };
  }, [closeEditor, setCameraOpen]);

  function onDragOver(e: React.DragEvent) {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragEnter(e: React.DragEvent) {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void ingestFiles(e.dataTransfer.files);
  }

  const busyLabel = !draftReady
    ? "Restoring your last document…"
    : exporting
      ? "Creating your PDF…"
      : processingLabel || "Finishing up…";

  return (
    <div
      className="min-h-dvh bg-ink text-foreground"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <FilePickers
        imageRef={pickers.imageRef}
        pdfRef={pickers.pdfRef}
        captureRef={pickers.captureRef}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:border-x sm:border-border">
        <header className="flex items-center gap-2.5 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Mark />
          <p className="font-medium tracking-tight">Lumen</p>
          <div className="ml-auto flex items-center gap-1">
            {pages.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmNew(true)}>
                New
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Help"
              title="Help"
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp className="size-5" />
            </Button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!workspaceOpen && pages.length === 0 ? (
            <EmptyState onOpenWorkspace={() => setWorkspaceOpen(true)} />
          ) : (
            <Workspace
              onAdd={() => setAddOpen(true)}
              exporting={exporting}
              setExporting={setExporting}
            />
          )}
        </main>

        <TabBar
          onCamera={() => setCameraOpen(true)}
          onPhotos={pickers.pickImages}
          onPdf={pickers.pickPdf}
        />
      </div>

      {dragging ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80">
          <div className="rounded-xl bg-card px-8 py-6 text-center shadow-border">
            <p className="text-lg font-medium tracking-tight">Drop to scan</p>
            <p className="mt-1 text-sm text-muted-foreground">Photos or a PDF</p>
          </div>
        </div>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a page</DialogTitle>
            <DialogDescription>Use the bar below, or pick one of these.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                setAddOpen(false);
                setCameraOpen(true);
              }}
            >
              Camera
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                setAddOpen(false);
                pickers.pickImages();
              }}
            >
              Photos
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                setAddOpen(false);
                pickers.pickPdf();
              }}
            >
              PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmNew} onOpenChange={setConfirmNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new scan?</DialogTitle>
            <DialogDescription>
              Pages in this session will be cleared. Files you already saved stay on your device.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmNew(false)}>
              Keep editing
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmNew(false);
                resetDocument();
                setWorkspaceOpen(false);
              }}
            >
              New scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {cameraOpen ? <CameraOverlay onPickPhotos={pickers.pickImages} /> : null}
      {editor ? <EditorOverlay /> : null}
      {busy ? <ProcessingOverlay label={busyLabel} /> : null}
    </div>
  );
}
