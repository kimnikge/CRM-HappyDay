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
	service_rounds?: number | string | null;
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
	reminder_days?: number | null;
	cancel_reason?: string | null;
	statuses?: { name: string } | null;
	profiles?: { full_name?: string | null } | null;
}

// ---- Cyrillic font loading (Golos Text, лежит в static/fonts) ----
// Шрифт self-contained: отдаётся с нашего же origin, без внешних CDN.
const FONT_NAME = "GolosText";
const FONT_FILE = "GolosText.ttf";
const FONT_URL = "/fonts/GolosText-Regular.ttf";

/** Кэш base64 одного и того же файла: сеть дёргаем максимум один раз. */
let fontBase64Promise: Promise<string | null> | null = null;

/** Проверяем, что это настоящий TrueType (а не HTML-заглушка dev-сервера). */
function isTrueTypeFile(buf: ArrayBuffer): boolean {
	if (buf.byteLength < 12) return false;
	const magic = new DataView(buf).getUint32(0);
	// 0x00010000 — TrueType, "true" — Apple TrueType, "OTTO" — CFF/OpenType (jsPDF его не осилит).
	return magic === 0x00010000 || magic === 0x74727565;
}

/** ArrayBuffer → base64 кусками по 8 КБ, без spread (иначе переполняется стек). */
function arrayBufferToBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	const CHUNK = 0x2000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

function loadFontBase64(): Promise<string | null> {
	// В SSR/тестах (Node.js) нет same-origin статики — сразу деградируем до Helvetica.
	if (typeof window === "undefined") return Promise.resolve(null);
	if (!fontBase64Promise) {
		fontBase64Promise = (async () => {
			try {
				const resp = await fetch(FONT_URL, { cache: "force-cache" });
				if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
				const buf = await resp.arrayBuffer();
				if (!isTrueTypeFile(buf)) throw new Error("файл не является TrueType-шрифтом");
				return arrayBufferToBase64(buf);
			} catch (e) {
				console.warn("[PDF] Шрифт Golos Text недоступен, используется Helvetica:", e);
				return null;
			}
		})();
	}
	return fontBase64Promise;
}

/**
 * Регистрирует шрифт в конкретном документе jsPDF.
 * addFileToVFS/addFont нужны каждому новому документу, поэтому кэшируем только байты,
 * а регистрацию делаем всегда перед первым setFont.
 * @returns true, если шрифт подключён и можно звать setFont(FONT_NAME).
 */
async function ensureCyrillicFont(doc: jsPDF): Promise<boolean> {
	const base64 = await loadFontBase64();
	if (!base64) return false;
	try {
		doc.addFileToVFS(FONT_FILE, base64);
		doc.addFont(FONT_FILE, FONT_NAME, "normal");
		return true;
	} catch (e) {
		console.warn("[PDF] Не удалось подключить Golos Text, используется Helvetica:", e);
		return false;
	}
}

export async function generateOrderPDF(order: OrderData): Promise<Blob> {
	const doc = new jsPDF({ unit: "mm", format: "a4" });
	// Шрифт подключаем ДО первого setFont/text. Не вышло — остаёмся на встроенном Helvetica.
	const fontName = (await ensureCyrillicFont(doc)) ? FONT_NAME : "helvetica";

	const M = 10; // margin
	const W = 210 - M * 2; // usable width
	let y = 15;

	// ---- Header ----
	doc.setFont(fontName, "normal");
	doc.setFontSize(14);
	doc.text(`Заказ №${order.order_number}`, M, y);
	y += 6.5;

	doc.setFont(fontName, "normal");
	doc.setFontSize(8);
	doc.setTextColor(100);
	doc.text(`Статус: ${order.statuses?.name || "—"}`, M, y);
	y += 3.5;
	doc.text(`Менеджер: ${order.profiles?.full_name || "—"}`, M, y);
	y += 3.5;
	doc.text(
		`Дата мероприятия: ${order.event_date ? fmtDate(order.event_date) : "—"}${order.start_time ? ` в ${order.start_time.slice(0, 5)}` : ""}`,
		M,
		y,
	);
	y += 3.5;
	y += 2;

	// ---- Divider ----
	doc.setDrawColor(220);
	doc.line(M, y, M + W, y);
	y += 3;

	// ---- Client Info ----
	y = section(doc, fontName, "Клиент и контакты", M, y, W, [
		["Компания", order.company_name],
		["Контактное лицо", order.contact_person],
		["Телефон", order.phone],
		["Email", order.email],
	]);

	// ---- Core Params ----
	y = section(doc, fontName, "Основные параметры", M, y, W, [
		["Дата мероприятия", order.event_date ? fmtDate(order.event_date) : null],
		["Дата согласования", order.approval_date ? fmtDate(order.approval_date) : null],
		["Формат", order.format],
		["Тема", order.theme],
		["Гостей", order.guest_count != null ? String(order.guest_count) : null],
		[
			"Подходов к столу",
			order.service_rounds != null && order.service_rounds !== ""
				? String(order.service_rounds)
				: null,
		],
	]);

	// ---- Time ----
	y = section(doc, fontName, "Время", M, y, W, [
		["Начало", order.start_time?.slice(0, 5)],
		["Окончание", order.end_time?.slice(0, 5)],
		["Прибытие официантов", order.waiter_arrival?.slice(0, 5)],
		["Завоз оборудования", order.equipment_delivery],
	]);

	// ---- Location ----
	y = section(doc, fontName, "Локация", M, y, W, [
		["Адрес", order.address],
		["Пропускная система", order.access_system],
		["Этаж", order.floor],
		["Карта заезда", order.entry_map],
		["Электричество", order.electricity],
	]);

	// ---- Equipment / Tables ----
	y = section(doc, fontName, "Оборудование", M, y, W, [
		["Столы", order.tables_info ? formatTablesInfo(order.tables_info) : null],
		["Подсобное помещение", order.utility_room],
		["Баннер", order.banner],
	]);

	// ---- Menu / Catering ----
	y = section(doc, fontName, "Меню и кейтеринг", M, y, W, [
		["Уровень мероприятия", order.event_level],
		["Алкоголь", order.alcohol],
		["Вода", order.water],
		["Соки", order.juices],
		["Кофе", order.coffee],
		["Горячее", order.hot_dishes],
		["Посуда", order.dishware],
	]);

	// ---- Extra & Comments ----
	y = section(doc, fontName, "Дополнительно", M, y, W, [
		["Требования", order.extra_requirements],
		["Комментарий по меню", order.menu_comment],
	]);

	// ---- Financial ----
	y += 1;
	if (y > 240) { doc.addPage(); y = 10; }
	doc.setDrawColor(220);
	doc.line(M, y, M + W, y);
	y += 3;
	y = section(doc, fontName, "Финансы", M, y, W, [
		["Общая стоимость", order.total_cost != null ? `${order.total_cost.toLocaleString("ru-RU")} ₸` : null],
		["Статус оплаты", order.payment_status],
		["Напомнить за N дней", order.reminder_days != null ? String(order.reminder_days) : null],
	]);

	// ---- Cancel reason (always shown) ----
	y += 2;
	if (y > 250) { doc.addPage(); y = 10; }
	doc.setTextColor(order.cancel_reason ? 200 : 120, order.cancel_reason ? 50 : 120, order.cancel_reason ? 50 : 120);
	doc.setFont(fontName, "normal");
	doc.setFontSize(8);
	doc.text("Причина отмены:", M, y);
	y += 3;
	doc.setFont(fontName, "normal");
	doc.text(order.cancel_reason || "—", M, y);

	return doc.output("blob");
}

/** Рисует секцию: заголовок + поля в две колонки */
function section(
	doc: jsPDF,
	fontName: string,
	title: string,
	x: number,
	y: number,
	width: number,
	fields: [string, string | undefined | null][],
): number {
	y += 2.5;
	if (y > 238) { doc.addPage(); y = 10; }
	
	// ---- Background for title ----
	doc.setFillColor(240, 240, 240);
	doc.rect(x - 1, y - 2.5, width + 2, 4, "F");
	
	doc.setFont(fontName, "normal");
	doc.setFontSize(9);
	doc.setTextColor(30);
	doc.text(title, x, y);
	y += 4.5;
	
	doc.setFont(fontName, "normal");
	doc.setFontSize(9);
	doc.setTextColor(50);
	const resultY = drawFields(doc, fontName, fields, x, y, width);
	
	// ---- Divider after section ----
	doc.setDrawColor(210);
	doc.line(x - 1, resultY, x + width + 1, resultY);
	
	return resultY + 2;
}

/** Рисует поля label: value в две колонки. Пустые значения → "—" */
function drawFields(
	doc: jsPDF,
	fontName: string,
	fields: [string, string | undefined | null][],
	x: number,
	y: number,
	width: number,
): number {
	if (fields.length === 0) return y;

	const halfW = (width - 8) / 2;
	let maxY = y;

	for (let i = 0; i < fields.length; i += 2) {
		if (y > 242) {
			doc.addPage();
			y = 10;
		}

		const [label1, raw1] = fields[i];
		const val1 = rawValue(raw1);
		doc.setFont(fontName, "normal");
		doc.setFontSize(8);
		doc.setTextColor(130);
		doc.text(label1, x, y);
		doc.setFont(fontName, "normal");
		doc.setFontSize(9);
		doc.setTextColor(val1 === "—" ? 170 : 40);
		doc.text(val1, x, y + 3.5);

		if (fields[i + 1]) {
			const [label2, raw2] = fields[i + 1];
			const val2 = rawValue(raw2);
			const x2 = x + halfW + 8;
			doc.setFont(fontName, "normal");
			doc.setFontSize(8);
			doc.setTextColor(130);
			doc.text(label2, x2, y);
			doc.setFont(fontName, "normal");
			doc.setFontSize(9);
			doc.setTextColor(val2 === "—" ? 170 : 40);
			doc.text(val2, x2, y + 3.5);
		}

		y += 6;
		maxY = y;
	}

	return maxY + 1.5;
}

function rawValue(v: string | undefined | null): string {
	if (v == null || v === "") return "—";
	return v;
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
