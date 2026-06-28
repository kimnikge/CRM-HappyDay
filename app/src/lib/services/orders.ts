import { supabase } from '$lib/supabase.server';
import type { CreateOrder, UpdateOrder, ChangeStatus } from '$lib/schemas';

// ---- Constants ----
const DRAFT_ORDER_INDEX = 0; // Черновик
const APPROVAL_ORDER_INDEX = 1; // На согласовании

// ---- Helpers ----

/** Get status ID by order_index (uses index, faster than name lookup) */
async function getStatusIdByIndex(orderIndex: number): Promise<string> {
	const { data, error } = await supabase
		.from('statuses')
		.select('id')
		.eq('order_index', orderIndex)
		.single();

	if (error || !data) throw new Error(`Статус с индексом ${orderIndex} не найден`);
	return data.id;
}

// ---- Orders ----

export async function getOrders(filters?: {
	search?: string;
	dateFrom?: string;
	dateTo?: string;
	page?: number;
	pageSize?: number;
}) {
	let query = supabase
		.from('orders')
		.select(
			'*, clients(name), statuses!inner(name, order_index), profiles!orders_manager_id_fkey(full_name, initials)',
			{ count: 'estimated' },
		)
		.order('created_at', { ascending: false });

	// Apply filters before ordering for optimal index use
	if (filters?.search) {
		const term = `%${filters.search}%`;
		query = query.or(`company_name.ilike.${term},contact_person.ilike.${term}`);
	}
	if (filters?.dateFrom) {
		query = query.gte('event_date', filters.dateFrom);
	}
	if (filters?.dateTo) {
		query = query.lte('event_date', filters.dateTo);
	}

	// Pagination (optional — MVP may omit)
	if (filters?.page !== undefined && filters?.pageSize) {
		const from = (filters.page - 1) * filters.pageSize;
		query = query.range(from, from + filters.pageSize - 1);
	}

	const { data, error, count } = await query;
	if (error) throw error;
	return { data: data ?? [], count };
}

export async function getOrderById(id: string) {
	const { data, error } = await supabase
		.from('orders')
		.select('*, clients(*), statuses(*), profiles!orders_manager_id_fkey(full_name, initials)')
		.eq('id', id)
		.single();

	if (error) throw error;
	return data;
}

export async function createOrder(input: CreateOrder, managerId: string) {
	const draftStatusId = await getStatusIdByIndex(DRAFT_ORDER_INDEX);

	const { data, error } = await supabase
		.from('orders')
		.insert({
			...input,
			manager_id: managerId,
			status_id: draftStatusId,
		})
		.select()
		.single();

	if (error) throw error;

	// Record initial status in history
	await supabase.from('status_history').insert({
		order_id: data.id,
		new_status_id: draftStatusId,
		changed_by: managerId,
	});

	return data;
}

export async function updateOrder(id: string, input: UpdateOrder) {
	const { data, error } = await supabase
		.from('orders')
		.update(input)
		.eq('id', id)
		.select()
		.single();

	if (error) throw error;
	return data;
}

/**
 * Change order status — atomic via PostgreSQL RPC function.
 * The RPC handles status update + history insert in a single transaction
 * with row-level locking to prevent race conditions.
 */
export async function changeOrderStatus(orderId: string, input: ChangeStatus, userId: string) {
	const { data, error } = await supabase.rpc('change_order_status', {
		p_order_id: orderId,
		p_new_status_id: input.status_id,
		p_user_id: userId,
		p_comment: input.comment ?? null,
	});

	if (error) throw error;
	return data;
}

export async function deleteOrder(id: string) {
	const { error } = await supabase.from('orders').delete().eq('id', id);
	if (error) throw error;
}

// ---- Kanban summary ----
export async function getKanbanSummary() {
	const { data, error } = await supabase
		.from('statuses')
		.select(`
			id, name, order_index,
			orders:orders(count, total_cost:total_cost.sum())
		`)
		.order('order_index');

	if (error) throw error;
	return data;
}
