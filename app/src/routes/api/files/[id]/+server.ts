import { json } from '@sveltejs/kit';
import { deleteFile } from '$lib/services/files';
import { requireAuth, safeService } from '$lib/api-helpers.server';
import type { RequestHandler } from './$types';

// DELETE /api/files/{id}
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [, svcError] = await safeService(() => deleteFile(params.id));
  if (svcError) return svcError;
  return json({ success: true });
};
