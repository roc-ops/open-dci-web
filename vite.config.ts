import { defineConfig } from "vite";
import monacoEditorPluginModule from "vite-plugin-monaco-editor";

// Handle both ESM default and CJS .default export patterns
const monacoEditorPlugin = (monacoEditorPluginModule as unknown as { default: typeof monacoEditorPluginModule }).default ?? monacoEditorPluginModule;

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
