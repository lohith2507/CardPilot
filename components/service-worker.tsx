"use client";

import { useEffect } from "react";

/**
 * Registered in production only: in development a service worker serves stale
 * bundles and makes hot reload behave unpredictably.
 *
 * Development also tears down any worker left behind by a production build on
 * the same origin. Without this, running `npm start` once on localhost installs
 * a worker that keeps intercepting `npm run dev` afterwards, serving cached
 * chunks the dev server no longer builds — which breaks every page until the
 * browser's site data is cleared by hand.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        for (const reg of await navigator.serviceWorker.getRegistrations()) {
          await reg.unregister();
        }
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.filter((n) => n.startsWith("cardpilot")).map((n) => caches.delete(n)));
        }
      })();
      return;
    }

    const timer = setTimeout(() => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unavailable service worker only costs offline support.
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
