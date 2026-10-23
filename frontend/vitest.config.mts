import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Lets tests import "@/..." like the app does and render components with the automatic JSX runtime.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
