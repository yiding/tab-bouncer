import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  build: {
    target: "esnext",
    minify: false,
    rollupOptions: {
      input: {
        "background.js": "src/background.ts",
      },
      output: {
        entryFileNames: "[name]",
      },
    },
  },
});
