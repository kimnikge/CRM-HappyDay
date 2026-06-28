import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import WebSocket from 'ws';

// Server-side Supabase client — uses 'ws' transport for Node.js compatibility.
// No cookie handling (stateless) — for use in API endpoints where
// authentication is handled via `locals.auth()` from hooks.
export const supabase = createServerClient(
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY,
	{
		cookies: {
			getAll: () => [],
			setAll: () => {},
		},
		realtime: { transport: WebSocket as unknown as never },
	},
);
