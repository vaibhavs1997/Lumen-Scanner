import {
  Camera,
  Download,
  FileText,
  Images,
  Layers3,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

type HelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const tools = [
  {
    icon: Camera,
    title: "Scan",
    description: "Photograph a paper document. Keep the phone level and include the whole page in the preview.",
  },
  {
    icon: Images,
    title: "Photos",
    description: "Choose one or several existing images from your gallery.",
  },
  {
    icon: FileText,
    title: "PDF",
    description: "Import a PDF and turn its pages into an editable scan.",
  },
  {
    icon: SlidersHorizontal,
    title: "Adjust and filters",
    description: "Correct the page edges, rotate it, then choose Enhance, B&W, or Gray.",
  },
  {
    icon: Layers3,
    title: "Pages",
    description:
      "Use Add for more pages. Tap a thumbnail to select it or use the arrows to reorder it.",
  },
  {
    icon: Download,
    title: "Save",
    description: "Use the top PDF or image button, enter a filename, and confirm the save.",
  },
  {
    icon: Share2,
    title: "Share",
    description: "Send the complete document as a PDF using your phone's share menu.",
  },
];

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dvh overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How to use Lumen</DialogTitle>
          <DialogDescription>
            Capture, clean up, arrange, and save documents directly on your device.
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="quick-start-title">
          <h2 id="quick-start-title" className="mb-3 text-sm font-medium">
            Quick start
          </h2>
          <ol className="grid gap-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                1
              </span>
              <span>Choose Scan, Photos, or PDF from the bottom bar.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                2
              </span>
              <span>Adjust the page and apply Enhance, B&W, or Gray. Tap Save page.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                3
              </span>
              <span>Add more pages if needed, then save an image or the complete PDF.</span>
            </li>
          </ol>
        </section>

        <Separator />

        <section aria-labelledby="tools-title">
          <h2 id="tools-title" className="mb-3 text-sm font-medium">
            Tools
          </h2>
          <div className="grid gap-4">
            {tools.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-medium">{title}</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Separator />

        <section aria-labelledby="downloads-title" className="rounded-lg bg-secondary p-4">
          <h2 id="downloads-title" className="text-sm font-medium text-secondary-foreground">
            Where are saved files?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            In the Android app, open your phone's Files app and look in Downloads. In a web browser,
            files go to that browser's normal download folder.
          </p>
        </section>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Your unfinished document is restored when you return. Starting a New scan clears the
          current pages, but files you already downloaded stay on your device.
        </p>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
