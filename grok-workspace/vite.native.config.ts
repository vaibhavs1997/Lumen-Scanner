import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(rootDir, "native"),
  base: "./",
  plugins: [tailwindcss(), viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    outDir: resolve(rootDir, "android/app/src/main/assets/www"),
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: false,
  },
});
