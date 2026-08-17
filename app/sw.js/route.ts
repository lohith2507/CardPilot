/**
 * The service worker is served from a route, not `public/`, so development can
 * hand back a worker that uninstalls itself.
 *
 * This matters because a worker installed by `npm start` keeps controlling
 * localhost:3000 afterwards. Development chunk URLs are not content-hashed the
 * way production's are, so the cache-first rule below would serve JavaScript
 * from an earlier compile indefinitely and every page would render blank. A
 * page in that state never boots, so it cannot fix itself from a `useEffect` —
 * the repair has to happen in the worker the browser re-fetches on navigation.
 */

/**
 * Must be identical across every instance serving one deployment, or browsers
 * see changing bytes on each update check and reinstall the worker forever. A
 * timestamp would differ per serverless cold start, so this keys off the commit
 * instead, which also retires the previous deployment's cache on activate.
 */
const CACHE = `cardpilot-${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "local"}`;

const PRODUCTION_WORKER = /* js */ `
const VERSION = ${JSON.stringify(CACHE)};
const SHELL = ["/", "/cards", "/settings", "/manifest.webmanifest", "/icons/card-stack.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Individually, so one failure doesn't abort the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve a stale recommendation or snapshot.
  if (url.pathname.startsWith("/api/")) return;

  // Build output is content-hashed and immutable, so cache-first is safe.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Pages: prefer fresh, fall back to whatever was last seen.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.mode === "navigate") {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }),
  );
});
`;

/**
 * Claims control, drops every cache this app made, then unregisters, and
 * reloads the pages it was controlling so they come back from the dev server.
 */
const DEVELOPMENT_WORKER = /* js */ `
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("cardpilot")).map((n) => caches.delete(n)));
      await self.clients.claim();
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.navigate(client.url);
      }
    })(),
  );
});
`;

export function GET() {
  const isProduction = process.env.NODE_ENV === "production";

  return new Response(isProduction ? PRODUCTION_WORKER : DEVELOPMENT_WORKER, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      // The browser must always compare against the current worker.
      "cache-control": "no-store, must-revalidate",
      "service-worker-allowed": "/",
    },
  });
}
