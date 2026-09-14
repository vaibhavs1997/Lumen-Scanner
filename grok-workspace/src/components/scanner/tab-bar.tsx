import { Camera, FileText, Images } from "lucide-react";
import { cn } from "@/lib/utils";

type TabBarProps = {
  onCamera: () => void;
  onPhotos: () => void;
  onPdf: () => void;
};

export function TabBar({ onCamera, onPhotos, onPdf }: TabBarProps) {
  return (
    <nav
      className="relative z-20 border-t border-border bg-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Scan actions"
    >
      <div className="grid grid-cols-3 items-end">
        <NavItem icon={Images} label="Photos" onClick={onPhotos} />
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={onCamera}
            aria-label="Scan with camera"
            className="-mt-7 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-page transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <Camera className="size-7" />
          </button>
          <span className="mt-1 text-xs font-medium text-foreground">Scan</span>
        </div>
        <NavItem icon={FileText} label="PDF" onClick={onPdf} />
      </div>
    </nav>
  );
}

function NavItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Images;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 flex-col items-center justify-center gap-1 text-muted-foreground",
        "transition-colors duration-150 hover:text-foreground",
      )}
    >
      <Icon className="size-5" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
