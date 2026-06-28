import { supabase } from '$lib/supabase.server';
import type { PublicForm } from '$lib/schemas';

export async function getFormOrder(token: string) {
	const { data, error } = await supabase
		.from('orders')
		.select('id, company_name, form_submitted')
		.eq('form_token', token)
		.single();

	if (error) throw new Error('Заказ не найден. Проверьте ссылку.');
	if (data.form_submitted) throw new Error('Форма уже заполнена и отправлена.');

	return data;
}

/**
 * Submit form data atomically via PostgreSQL RPC.
 *
 * The RPC function submit_order_form():
 *  1. Locks the order row (SELECT ... FOR UPDATE)
 *  2. Rejects if form_submitted = true (prevents double-submit)
 *  3. Updates all form fields + sets form_submitted = true
 *  4. Auto-transitions: Черновик → На согласовании
 *
 * All in a single database transaction — no race condition possible.
 */
export async function submitForm(token: string, input: PublicForm) {
	const { data, error } = await supabase.rpc('submit_order_form', {
		p_token: token,
		p_form_data: input,
	});

	if (error) {
		const msg = error.message || '';
		if (msg.includes('FORM_ALREADY_SUBMITTED')) {
			throw new Error('Форма уже отправлена.');
		}
		if (msg.includes('FORM_NOT_FOUND')) {
			throw new Error('Заказ не найден.');
		}
		throw new Error('Не удалось сохранить данные.');
	}

	if (!data) {
		throw new Error('Заказ не найден.');
	}

	return { success: true };
}
