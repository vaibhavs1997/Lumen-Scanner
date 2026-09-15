import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  ImageDown,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { downloadBlob, shareOrDownload } from "@/lib/scan/image";
import { useScanner } from "@/lib/scan/store";
import { cn } from "@/lib/utils";
import { fileSlug } from "./ingest";

type WorkspaceProps = {
  onAdd: () => void;
  exporting: boolean;
  setExporting: (v: boolean) => void;
};

type DownloadKind = "pdf" | "image";

function safeFileBaseName(value: string): string {
  return value
    .replace(/\.(?:pdf|jpe?g)$/i, "")
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\p{Cc}/gu, "")
    .replace(/[.\s]+$/g, "")
    .trim()
    .slice(0, 80);
}

export function Workspace({ onAdd, exporting, setExporting }: WorkspaceProps) {
  const pages = useScanner((s) => s.pages);
  const title = useScanner((s) => s.title);
  const setTitle = useScanner((s) => s.setTitle);
  const openEditor = useScanner((s) => s.openEditor);
  const removePage = useScanner((s) => s.removePage);
  const movePage = useScanner((s) => s.movePage);
  const [selectedId, setSelectedId] = useState(pages.at(-1)?.id ?? "");
  const [downloadKind, setDownloadKind] = useState<DownloadKind | null>(null);
  const [downloadName, setDownloadName] = useState("");

  useEffect(() => {
    if (!pages.some((p) => p.id === selectedId)) {
      setSelectedId(pages.at(-1)?.id ?? "");
    }
  }, [pages, selectedId]);

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const selectedIndex = selected ? pages.findIndex((p) => p.id === selected.id) : -1;

  async function exportPdf(share: boolean, requestedName?: string) {
    if (!pages.length) return;
    setExporting(true);
    try {
      const { canvasesToPdf } = await import("@/lib/scan/pdf");
      const blob = await canvasesToPdf(
        pages.map((p) => ({ blob: p.resultBlob, width: p.width, height: p.height })),
        title,
      );
      const filename = `${requestedName || fileSlug(title)}.pdf`;
      if (share) await shareOrDownload(blob, filename, title);
      else await downloadBlob(blob, filename);
      toast.success(share ? "PDF ready" : "PDF saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "We couldn't create the PDF. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  async function savePageImage(requestedName: string) {
    if (!selected) return;
    setExporting(true);
    try {
      await downloadBlob(selected.resultBlob, `${requestedName}.jpg`);
      toast.success("Image saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "We couldn't save the image. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  function askForDownloadName(kind: DownloadKind) {
    if (kind === "image" && !selected) return;
    setDownloadName(kind === "pdf" ? fileSlug(title) : `${fileSlug(title)}-p${selectedIndex + 1}`);
    setDownloadKind(kind);
  }

  function confirmDownload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const kind = downloadKind;
    const name = safeFileBaseName(downloadName);
    if (!kind || !name) return;
    setDownloadKind(null);
    if (kind === "pdf") void exportPdf(false, name);
    else void savePageImage(name);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pb-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Document title"
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 text-base font-medium tracking-tight shadow-none focus-visible:ring-0 md:text-base"
        />
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {pages.length} {pages.length === 1 ? "page" : "pages"}
        </p>
        <Button
          type="button"
          size="icon-sm"
          disabled={exporting || pages.length === 0}
          aria-label="Save PDF"
          onClick={() => askForDownloadName("pdf")}
        >
          <FileDown className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          disabled={exporting || !selected}
          aria-label="Save image"
          onClick={() => askForDownloadName("image")}
        >
          <ImageDown className="size-4" />
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            onClick={() => setSelectedId(page.id)}
            className={cn(
              "relative h-24 w-16 shrink-0 overflow-hidden rounded-md bg-paper shadow-border transition-[box-shadow] duration-150",
              page.id === selected?.id ? "ring-2 ring-ring" : "hover:shadow-border-hover",
            )}
          >
            <img
              src={page.resultUrl}
              alt={`Page ${index + 1}`}
              className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-primary/10"
            />
            <span className="absolute bottom-1 left-1 rounded-sm bg-ink/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-paper">
              {index + 1}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-24 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-card text-muted-foreground shadow-border"
        >
          <Plus className="size-5" />
          <span className="text-xs font-medium">Add</span>
        </button>
      </div>

      {selected ? (
        <div className="flex min-h-0 flex-1 flex-col px-4">
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-card p-3">
            <img
              src={selected.resultUrl}
              alt={`Scanned page ${selectedIndex + 1}`}
              className="max-h-full max-w-full rounded-sm bg-paper object-contain shadow-page outline outline-1 -outline-offset-1 outline-primary/10"
            />
          </div>
          <div className="flex items-center gap-1 py-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={selectedIndex <= 0}
              aria-label="Move page earlier"
              onClick={() => movePage(selected.id, -1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={selectedIndex >= pages.length - 1}
              aria-label="Move page later"
              onClick={() => movePage(selected.id, 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => openEditor(selected)}
            >
              <Pencil className="size-4" />
              Adjust
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove page"
              className="text-destructive hover:text-destructive"
              onClick={() => removePage(selected.id)}
            >
              <Trash2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="ml-auto"
              disabled={exporting}
              onClick={() => void exportPdf(true)}
            >
              <Share2 className="size-4" />
              Share
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={downloadKind !== null}
        onOpenChange={(open) => {
          if (!open) setDownloadKind(null);
        }}
      >
        <DialogContent>
          <form onSubmit={confirmDownload} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Name your {downloadKind === "pdf" ? "PDF" : "image"}</DialogTitle>
              <DialogDescription>
                {downloadKind === "pdf" ? ".pdf" : ".jpg"} will be added automatically.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={downloadName}
              onChange={(event) => setDownloadName(event.target.value)}
              aria-label="File name"
              autoFocus
              enterKeyHint="done"
              onFocus={(event) => event.currentTarget.select()}
            />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDownloadKind(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!safeFileBaseName(downloadName)}>
                Save {downloadKind === "pdf" ? "PDF" : "image"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
