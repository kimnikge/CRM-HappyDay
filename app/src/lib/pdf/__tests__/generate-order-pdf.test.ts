/**
 * Tests for generateOrderPDF — PDF generation from order data.
 */
import { describe, it, expect } from "vitest";
import { generateOrderPDF } from "$lib/pdf/generate-order-pdf";

// ---- Helpers ----
function minimalOrder(overrides: Record<string, unknown> = {}) {
	return {
		order_number: 1,
		company_name: "ООО Тест",
		...overrides,
	};
}

function fullOrder(overrides: Record<string, unknown> = {}) {
	return {
		order_number: 42,
		company_name: "ИП Сидоров",
		contact_person: "Иван Иванов",
		phone: "+7 (999) 123-45-67",
		email: "test@example.com",
		event_date: "2026-07-15",
		approval_date: "2026-07-10",
		format: "банкет",
		theme: "День рождения",
		guest_count: 30,
		service_rounds: "2",
		start_time: "14:00:00",
		end_time: "18:00:00",
		waiter_arrival: "12:00:00",
		equipment_delivery: "утром",
		address: "ул. Пушкина, д. 10",
		access_system: "пропуска",
		floor: "3 этаж",
		entry_map: "центральный вход",
		electricity: "220V",
		tables_info: '{"c":5,"f":3,"x":"круглые"}',
		utility_room: "есть",
		banner: "нужен 2x3м",
		event_level: "Бизнес",
		alcohol: "вино красное",
		water: "бутилированная",
		juices: "апельсиновый",
		coffee: "зерновой",
		hot_dishes: "да",
		dishware: "фарфор",
		extra_requirements: "дополнительные стулья",
		menu_comment: "без орехов",
		total_cost: 150000,
		payment_status: "предоплата",
		prepayment: 50000,
		reminder_days: 3,
		statuses: { name: "Подтверждён" },
		profiles: { full_name: "Петров Петр" },
		...overrides,
	};
}

// ---- Tests ----
describe("generateOrderPDF", () => {
	it("returns a Blob", () => {
		const blob = generateOrderPDF(minimalOrder());
		expect(blob).toBeInstanceOf(Blob);
	});

	it("returns PDF mime type", () => {
		const blob = generateOrderPDF(minimalOrder());
		expect(blob.type).toBe("application/pdf");
	});

	it("generates non-empty PDF for minimal order", () => {
		const blob = generateOrderPDF(minimalOrder());
		expect(blob.size).toBeGreaterThan(1000); // at least 1KB
	});

	it("generates larger PDF for full order", () => {
		const minimal = generateOrderPDF(minimalOrder());
		const full = generateOrderPDF(fullOrder());
		expect(full.size).toBeGreaterThan(minimal.size);
	});

	it("handles empty/null optional fields gracefully", () => {
		const blob = generateOrderPDF(
			minimalOrder({
				contact_person: null,
				phone: null,
				email: "",
				event_date: null,
				format: null,
			}),
		);
		expect(blob).toBeInstanceOf(Blob);
		expect(blob.size).toBeGreaterThan(1000);
	});

	it("handles special characters in company name", () => {
		const blob = generateOrderPDF(
			minimalOrder({ company_name: 'ООО "Ромашка" & Партнёры' }),
		);
		expect(blob).toBeInstanceOf(Blob);
	});

	it("handles missing statuses and profiles", () => {
		const blob = generateOrderPDF(
			fullOrder({ statuses: null, profiles: null }),
		);
		expect(blob).toBeInstanceOf(Blob);
	});

	it("includes cancel_reason when present", () => {
		const withCancel = generateOrderPDF(
			fullOrder({ cancel_reason: "Клиент передумал" }),
		);
		const withoutCancel = generateOrderPDF(fullOrder());
		expect(withCancel.size).toBeGreaterThan(withoutCancel.size);
	});

	it("generates consistent PDFs (deterministic)", () => {
		const a = generateOrderPDF(fullOrder());
		const b = generateOrderPDF(fullOrder());
		expect(a.size).toBe(b.size);
	});

	it("handles tables_info as plain string (legacy)", () => {
		const blob = generateOrderPDF(
			fullOrder({ tables_info: "круглые столы, 5 шт" }),
		);
		expect(blob).toBeInstanceOf(Blob);
	});

	it("handles tables_info as JSON with only some fields", () => {
		const blob = generateOrderPDF(
			fullOrder({ tables_info: '{"c":3}' }),
		);
		expect(blob).toBeInstanceOf(Blob);
	});
});
