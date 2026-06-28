/**
 * Tests for publicFormSchema validation.
 *
 * The public form has 4 required fields:
 *   event_date, start_time, address, guest_count
 * All other fields are optional.
 */
import { describe, it, expect } from 'vitest';
import { publicFormSchema } from '$lib/schemas';

// ---- Helpers ----
function validBody(overrides: Record<string, unknown> = {}) {
	return {
		event_date: '2026-07-01',
		start_time: '14:00',
		address: 'ул. Тверская, 1',
		guest_count: 50,
		...overrides,
	};
}

// ---- Tests ----
describe('publicFormSchema', () => {
	// --- Success cases ---
	it('accepts a fully valid submission with all fields', () => {
		const body = validBody({
			format: 'банкет',
			theme: 'Конференция',
			service_rounds: 2,
			approval_date: '2026-06-25',
			end_time: '18:00',
			waiter_arrival: '12:00',
			equipment_delivery: 'до обеда',
			tables_ready: '13:00',
			access_system: 'пропуска',
			floor: '3',
			entry_map: 'центральный вход',
			electricity: '220V',
			tables_info: 'круглые',
			utility_room: 'есть',
			banner: 'нужен',
			event_level: 'Бизнес',
			menu_comment: 'без орехов',
			alcohol: 'вино',
			water: 'бутилированная',
			juices: 'апельсиновый',
			coffee: 'зерновой',
			hot_dishes: 'да',
			dishware: 'фарфор',
			extra_requirements: 'доп. стулья',
		});
		const result = publicFormSchema.safeParse(body);
		expect(result.success).toBe(true);
	});

	it('accepts minimal valid submission (only required fields)', () => {
		const result = publicFormSchema.safeParse(validBody());
		expect(result.success).toBe(true);
	});

	// --- Required field failures ---
	it('rejects missing event_date', () => {
		const { event_date: _, ...rest } = validBody();
		const result = publicFormSchema.safeParse(rest);
		expect(result.success).toBe(false);
		if (!result.success) {
			const msgs = result.error.issues.map(i => i.path.join('.'));
			expect(msgs).toContain('event_date');
		}
	});

	it('rejects empty event_date', () => {
		const result = publicFormSchema.safeParse(validBody({ event_date: '' }));
		expect(result.success).toBe(false);
	});

	it('rejects missing start_time', () => {
		const { start_time: _, ...rest } = validBody();
		const result = publicFormSchema.safeParse(rest);
		expect(result.success).toBe(false);
		if (!result.success) {
			const msgs = result.error.issues.map(i => i.path.join('.'));
			expect(msgs).toContain('start_time');
		}
	});

	it('rejects missing address', () => {
		const { address: _, ...rest } = validBody();
		const result = publicFormSchema.safeParse(rest);
		expect(result.success).toBe(false);
		if (!result.success) {
			const msgs = result.error.issues.map(i => i.path.join('.'));
			expect(msgs).toContain('address');
		}
	});

	it('rejects missing guest_count', () => {
		const { guest_count: _, ...rest } = validBody();
		const result = publicFormSchema.safeParse(rest);
		expect(result.success).toBe(false);
	});

	// --- guest_count edge cases ---
	it('rejects guest_count = 0', () => {
		const result = publicFormSchema.safeParse(validBody({ guest_count: 0 }));
		expect(result.success).toBe(false);
	});

	it('rejects negative guest_count', () => {
		const result = publicFormSchema.safeParse(validBody({ guest_count: -5 }));
		expect(result.success).toBe(false);
	});

	it('rejects non-integer guest_count', () => {
		const result = publicFormSchema.safeParse(validBody({ guest_count: 3.5 }));
		expect(result.success).toBe(false);
	});

	// --- Optional numeric fields ---
	it('accepts null/undefined for optional numeric fields', () => {
		const body = validBody({ service_rounds: undefined });
		const result = publicFormSchema.safeParse(body);
		expect(result.success).toBe(true);
	});

	it('rejects negative service_rounds', () => {
		const result = publicFormSchema.safeParse(validBody({ service_rounds: -1 }));
		expect(result.success).toBe(false);
	});

	// --- Stripping unknown fields ---
	it('strips unknown fields not in schema', () => {
		const body = validBody({ hacker: 'malicious', xss: '<script>' });
		const result = publicFormSchema.safeParse(body);
		expect(result.success).toBe(true);
		if (result.success) {
			expect((result.data as Record<string, unknown>).hacker).toBeUndefined();
			expect((result.data as Record<string, unknown>).xss).toBeUndefined();
		}
	});
});
