// Cookmate web app: keeps the app itself on the phone so it opens with a weak or no connection (a kitchen with
// patchy Wi-Fi). Only this site's own files are cached; calls to the database and AI (other hosts) go straight to
// the network. Pages: network first, falling back to the saved copy. Bundles and pictures have the content hash in
// their name, so a saved copy is always the right one: cache first.
const CACHE = "cookmate-web-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return;

  if (req.mode === "navigate") {
    // Every screen is the same app page; keep the latest copy for offline starts.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(scope, copy));
          }
          return res;
        })
        .catch(() => caches.match(scope).then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
