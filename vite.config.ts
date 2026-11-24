import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
// @ts-ignore Build-only JavaScript plugin.
import { inlineStyles } from "./scripts/inline-styles.mjs";
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), inlineStyles()],
  resolve: {
    alias:
      mode === "portfolio"
        ? [
            {
              find: /^\.\/App$/,
              replacement: fileURLToPath(
                new URL("./src/portfolio/PortfolioApp.tsx", import.meta.url),
              ),
            },
          ]
        : [],
  },
  build: { outDir: mode === "portfolio" ? "dist-portfolio" : "dist" },
  server: { proxy: { "/api": "http://localhost:3001" } },
}));
