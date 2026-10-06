/**
 * Installable, offline-capable app: register the service worker the build writes (dist/sw.js).
 * Production only, so `vite dev` never serves stale modules from a cache.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
