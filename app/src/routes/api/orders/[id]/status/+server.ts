import { json } from '@sveltejs/kit';
import { changeOrderStatus } from '$lib/services/orders';
import { changeStatusSchema } from '$lib/schemas';
import { safeParse, requireAuth, safeService } from '$lib/api-helpers.server';
import type { RequestHandler } from './$types';

// PATCH /api/orders/{id}/status — change order status
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [body, parseError] = await safeParse(request, changeStatusSchema);
  if (parseError) return parseError;

  const [order, svcError] = await safeService(() => changeOrderStatus(params.id, body, session.user.id));
  if (svcError) return svcError;
  return json(order);
};
