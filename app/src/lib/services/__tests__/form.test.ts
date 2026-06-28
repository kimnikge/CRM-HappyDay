/**
 * Tests for form service (getFormOrder, submitForm).
 *
 * Supabase client is fully mocked — no real DB calls.
 * Tests cover: normal flow, already-submitted, not-found,
 * double-submit prevention (atomicity), and error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicForm } from '$lib/schemas';

// ---- Mock supabase chain (vi.hoisted to work with vi.mock hoisting) ----
const { mockRpc, mockSingle, mockEq, mockSelect, mockFrom } = vi.hoisted(() => ({
	mockRpc: vi.fn(),
	mockSingle: vi.fn(),
	mockEq: vi.fn(),
	mockSelect: vi.fn(),
	mockFrom: vi.fn(),
}));

vi.mock('$lib/supabase.server', () => ({
	supabase: {
		from: (...args: unknown[]) => {
			mockFrom(...args);
			return {
				select: (...sargs: unknown[]) => {
					mockSelect(...sargs);
					return { eq: (...eargs: unknown[]) => {
						mockEq(...eargs);
						return { single: mockSingle };
					}};
				},
			};
		},
		rpc: mockRpc,
	},
}));

import { getFormOrder, submitForm } from '$lib/services/form';

const TOKEN = '550e8400-e29b-41d4-a716-446655440000';
const FORM_INPUT: PublicForm = {
	event_date: '2026-07-01',
	start_time: '14:00',
	address: 'ул. Тверская, 1',
	guest_count: 50,
};

beforeEach(() => {
	vi.clearAllMocks();
});

// ================================================================
// getFormOrder
// ================================================================
describe('getFormOrder', () => {
	it('returns order data when token is valid and not submitted', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { id: '1', company_name: 'ООО Ромашка', form_submitted: false },
			error: null,
		});

		const result = await getFormOrder(TOKEN);
		expect(result).toEqual({ id: '1', company_name: 'ООО Ромашка', form_submitted: false });
		expect(mockFrom).toHaveBeenCalledWith('orders');
		expect(mockSelect).toHaveBeenCalledWith('id, company_name, form_submitted');
		expect(mockEq).toHaveBeenCalledWith('form_token', TOKEN);
	});

	it('throws when token not found (DB error)', async () => {
		mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
		await expect(getFormOrder(TOKEN)).rejects.toThrow('Заказ не найден');
	});

	it('throws when form was already submitted', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { id: '1', company_name: 'X', form_submitted: true },
			error: null,
		});
		await expect(getFormOrder(TOKEN)).rejects.toThrow('Форма уже заполнена');
	});
});

// ================================================================
// submitForm
// ================================================================
describe('submitForm', () => {
	it('succeeds on first submission', async () => {
		mockRpc.mockResolvedValueOnce({ data: { id: '1' }, error: null });
		const result = await submitForm(TOKEN, FORM_INPUT);
		expect(result).toEqual({ success: true });
		expect(mockRpc).toHaveBeenCalledWith('submit_order_form', {
			p_token: TOKEN,
			p_form_data: FORM_INPUT,
		});
	});

	it('throws FORM_ALREADY_SUBMITTED on second attempt', async () => {
		mockRpc.mockResolvedValueOnce({
			data: null,
			error: { message: 'FORM_ALREADY_SUBMITTED' },
		});
		await expect(submitForm(TOKEN, FORM_INPUT)).rejects.toThrow('Форма уже отправлена');
	});

	it('throws when token not found', async () => {
		mockRpc.mockResolvedValueOnce({
			data: null,
			error: { message: 'FORM_NOT_FOUND' },
		});
		await expect(submitForm(TOKEN, FORM_INPUT)).rejects.toThrow('Заказ не найден');
	});

	it('throws generic error on unexpected RPC failure', async () => {
		mockRpc.mockResolvedValueOnce({
			data: null,
			error: { message: 'connection timeout' },
		});
		await expect(submitForm(TOKEN, FORM_INPUT)).rejects.toThrow('Не удалось сохранить данные');
	});

	it('throws when RPC returns no data without error (edge case)', async () => {
		mockRpc.mockResolvedValueOnce({ data: null, error: null });
		await expect(submitForm(TOKEN, FORM_INPUT)).rejects.toThrow('Заказ не найден');
	});

	// ============================================================
	// Race condition / double-submit simulation
	// ============================================================
	it('prevents double-submit: second concurrent call gets FORM_ALREADY_SUBMITTED', async () => {
		// Simulate two concurrent submissions:
		// 1st call succeeds
		// 2nd call (same token) gets rejected by atomic RPC
		mockRpc
			.mockResolvedValueOnce({ data: { id: '1' }, error: null })     // 1st — OK
			.mockResolvedValueOnce({ data: null, error: { message: 'FORM_ALREADY_SUBMITTED' } }); // 2nd — rejected

		const [first, second] = await Promise.allSettled([
			submitForm(TOKEN, FORM_INPUT),
			submitForm(TOKEN, FORM_INPUT),
		]);

		expect(first.status).toBe('fulfilled');
		expect(second.status).toBe('rejected');
		if (second.status === 'rejected') {
			expect(second.reason.message).toBe('Форма уже отправлена.');
		}
		expect(mockRpc).toHaveBeenCalledTimes(2);
	});

	it('rejects all three concurrent submissions except the first', async () => {
		mockRpc
			.mockResolvedValueOnce({ data: { id: '1' }, error: null })
			.mockResolvedValueOnce({ data: null, error: { message: 'FORM_ALREADY_SUBMITTED' } })
			.mockResolvedValueOnce({ data: null, error: { message: 'FORM_ALREADY_SUBMITTED' } });

		const results = await Promise.allSettled([
			submitForm(TOKEN, FORM_INPUT),
			submitForm(TOKEN, FORM_INPUT),
			submitForm(TOKEN, FORM_INPUT),
		]);

		const fulfilled = results.filter(r => r.status === 'fulfilled');
		const rejected = results.filter(r => r.status === 'rejected');
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(2);
	});
});
