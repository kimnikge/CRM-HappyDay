// ============================================================
// Catering CRM — Typed API Client (client-side)
//
// All client pages MUST use this module instead of direct
// Supabase calls. This provides:
//   • Typed request/response contracts via Zod inference
//   • Centralized error handling
//   • Single point to add caching, retry, logging later
// ============================================================

import type {
	CreateClient,
	CreateOrder,
	UpdateOrder,
	ChangeStatus,
	PublicForm,
} from '$lib/schemas';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

// ---- Generic fetch wrapper ----
class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public details?: string[],
	) {
		super(message);
		this.name = 'ApiError';
	}
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
	const res = await fetch(url, options);

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new ApiError(
			res.status,
			body.error || `HTTP ${res.status}`,
			body.details,
		);
	}

	return res.json();
}

// ---- Clients ----
export async function fetchClients() {
	return request<any[]>('/api/clients');
}

export async function createClient(input: CreateClient) {
	return request<any>('/api/clients', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
}

export async function updateClient(id: string, input: Partial<CreateClient>) {
	return request<any>(`/api/clients/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
}

// ---- Orders ----
export async function fetchOrders(params?: {
	search?: string;
	dateFrom?: string;
	dateTo?: string;
}) {
	const searchParams = new URLSearchParams();
	if (params?.search) searchParams.set('search', params.search);
	if (params?.dateFrom) searchParams.set('date_from', params.dateFrom);
	if (params?.dateTo) searchParams.set('date_to', params.dateTo);

	const qs = searchParams.toString();
	return request<any[]>(`/api/orders${qs ? `?${qs}` : ''}`);
}

export async function fetchOrderById(id: string) {
	return request<any>(`/api/orders/${id}`);
}

export async function createOrder(input: CreateOrder) {
	return request<any>('/api/orders', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
}

export async function updateOrder(id: string, input: UpdateOrder) {
	return request<any>(`/api/orders/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
}

export async function changeOrderStatus(id: string, input: ChangeStatus) {
	return request<any>(`/api/orders/${id}/status`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
}

export async function deleteOrder(id: string) {
	return request<{ success: boolean }>(`/api/orders/${id}`, {
		method: 'DELETE',
	});
}

// ---- Statuses ----
export async function fetchStatuses() {
	return request<any[]>('/api/statuses');
}

// ---- Status History ----
export async function fetchStatusHistory(orderId: string) {
	return request<any[]>(`/api/orders/${orderId}/status`);
}

// ---- Files ----
export async function fetchFiles(orderId: string) {
	return request<any[]>(`/api/files?order_id=${orderId}`);
}

export async function uploadFile(orderId: string, file: File) {
	const formData = new FormData();
	formData.set('file', file);
	formData.set('order_id', orderId);

	return request<any>('/api/files', {
		method: 'POST',
		body: formData,
	});
}

export async function deleteFile(fileId: string) {
	return request<{ success: boolean }>(`/api/files/${fileId}`, {
		method: 'DELETE',
	});
}

export function getFilePublicUrl(filePath: string): string {
	// Uses Supabase public URL — constructed from env for portability
	const base = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/order-files/`;
	return `${base}${filePath}`;
}

// ---- Public Form ----
export async function fetchPublicForm(token: string) {
	return request<{ id: string; company_name: string; form_submitted: boolean }>(
		`/api/form/${token}`,
	);
}

export async function submitPublicForm(token: string, input: PublicForm) {
	return request<{ success: boolean }>(`/api/form/${token}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
}

// ---- Auth (delegated to Supabase client — only exception) ----
// Auth uses Supabase client directly because it manages cookies/sessions.
// This is the ONLY allowed exception to the API-client rule.
export { ApiError };
