import { json } from '@sveltejs/kit';
import { getClients, createClient } from '$lib/services/clients';
import { createClientSchema } from '$lib/schemas';
import { safeParse, requireAuth, safeService } from '$lib/api-helpers.server';
import type { RequestHandler } from './$types';

// GET /api/clients
export const GET: RequestHandler = async ({ locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [data, svcError] = await safeService(() => getClients());
  if (svcError) return svcError;
  return json(data);
};

// POST /api/clients
export const POST: RequestHandler = async ({ request, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [body, parseError] = await safeParse(request, createClientSchema);
  if (parseError) return parseError;

  const [client, svcError] = await safeService(() => createClient(body, session.user.id));
  if (svcError) return svcError;
  return json(client, { status: 201 });
};
