export function ProcessingOverlay({ label }: { label: string }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 px-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl bg-card p-6 shadow-border">
        <div className="relative h-28 w-40 overflow-hidden rounded-md bg-paper">
          <div className="scan-line absolute inset-x-0 top-0 h-14 w-full" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">This usually takes only a moment.</p>
        </div>
      </div>
    </div>
  );
}
