import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Set base path based on environment
  const base = mode === 'staging' 
    ? "/JaysBot/staging/"  // Staging subdirectory
    : "/JaysBot/";          // Production root

  return {
    base, // <-- Dynamic base path
    plugins: [react()],
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
  };
});
