import { useEffect, useState } from "react";
import { Files } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const [showPrivacy, setShowPrivacy] = useState(true);

  useEffect(() => {
    setShowPrivacy(typeof window.LumenNativeBridge?.postMessage !== "function");
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-8 text-center">
      <PaperStack />
      <h1 className="mt-6 text-lg font-medium tracking-tight">No scans yet</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Tap Scan to photograph a page. Use Photos or PDF in the bar below to import.
      </p>
      <Button
        type="button"
        onClick={onOpenWorkspace}
        className="mt-6"
      >
        <Files className="size-4" />
        Create multi-page scan
      </Button>
      {showPrivacy ? (
        <a href="/privacy" className="mt-8 text-xs text-muted-foreground underline-offset-4 hover:underline">
          Privacy
        </a>
      ) : null}
    </div>
  );
}

function PaperStack() {
  return (
    <div className="relative h-24 w-20" aria-hidden>
      <div className="absolute inset-0 translate-x-1.5 translate-y-1 rotate-6 rounded-md bg-secondary" />
      <div className="absolute inset-0 overflow-hidden rounded-md bg-paper shadow-page">
        <div className="mx-3 mt-4 space-y-1.5">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
          <div className="h-1 w-14 rounded-full bg-ink/15" />
          <div className="h-1 w-12 rounded-full bg-ink/15" />
          <div className="h-1 w-8 rounded-full bg-ink/10" />
        </div>
        <div className="scan-line absolute inset-x-0 top-0 h-8" />
      </div>
    </div>
  );
}
