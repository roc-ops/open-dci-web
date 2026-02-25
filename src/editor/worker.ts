/**
 * Monaco web worker configuration.
 * Sets up the MonacoEnvironment.getWorker for JSON language support.
 *
 * The vite-plugin-monaco-editor handles bundling workers as separate chunks,
 * but we still need to configure self.MonacoEnvironment so Monaco knows
 * how to resolve worker URLs at runtime.
 */

export function configureWorkers(): void {
  // The vite-plugin-monaco-editor emits worker entry points that are
  // importable via new Worker(new URL(...)). We set getWorker so Monaco
  // can lazily spin up the correct worker for each language.
  (self as unknown as Record<string, unknown>).MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      if (label === 'json') {
        return new Worker(
          new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
          { type: 'module' },
        );
      }
      // Default editor worker for tokenization, etc.
      return new Worker(
        new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
        { type: 'module' },
      );
    },
  };
}
