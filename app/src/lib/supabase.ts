import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { browser } from '$app/environment';

/**
 * Client-side Supabase client.
 * Lazy-initialized: avoids top-level await that can fail at build time.
 * In SSR mode, ws transport is attached lazily.
 */

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const options: Record<string, unknown> = {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  };

  // Attach ws transport for SSR (Node.js) — only when actually used
  if (!browser && typeof window === 'undefined') {
    // Dynamic import only on server — tree-shaken on client
    import('ws').then((ws) => {
      options.realtime = { transport: ws.default as unknown as never };
    }).catch(() => {
      // ws not available — realtime won't work in SSR (acceptable)
    });
  }

  _client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, options);
  return _client;
}

// Proxy — lazy init on first use
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getClient() as any)[prop];
  },
});
