import { json } from '@sveltejs/kit';
import { getOrderById, updateOrder, deleteOrder } from '$lib/services/orders';
import { updateOrderSchema } from '$lib/schemas';
import { safeParse, requireAuth, safeService } from '$lib/api-helpers.server';
import type { RequestHandler } from './$types';

// GET /api/orders/{id} — full order card
export const GET: RequestHandler = async ({ params, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [order, svcError] = await safeService(() => getOrderById(params.id));
  if (svcError) return svcError;
  return json(order);
};

// PATCH /api/orders/{id} — update order fields
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [body, parseError] = await safeParse(request, updateOrderSchema);
  if (parseError) return parseError;

  const [order, svcError] = await safeService(() => updateOrder(params.id, body));
  if (svcError) return svcError;
  return json(order);
};

// DELETE /api/orders/{id} — delete order
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [, svcError] = await safeService(() => deleteOrder(params.id));
  if (svcError) return svcError;
  return json({ success: true });
};
