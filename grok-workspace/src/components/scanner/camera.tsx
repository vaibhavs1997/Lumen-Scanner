import { useEffect, useRef, useState } from "react";
import { Flashlight, FlashlightOff, SwitchCamera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScanner } from "@/lib/scan/store";
import { MAX_EDGE } from "@/lib/scan/image";
import { cn } from "@/lib/utils";

type Facing = "environment" | "user";
type CameraCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
};
type TorchSettings = MediaTrackSettings & { torch?: boolean };
type TorchConstraint = MediaTrackConstraintSet & { torch: boolean };
type ZoomConstraint = MediaTrackConstraintSet & { zoom: number };

export function CameraOverlay({ onPickPhotos }: { onPickPhotos: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const [torchError, setTorchError] = useState<string | null>(null);
  const setCameraOpen = useScanner((s) => s.setCameraOpen);
  const openNewEditor = useScanner((s) => s.openNewEditor);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setReady(false);
      setError(null);
      setTorchSupported(false);
      setTorchOn(false);
      setTorchBusy(false);
      setTorchError(null);
      stopStream(streamRef.current);
      streamRef.current = null;
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot open the camera. Choose a photo instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
        });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stopStream(stream);
          streamRef.current = null;
          return;
        }
        video.srcObject = stream;
        await video.play();
        await waitForFirstFrame(video);
        if (cancelled) return;
        const track = stream.getVideoTracks()[0];
        try {
          const capabilities = track?.getCapabilities() as CameraCapabilities | undefined;
          if (track && capabilities?.zoom) {
            const zoom = Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min, 1));
            await track.applyConstraints({ advanced: [{ zoom } as ZoomConstraint] });
          }
          setTorchSupported(facing === "environment" && capabilities?.torch === true);
        } catch {
          setTorchSupported(false);
        }
        setReady(true);
      } catch (error) {
        stopStream(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        if (!cancelled) {
          const permissionDenied =
            error instanceof DOMException &&
            (error.name === "NotAllowedError" || error.name === "SecurityError");
          setError(
            permissionDenied
              ? "Camera permission was blocked. Choose a photo instead, or allow the camera and try again."
              : "The camera preview could not start. Close it and try again.",
          );
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCameraOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCameraOpen]);

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopStream(streamRef.current);
    streamRef.current = null;
    setCameraOpen(false);
    void openNewEditor(canvas);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported || torchBusy) return;
    const next = !torchOn;
    setTorchBusy(true);
    setTorchError(null);
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraint] });
      const settings = track.getSettings() as TorchSettings;
      setTorchOn(typeof settings.torch === "boolean" ? settings.torch : next);
    } catch {
      setTorchOn(false);
      setTorchError("Flash control is unavailable on this camera.");
    } finally {
      setTorchBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="font-display text-lg tracking-tight">Camera</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close camera"
          onClick={() => setCameraOpen(false)}
        >
          <X className="size-5" />
        </Button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-ink" aria-busy={!ready && !error}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={cn(
            "h-full w-full object-contain transition-opacity duration-300 ease-out",
            ready ? "opacity-100" : "opacity-0",
          )}
          style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
        />
        {!error ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink transition-opacity duration-300",
              ready ? "opacity-0" : "opacity-100",
            )}
          >
            <span className="size-7 animate-spin rounded-full border-2 border-paper/25 border-t-paper" />
            <p className="text-sm font-medium text-paper/80">
              {facing === "environment" ? "Opening camera…" : "Opening front camera…"}
            </p>
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 px-6">
            <div className="max-w-sm text-center">
              <p className="text-sm leading-relaxed text-muted-foreground">{error}</p>
              <Button
                type="button"
                className="mt-4"
                onClick={() => {
                  setCameraOpen(false);
                  onPickPhotos();
                }}
              >
                Choose a photo
              </Button>
            </div>
          </div>
        ) : null}
        {torchError && !error ? (
          <p className="absolute right-4 bottom-4 left-4 rounded-md bg-background/85 px-3 py-2 text-center text-xs text-muted-foreground">
            {torchError}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-8 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Switch camera"
          disabled={!ready}
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
        >
          <SwitchCamera className="size-5" />
        </Button>
        <button
          type="button"
          aria-label="Capture page"
          disabled={!ready}
          onClick={capture}
          className="flex size-16 items-center justify-center rounded-full border border-primary/40 p-1 disabled:opacity-40"
        >
          <span className="size-full rounded-full bg-primary" />
        </button>
        {torchSupported ? (
          <Button
            type="button"
            variant={torchOn ? "secondary" : "ghost"}
            size="icon"
            disabled={!ready || torchBusy}
            aria-label={torchOn ? "Turn flash off" : "Turn flash on"}
            aria-pressed={torchOn}
            onClick={() => void toggleTorch()}
          >
            {torchOn ? <FlashlightOff className="size-5" /> : <Flashlight className="size-5" />}
          </Button>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </div>
    </div>
  );
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function waitForFirstFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 1) {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Camera preview timed out"));
    }, 10_000);
    const loaded = () => {
      cleanup();
      requestAnimationFrame(() => resolve());
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", loaded);
    };
    video.addEventListener("loadeddata", loaded, { once: true });
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 1) loaded();
  });
}
