import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/JaysBot/", // <-- Required for GitHub Pages
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "chatbot.js",
        chunkFileNames: "chatbot.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "chatbot.css";
          }
          // Keep other assets in assets folder
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
