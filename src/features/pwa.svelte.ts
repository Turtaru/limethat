export const pwa = $state({ ready: false, update: false, activating: false, error: '', online: true });
let registration: ServiceWorkerRegistration | undefined;

/** Registers only the deployed app shell; archive files and object URLs never enter the service worker cache. */
export async function startPwa() {
  if (!import.meta.env.PROD || import.meta.env.MODE === 'framing') return;
  if (!('serviceWorker' in navigator)) { pwa.error = 'Offline app-shell caching is unavailable in this browser.'; return; }
  try {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data === 'close-other-tabs') {
        pwa.activating = false;
        pwa.error = 'Close other Limethat tabs before updating; their drafts may still be open.';
      }
    });
    registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
    pwa.ready = !!registration.active;
    const update = () => { pwa.update = !!registration?.waiting; };
    update();
    registration.addEventListener('updatefound', () => {
      const worker = registration?.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') { pwa.ready = true; update(); }
      });
    });
    void navigator.serviceWorker.ready.then(() => { pwa.ready = true; update(); });
  } catch (cause) { pwa.error = cause instanceof Error ? cause.message : 'Offline shell setup failed.'; }
}

export function applyUpdate() {
  if (!registration?.waiting || pwa.activating) return;
  pwa.activating = true;
  pwa.error = '';
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  registration.waiting.postMessage('activate');
}
