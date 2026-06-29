import { jsPDF } from "jspdf";

/**
 * Генерирует компактный PDF с данными заказа.
 * Возвращает Blob для загрузки/отправки.
 */

interface OrderData {
	order_number: number;
	company_name: string;
	contact_person?: string | null;
	phone?: string | null;
	email?: string | null;
	event_date?: string | null;
	approval_date?: string | null;
	format?: string | null;
	theme?: string | null;
	guest_count?: number | null;
	service_rounds?: string | null;
	start_time?: string | null;
	end_time?: string | null;
	waiter_arrival?: string | null;
	equipment_delivery?: string | null;
	address?: string | null;
	access_system?: string | null;
	floor?: string | null;
	entry_map?: string | null;
	electricity?: string | null;
	tables_info?: string | null;
	utility_room?: string | null;
	banner?: string | null;
	event_level?: string | null;
	alcohol?: string | null;
	water?: string | null;
	juices?: string | null;
	coffee?: string | null;
	hot_dishes?: string | null;
	dishware?: string | null;
	extra_requirements?: string | null;
	menu_comment?: string | null;
	total_cost?: number | null;
	payment_status?: string | null;
	prepayment?: number | null;
	reminder_days?: number | null;
	cancel_reason?: string | null;
	statuses?: { name: string } | null;
	profiles?: { full_name?: string | null } | null;
}

export function generateOrderPDF(order: OrderData): Blob {
	const doc = new jsPDF({ unit: "mm", format: "a4" });
	const M = 15; // margin
	const W = 210 - M * 2; // usable width
	let y = 20;

	// ---- Header ----
	doc.setFont("helvetica", "bold");
	doc.setFontSize(16);
	doc.text(`Заказ №${order.order_number}`, M, y);
	y += 8;

	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.setTextColor(100);
	if (order.statuses?.name) {
		doc.text(`Статус: ${order.statuses.name}`, M, y);
		y += 5;
	}
	if (order.profiles?.full_name) {
		doc.text(`Менеджер: ${order.profiles.full_name}`, M, y);
		y += 5;
	}
	if (order.event_date) {
		doc.text(
			`Дата мероприятия: ${fmtDate(order.event_date)}${order.start_time ? ` в ${order.start_time.slice(0, 5)}` : ""}`,
			M,
			y,
		);
		y += 5;
	}
	y += 3;

	// ---- Divider ----
	doc.setDrawColor(220);
	doc.line(M, y, M + W, y);
	y += 5;

	// ---- Client Info ----
	doc.setFont("helvetica", "bold");
	doc.setFontSize(12);
	doc.setTextColor(30);
	doc.text("Клиент и контакты", M, y);
	y += 7;

	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.setTextColor(50);
	const clientFields: [string, string | undefined | null][] = [
		["Компания", order.company_name],
		["Контактное лицо", order.contact_person],
		["Телефон", order.phone],
		["Email", order.email],
	];
	y = drawFields(doc, clientFields, M, y, W);

	y += 2;

	// ---- Core Params ----
	doc.setFont("helvetica", "bold");
	doc.setFontSize(12);
	doc.setTextColor(30);
	doc.text("Основные параметры", M, y);
	y += 7;

	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.setTextColor(50);
	const coreFields: [string, string | undefined | null][] = [
		["Дата мероприятия", order.event_date ? fmtDate(order.event_date) : null],
		["Дата согласования", order.approval_date ? fmtDate(order.approval_date) : null],
		["Формат", order.format],
		["Тема", order.theme],
		["Гостей", order.guest_count != null ? String(order.guest_count) : null],
		["Подходов к столу", order.service_rounds],
	];
	y = drawFields(doc, coreFields, M, y, W);

	// Time
	if (order.start_time || order.end_time || order.waiter_arrival) {
		y += 2;
		doc.setFont("helvetica", "bold");
		doc.setFontSize(10);
		doc.setTextColor(30);
		doc.text("Время", M, y);
		y += 6;
		doc.setFont("helvetica", "normal");
		doc.setFontSize(10);
		doc.setTextColor(50);
		const timeFields: [string, string | undefined | null][] = [
			["Начало", order.start_time?.slice(0, 5)],
			["Окончание", order.end_time?.slice(0, 5)],
			["Прибытие официантов", order.waiter_arrival?.slice(0, 5)],
			["Завоз оборудования", order.equipment_delivery],
		];
		y = drawFields(doc, timeFields, M, y, W);
	}

	// Location
	if (order.address || order.floor || order.access_system) {
		y += 2;
		if (y > 240) { doc.addPage(); y = 20; }
		doc.setFont("helvetica", "bold");
		doc.setFontSize(10);
		doc.setTextColor(30);
		doc.text("Локация", M, y);
		y += 6;
		doc.setFont("helvetica", "normal");
		doc.setFontSize(10);
		doc.setTextColor(50);
		const locFields: [string, string | undefined | null][] = [
			["Адрес", order.address],
			["Пропускная система", order.access_system],
			["Этаж", order.floor],
			["Карта заезда", order.entry_map],
			["Электричество", order.electricity],
		];
		y = drawFields(doc, locFields, M, y, W);
	}

	// Equipment / Tables
	if (order.tables_info || order.utility_room || order.banner) {
		y += 2;
		if (y > 240) { doc.addPage(); y = 20; }
		doc.setFont("helvetica", "bold");
		doc.setFontSize(10);
		doc.setTextColor(30);
		doc.text("Оборудование", M, y);
		y += 6;
		doc.setFont("helvetica", "normal");
		doc.setFontSize(10);
		doc.setTextColor(50);
		const eqFields: [string, string | undefined | null][] = [
			["Столы", order.tables_info ? formatTablesInfo(order.tables_info) : null],
			["Подсобное помещение", order.utility_room],
			["Баннер", order.banner],
		];
		y = drawFields(doc, eqFields, M, y, W);
	}

	// Menu / Catering
	if (order.event_level || order.alcohol || order.water || order.coffee || order.hot_dishes || order.dishware) {
		y += 2;
		if (y > 240) { doc.addPage(); y = 20; }
		doc.setFont("helvetica", "bold");
		doc.setFontSize(10);
		doc.setTextColor(30);
		doc.text("Меню и кейтеринг", M, y);
		y += 6;
		doc.setFont("helvetica", "normal");
		doc.setFontSize(10);
		doc.setTextColor(50);
		const menuFields: [string, string | undefined | null][] = [
			["Уровень мероприятия", order.event_level],
			["Алкоголь", order.alcohol],
			["Вода", order.water],
			["Соки", order.juices],
			["Кофе", order.coffee],
			["Горячее", order.hot_dishes],
			["Посуда", order.dishware],
		];
		y = drawFields(doc, menuFields, M, y, W);
	}

	// Extra & Comments
	const extra = order.extra_requirements || order.menu_comment;
	if (extra) {
		y += 2;
		if (y > 250) { doc.addPage(); y = 20; }
		doc.setFont("helvetica", "bold");
		doc.setFontSize(10);
		doc.setTextColor(30);
		doc.text("Дополнительно", M, y);
		y += 6;
		doc.setFont("helvetica", "normal");
		doc.setFontSize(10);
		doc.setTextColor(50);
		if (order.extra_requirements) {
			doc.text(`Требования: ${order.extra_requirements}`, M, y);
			y += 5;
		}
		if (order.menu_comment) {
			doc.text(`Комментарий по меню: ${order.menu_comment}`, M, y);
			y += 5;
		}
	}

	// ---- Financial ----
	y += 3;
	if (y > 250) { doc.addPage(); y = 20; }
	doc.setDrawColor(220);
	doc.line(M, y, M + W, y);
	y += 5;
	doc.setFont("helvetica", "bold");
	doc.setFontSize(12);
	doc.setTextColor(30);
	doc.text("Финансы", M, y);
	y += 7;
	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.setTextColor(50);
	const finFields: [string, string | undefined | null][] = [
		["Общая стоимость", order.total_cost != null ? `${order.total_cost.toLocaleString("ru-RU")} ₸` : null],
		["Статус оплаты", order.payment_status],
		["Предоплата", order.prepayment != null ? `${order.prepayment.toLocaleString("ru-RU")} ₸` : null],
		["Напомнить за N дней", order.reminder_days != null ? String(order.reminder_days) : null],
	];
	y = drawFields(doc, finFields, M, y, W);

	// ---- Cancel reason ----
	if (order.cancel_reason) {
		y += 3;
		doc.setTextColor(200, 50, 50);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(10);
		doc.text("Причина отмены:", M, y);
		y += 5;
		doc.setFont("helvetica", "normal");
		doc.text(order.cancel_reason, M, y);
	}

	return doc.output("blob");
}

/** Рисует поля label: value в две колонки если влезает */
function drawFields(
	doc: jsPDF,
	fields: [string, string | undefined | null][],
	x: number,
	y: number,
	width: number,
): number {
	const filled = fields.filter(([, v]) => v != null && v !== "");
	if (filled.length === 0) return y;

	const halfW = (width - 8) / 2;
	let maxY = y;

	for (let i = 0; i < filled.length; i += 2) {
		if (y > 265) {
			doc.addPage();
			y = 20;
		}

		const [label1, val1] = filled[i];
		doc.setFont("helvetica", "bold");
		doc.setFontSize(8);
		doc.setTextColor(120);
		doc.text(label1, x, y);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(10);
		doc.setTextColor(50);
		doc.text(val1!, x, y + 4);

		if (filled[i + 1]) {
			const [label2, val2] = filled[i + 1];
			const x2 = x + halfW + 8;
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8);
			doc.setTextColor(120);
			doc.text(label2, x2, y);
			doc.setFont("helvetica", "normal");
			doc.setFontSize(10);
			doc.setTextColor(50);
			doc.text(val2!, x2, y + 4);
		}

		y += 7;
		maxY = y;
	}

	return maxY + 3;
}

function fmtDate(d: string): string {
	try {
		return new Date(d).toLocaleDateString("ru-RU", {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
	} catch {
		return d;
	}
}

function formatTablesInfo(json: string): string {
	try {
		const t = JSON.parse(json);
		const parts: string[] = [];
		if (t.c != null) parts.push(`коктейльных: ${t.c}`);
		if (t.f != null) parts.push(`фуршетных: ${t.f}`);
		if (t.x) parts.push(`доп: ${t.x}`);
		return parts.join(", ") || json;
	} catch {
		return json;
	}
}
