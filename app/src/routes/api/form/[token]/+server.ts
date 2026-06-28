import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-admin.server';
import { publicFormSchema } from '$lib/schemas';
import { safeParse } from '$lib/api-helpers.server';
import type { RequestHandler } from './$types';

// GET /api/form/{token} — get order info for public form
export const GET: RequestHandler = async ({ params }) => {
  try {
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, company_name, form_submitted')
      .eq('form_token', params.token)
      .single();

    if (error || !order) {
      return json({ error: 'Заказ не найден. Проверьте ссылку.' }, { status: 404 });
    }
    if (order.form_submitted) {
      return json({ error: 'Форма уже заполнена и отправлена.' }, { status: 410 });
    }

    return json(order);
  } catch (err: any) {
    console.error('[form GET] error:', err?.message);
    return json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
};

// POST /api/form/{token} — submit filled form (atomic via RPC)
export const POST: RequestHandler = async ({ params, request }) => {
  // Validate input
  const [body, parseError] = await safeParse(request, publicFormSchema);
  if (parseError) return parseError;

  try {
    // Atomic form submission via PostgreSQL RPC function.
    // Uses SELECT ... FOR UPDATE to lock the order row, preventing
    // concurrent double-submit race conditions. The RPC:
    //   1. Locks the row by form_token
    //   2. Rejects if form_submitted = true
    //   3. Updates all form fields + sets form_submitted = true
    //   4. Auto-transitions status: Черновик → На согласовании
    // All in a single database transaction.
    const { data: updated, error: rpcError } = await supabaseAdmin.rpc(
      'submit_order_form',
      {
        p_token: params.token,
        p_form_data: body,
      },
    );

    if (rpcError) {
      const msg = rpcError.message || '';

      if (msg.includes('FORM_ALREADY_SUBMITTED')) {
        return json({ error: 'Форма уже отправлена.' }, { status: 410 });
      }
      if (msg.includes('FORM_NOT_FOUND')) {
        return json({ error: 'Заказ не найден.' }, { status: 404 });
      }

      console.error('[form POST] RPC error:', msg);
      return json({ error: 'Не удалось сохранить данные.' }, { status: 500 });
    }

    if (!updated) {
      return json({ error: 'Заказ не найден.' }, { status: 404 });
    }

    return json({ success: true });
  } catch (err: any) {
    console.error('[form POST] error:', err?.message);
    return json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
};
