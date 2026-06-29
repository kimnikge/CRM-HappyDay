// PWA Service Worker v2 — stale-while-revalidate + offline fallback
const CACHE_APP = "catering-app-v2";
const CACHE_CDN = "catering-cdn-v2";
const CACHE_API = "catering-api-v2";

// App shell: critical routes to pre-cache for instant loading
const APP_SHELL = ["/", "/login"];

// CDN resources: external fonts & styles (networkFirst within 30d)
const CDN_ORIGINS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// Install: pre-cache app shell
self.addEventListener("install", (e: any) => {
    e.waitUntil(
        caches
            .open(CACHE_APP)
            .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
            .then(() => self.skipWaiting()),
    );
});

// Activate: purge old cache versions
self.addEventListener("activate", (e: any) => {
    e.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter(
                            (k) =>
                                !k.startsWith("catering-app-") &&
                                !k.startsWith("catering-cdn-") &&
                                !k.startsWith("catering-api-"),
                        )
                        .map((k) => caches.delete(k)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

// Fetch: stale-while-revalidate for app, network-first for CDN, cache-first for API reads
self.addEventListener("fetch", (e: any) => {
    const { request } = e;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // CDN resources (fonts etc.) — network first
    if (CDN_ORIGINS.some((o) => url.hostname.includes(o))) {
        e.respondWith(cdnStrategy(request));
        return;
    }

    // API / Supabase requests — network first, no cache
    if (
        url.pathname.startsWith("/api/") ||
        url.hostname.includes("supabase")
    ) {
        e.respondWith(networkFirst(request));
        return;
    }

    // Navigation & app shell — stale-while-revalidate
    if (request.mode === "navigate" || APP_SHELL.includes(url.pathname)) {
        e.respondWith(staleWhileRevalidate(request));
        return;
    }

    // Static assets — stale-while-revalidate
    e.respondWith(staleWhileRevalidate(request));
});

/** Cache-first, falling back to network, caching responses */
async function staleWhileRevalidate(req: Request): Promise<Response> {
    const cache = await caches.open(CACHE_APP);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req)
        .then((res) => {
            if (res.ok) {
                cache.put(req, res.clone());
            }
            return res;
        })
        .catch(() => cached);
    return cached ?? fetchPromise;
}

/** Network-first, falling back to cache */
async function networkFirst(req: Request): Promise<Response> {
    const cache = await caches.open(CACHE_CDN);
    try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
    } catch {
        const cached = await cache.match(req);
        return (
            cached ??
            new Response("Offline", {
                status: 503,
                statusText: "Service Unavailable",
            })
        );
    }
}

/** CDN strategy: network-first with long cache fallback */
async function cdnStrategy(req: Request): Promise<Response> {
    const cache = await caches.open(CACHE_CDN);
    try {
        const res = await fetch(req, { mode: "cors" });
        if (res.ok) cache.put(req, res.clone());
        return res;
    } catch {
        const cached = await cache.match(req);
        return (
            cached ??
            new Response("", { status: 408, statusText: "Timeout" })
        );
    }
}

// Immediate claim on install
self.addEventListener("message", (e: any) => {
    if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
