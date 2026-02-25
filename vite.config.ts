import { defineConfig } from "vite";
import monacoEditorPlugin from "vite-plugin-monaco-editor";

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      languageWorkers: ["json"],
    }),
  ],
  json: {
    stringify: false,
  },
});
