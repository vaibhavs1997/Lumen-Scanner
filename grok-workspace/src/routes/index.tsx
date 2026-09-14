import { createFileRoute } from "@tanstack/react-router";
import { ScannerApp } from "@/components/scanner/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ScannerApp />;
}
