import { json } from '@sveltejs/kit';
import { uploadFile } from '$lib/services/files';
import { validateFile } from '$lib/schemas';
import { requireAuth, safeService } from '$lib/api-helpers.server';
import type { RequestHandler } from './$types';

// POST /api/files — upload a file
export const POST: RequestHandler = async ({ request, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Некорректный формат запроса' }, { status: 400 });
  }

  const file = formData.get('file') as File;
  const orderId = formData.get('order_id') as string;

  if (!file || !orderId) {
    return json({ error: 'file и order_id обязательны' }, { status: 400 });
  }

  const validation = validateFile(file);
  if (!validation.valid) {
    return json({ error: validation.error }, { status: 400 });
  }

  const [result, svcError] = await safeService(() => uploadFile(orderId, file, session.user.id));
  if (svcError) return svcError;
  return json(result, { status: 201 });
};
