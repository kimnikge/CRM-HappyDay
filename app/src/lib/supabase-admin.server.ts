import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import WebSocket from 'ws';

// Admin client — uses service_role key to bypass RLS.
// Only for server-side API endpoints that need unrestricted access.
// ⚠️ SERVICE_ROLE_KEY must NEVER be exposed to the client.
// Lazy-initialized: only throws at runtime when actually used, not at build time.

let _adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
	if (_adminClient) return _adminClient;

	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) {
		throw new Error(
			'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your .env file.\n' +
			'Get it from Supabase Dashboard → Project Settings → API → service_role key.',
		);
	}

	_adminClient = createClient(PUBLIC_SUPABASE_URL, key, {
		realtime: { transport: WebSocket as unknown as never },
	});
	return _adminClient;
}

// Proxy that lazily initializes the admin client
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
	get(_, prop) {
		return (getAdminClient() as any)[prop];
	},
});