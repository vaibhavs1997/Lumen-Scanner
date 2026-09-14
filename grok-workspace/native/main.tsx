import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ScannerApp } from "@/components/scanner/app";
import { Toaster } from "@/components/ui/sonner";
import "@/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root");

createRoot(root).render(
  <StrictMode>
    <ScannerApp />
    <Toaster />
  </StrictMode>,
);
