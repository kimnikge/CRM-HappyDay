// Catering CRM service worker — v3
//
// Strategy: only the public app shell and same-origin static assets are cached.
// API / auth / Supabase traffic is NEVER intercepted nor cached, so a stale
// cached response can never leak one user's data to another user on a shared
// device. Navigations always go to the network; the pre-cached shell is only
// used as an offline fallback.

const VERSION = "v3";
const CACHE_APP = `catering-app-${VERSION}`;
const CACHE_STATIC = `catering-static-${VERSION}`;
const CURRENT_CACHES = [CACHE_APP, CACHE_STATIC];

// Public, user-independent shell files — safe to pre-cache.
const APP_SHELL = [
    "/",
    "/manifest.json",
    "/favicon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
];

// Never cache auth / REST / storage traffic or any Supabase origin.
const SUPABASE_HOST = /(^|\.)supabase\.(co|in)$/i;
const PRIVATE_PATH_PREFIXES = ["/api/", "/auth/v1", "/rest/v1", "/storage/v1"];

function isPrivateRequest(request, url) {
    // Requests carrying a bearer token are always user-scoped.
    if (request.headers.has("authorization")) return true;
    // Supabase project origins (auth, REST, storage, realtime, edge functions).
    if (SUPABASE_HOST.test(url.hostname)) return true;
    if (PRIVATE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
        return true;
    }
    // SvelteKit data endpoints can contain user-specific payloads.
    if (
        url.pathname.endsWith("/__data.json") ||
        url.searchParams.has("_data")
    ) {
        return true;
    }
    return false;
}

async function precacheShell() {
    const cache = await caches.open(CACHE_APP);
    await Promise.all(
        APP_SHELL.map(async (path) => {
            try {
                const response = await fetch(path, { cache: "reload" });
                if (response.ok) await cache.put(path, response);
            } catch {
                // A single unavailable asset must not fail the whole install.
            }
        }),
    );
}

self.addEventListener("install", (event) => {
    event.waitUntil(precacheShell());
    // No self.skipWaiting() here on purpose: a new version stays in the
    // "waiting" state so the app can show the «Доступно обновление» bar and
    // activate only when the user confirms (see SKIP_WAITING below).
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => !CURRENT_CACHES.includes(key))
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Cross-origin and private/auth/API traffic: let the network handle it.
    // Nothing is intercepted, nothing is stored.
    if (url.origin !== self.location.origin || isPrivateRequest(request, url)) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(navigationStrategy(request));
        return;
    }

    event.respondWith(staleWhileRevalidate(request));
});

/** Network-first HTML; offline falls back to the pre-cached public shell. */
async function navigationStrategy(request) {
    try {
        // Never cache navigation responses — rendered HTML may be user-specific.
        return await fetch(request);
    } catch {
        const appCache = await caches.open(CACHE_APP);
        const cachedShell = await appCache.match("/");
        if (cachedShell) return cachedShell;
        return new Response(
            "<!doctype html><html lang=\"ru\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Catering CRM — нет соединения</title><body style=\"font-family: system-ui, sans-serif; padding: 2rem; text-align: center; color: #1a1d23; background: #fafaf8\"><h1>Нет подключения</h1><p>Проверьте интернет и обновите страницу.</p></body></html>",
            {
                status: 503,
                statusText: "Service Unavailable",
                headers: { "Content-Type": "text/html; charset=utf-8" },
            },
        );
    }
}

/** Stale-while-revalidate for same-origin static assets. */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_STATIC);
    const cached = await cache.match(request);

    const network = fetch(request)
        .then((response) => {
            // Only cache clean, successful same-origin responses.
            if (response.ok && response.type === "basic") {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    const response = cached ?? (await network);
    return (
        response ??
        new Response("", { status: 503, statusText: "Service Unavailable" })
    );
}

// The update bar in +layout.svelte posts this after the user taps «Обновить»:
// the waiting worker activates immediately, then the page reloads on
// controllerchange.
self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
