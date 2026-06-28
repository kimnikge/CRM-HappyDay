/**
 * Tests for /api/form/[token] endpoint (GET + POST).
 *
 * supabaseAdmin is mocked; tests verify:
 *  - Correct response codes (200, 404, 410, 400, 500)
 *  - Atomic form submission via RPC
 *  - Input validation via Zod
 *  - Double-submit prevention
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock supabaseAdmin (vi.hoisted for vi.mock hoisting) ----
const { mockRpc, mockSingle, mockEq, mockSelect, mockFrom } = vi.hoisted(() => ({
	mockRpc: vi.fn(),
	mockSingle: vi.fn(),
	mockEq: vi.fn(),
	mockSelect: vi.fn(),
	mockFrom: vi.fn(),
}));

vi.mock('$lib/supabase-admin.server', () => ({
	supabaseAdmin: {
		from: (...args: unknown[]) => {
			mockFrom(...args);
			return {
				select: (...sargs: unknown[]) => {
					mockSelect(...sargs);
					return {
						eq: (...eargs: unknown[]) => {
							mockEq(...eargs);
							return { single: mockSingle };
						},
					};
				},
			};
		},
		rpc: mockRpc,
	},
}));

// Mock safeParse to pass through (we test Zod separately)
vi.mock('$lib/api-helpers.server', () => ({
	safeParse: vi.fn(async (request: Request) => {
		const body = await request.json();
		return [body, null]; // always pass validation in endpoint tests
	}),
}));

import { GET, POST } from '../../../api/form/[token]/+server';

const TOKEN = '550e8400-e29b-41d4-a716-446655440000';

function mockParams(token: string) {
	return { token } as unknown as { token: string };
}

function mockRequest(body: unknown): Request {
	return new Request('https://test.local/api/form/' + TOKEN, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ================================================================
// GET /api/form/{token}
// ================================================================
describe('GET /api/form/[token]', () => {
	it('returns 200 with order data when token valid and not submitted', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { id: '1', company_name: 'ООО Ромашка', form_submitted: false },
			error: null,
		});

		const res = await GET({ params: mockParams(TOKEN) } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.company_name).toBe('ООО Ромашка');
		expect(body.form_submitted).toBe(false);
	});

	it('returns 404 when token not found', async () => {
		mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
		const res = await GET({ params: mockParams(TOKEN) } as any);
		expect(res.status).toBe(404);
	});

	it('returns 410 when form already submitted', async () => {
		mockSingle.mockResolvedValueOnce({
			data: { id: '1', company_name: 'X', form_submitted: true },
			error: null,
		});
		const res = await GET({ params: mockParams(TOKEN) } as any);
		expect(res.status).toBe(410);
	});

	it('returns 500 on unexpected error', async () => {
		mockSingle.mockRejectedValueOnce(new Error('DB crash'));
		const res = await GET({ params: mockParams(TOKEN) } as any);
		expect(res.status).toBe(500);
	});
});

// ================================================================
// POST /api/form/{token}
// ================================================================
describe('POST /api/form/[token]', () => {
	const validBody = {
		event_date: '2026-07-01',
		start_time: '14:00',
		address: 'ул. Тверская, 1',
		guest_count: 50,
	};

	it('returns 200 on successful first submission', async () => {
		mockRpc.mockResolvedValueOnce({ data: { id: '1' }, error: null });

		const res = await POST({
			params: mockParams(TOKEN),
			request: mockRequest(validBody),
		} as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
	});

	it('returns 410 when form already submitted', async () => {
		mockRpc.mockResolvedValueOnce({
			data: null,
			error: { message: 'FORM_ALREADY_SUBMITTED' },
		});

		const res = await POST({
			params: mockParams(TOKEN),
			request: mockRequest(validBody),
		} as any);
		expect(res.status).toBe(410);
	});

	it('returns 404 when token not found', async () => {
		mockRpc.mockResolvedValueOnce({
			data: null,
			error: { message: 'FORM_NOT_FOUND' },
		});

		const res = await POST({
			params: mockParams(TOKEN),
			request: mockRequest(validBody),
		} as any);
		expect(res.status).toBe(404);
	});

	it('returns 500 on unexpected RPC error', async () => {
		mockRpc.mockResolvedValueOnce({
			data: null,
			error: { message: 'connection reset' },
		});

		const res = await POST({
			params: mockParams(TOKEN),
			request: mockRequest(validBody),
		} as any);
		expect(res.status).toBe(500);
	});

	it('returns 500 when RPC throws (network error)', async () => {
		mockRpc.mockRejectedValueOnce(new Error('Network down'));

		const res = await POST({
			params: mockParams(TOKEN),
			request: mockRequest(validBody),
		} as any);
		expect(res.status).toBe(500);
	});

	it('returns 404 when RPC returns null data without error', async () => {
		mockRpc.mockResolvedValueOnce({ data: null, error: null });

		const res = await POST({
			params: mockParams(TOKEN),
			request: mockRequest(validBody),
		} as any);
		expect(res.status).toBe(404);
	});
});
