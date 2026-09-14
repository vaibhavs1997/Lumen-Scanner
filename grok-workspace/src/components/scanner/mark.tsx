import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-8 items-center justify-center rounded-md bg-secondary",
        className,
      )}
      aria-hidden
    >
      <span className="h-4 w-3 rounded-[2px] bg-paper" />
      <span className="absolute inset-x-1.5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ring" />
    </span>
  );
}
