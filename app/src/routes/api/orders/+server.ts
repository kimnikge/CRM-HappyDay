import { json } from '@sveltejs/kit';
import { getOrders, createOrder } from '$lib/services/orders';
import { createOrderSchema } from '$lib/schemas';
import { safeParse, requireAuth, safeService } from '$lib/api-helpers.server';
import type { RequestHandler } from './$types';

// GET /api/orders — list orders with optional filters
export const GET: RequestHandler = async ({ url, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const search = url.searchParams.get('search') || undefined;
  const dateFrom = url.searchParams.get('date_from') || undefined;
  const dateTo = url.searchParams.get('date_to') || undefined;

  const [data, svcError] = await safeService(() => getOrders({ search, dateFrom, dateTo }));
  if (svcError) return svcError;
  return json(data);
};

// POST /api/orders — create a new order
export const POST: RequestHandler = async ({ request, locals }) => {
  const [session, authError] = await requireAuth(locals);
  if (authError) return authError;

  const [body, parseError] = await safeParse(request, createOrderSchema);
  if (parseError) return parseError;

  const [order, svcError] = await safeService(() => createOrder(body, session.user.id));
  if (svcError) return svcError;
  return json(order, { status: 201 });
};
