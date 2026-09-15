import { createFileRoute, Link } from "@tanstack/react-router";
import { Mark } from "@/components/scanner/mark";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-5 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <Mark />
        Lumen
      </Link>
      <h1 className="mt-8 font-display text-3xl tracking-tight">Privacy</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Lumen is a document scanner. Pages you capture, import, or export are processed on your
          device. We do not create an account for you, and we do not operate a Lumen server that
          receives your scans.
        </p>
        <p>
          The camera is used only when you choose Scan, to photograph a page. Photos and PDFs stay
          in the app until you save, share, or clear them.
        </p>
        <p>
          If you install the Android app from Google Play, files you save are written to Downloads
          on that device. Sharing uses the Android share sheet you pick.
        </p>
        <p>Lumen’s interface fonts are packaged with the app and are not fetched from a font service.</p>
        <p>Questions about this policy can be sent by the listing contact on Google Play.</p>
      </div>
    </main>
  );
}
