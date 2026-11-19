// After a new deployment, a tab opened earlier still references old hashed chunks that no longer exist
// ("Failed to fetch dynamically imported module"). Reload once so the tab picks up the new build.
const RELOAD_KEY = 'ecoloop-chunk-reload';
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isChunkError(error: unknown) {
  return CHUNK_ERROR.test(String((error as {message?: string})?.message ?? error));
}

export function reloadForNewBuild() {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { return false; }
  location.reload();
  return true;
}

/** Wraps a dynamic import: on a stale-chunk error, reload once instead of showing the raw error. */
export function lazyImport<T>(load: () => Promise<T>): Promise<T> {
  return load().catch(error => {
    if (isChunkError(error) && reloadForNewBuild()) return new Promise<T>(() => {});
    if (isChunkError(error)) throw new Error('Ứng dụng vừa được cập nhật. Hãy tải lại trang (Ctrl+Shift+R).');
    throw error;
  });
}

export function installChunkReload() {
  window.addEventListener('vite:preloadError', event => { if (reloadForNewBuild()) event.preventDefault(); });
  window.addEventListener('unhandledrejection', event => { if (isChunkError(event.reason)) reloadForNewBuild(); });
  window.addEventListener('load', () => setTimeout(() => { try { sessionStorage.removeItem(RELOAD_KEY); } catch {} }, 10_000));
}
