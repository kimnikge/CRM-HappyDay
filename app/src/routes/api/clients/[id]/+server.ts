import { json } from '@sveltejs/kit';
import { updateClient } from '$lib/services/clients';
import { createClientSchema } from '$lib/schemas';
import { safeParse, requireAuth, safeService } from '$lib/api-helpers.server';
import { supabase } from '$lib/supabase.server';
import type { RequestHandler } from './$types';

// PATCH /api/clients/{id}
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [body, parseError] = await safeParse(request, createClientSchema.partial());
  if (parseError) return parseError;

  const [client, svcError] = await safeService(() => updateClient(params.id, body));
  if (svcError) return svcError;
  return json(client);
};

// DELETE /api/clients/{id}
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [, svcError] = await safeService(async () => {
    const { error } = await supabase.from('clients').delete().eq('id', params.id);
    if (error) throw error;
    return true;
  });
  if (svcError) return svcError;
  return json({ success: true });
};
