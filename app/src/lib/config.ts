// ============================================================
// Catering CRM — Centralized Configuration
// Single source of truth for all business constants.
// ============================================================

// ---- Formats ----
export const FORMATS = [
	{ value: 'банкет',     label: 'Банкет' },
	{ value: 'фуршет',    label: 'Фуршет' },
	{ value: 'кофе-брейк', label: 'Кофе-брейк' },
	{ value: 'коктейль',  label: 'Коктейль' },
	{ value: 'буфет',     label: 'Буфет' },
] as const;

export type CateringFormat = (typeof FORMATS)[number]['value'];

// ---- Format colors (for badges) ----
export const FORMAT_COLORS: Record<CateringFormat, string> = {
	банкет:     'bg-purple-100 text-purple-700',
	фуршет:    'bg-blue-100 text-blue-700',
	'кофе-брейк': 'bg-amber-100 text-amber-700',
	коктейль:  'bg-pink-100 text-pink-700',
	буфет:     'bg-green-100 text-green-700',
};

export const DEFAULT_FORMAT_COLOR = 'bg-gray-100 text-gray-600';

// ---- Event levels ----
export const EVENT_LEVELS = [
	{ value: '',        label: '—' },
	{ value: 'СГО',     label: 'СГО' },
	{ value: 'Бизнес',  label: 'Бизнес' },
	{ value: 'Частное', label: 'Частное' },
] as const;

export type EventLevel = (typeof EVENT_LEVELS)[number]['value'];

// ---- Water types ----
export const WATER_TYPES = [
	{ value: '',              label: '—' },
	{ value: 'бутилированная', label: 'Бутилированная' },
	{ value: 'в графинах',    label: 'В графинах' },
] as const;

// ---- Coffee types ----
export const COFFEE_TYPES = [
	{ value: '',           label: '—' },
	{ value: 'растворимый', label: 'Растворимый' },
	{ value: 'зерновой',   label: 'Зерновой' },
] as const;

// ---- Dishware types ----
export const DISHWARE_TYPES = [
	{ value: '',                       label: '—' },
	{ value: 'керамика',               label: 'Керамика' },
	{ value: 'одноразовая',            label: 'Одноразовая' },
	{ value: 'керамика + одноразовая', label: 'Керамика + одноразовая' },
] as const;

// ---- Yes/No options ----
export const YES_NO_OPTIONS = [
	{ value: '',  label: '—' },
	{ value: 'да',  label: 'Да' },
	{ value: 'нет', label: 'Нет' },
] as const;

// ---- Status names (fixed set) ----
export const STATUS_NAMES = [
	'Черновик',
	'На согласовании',
	'Подтверждён',
	'В работе',
	'Выезд',
	'Завершён',
	'Отменён',
] as const;

export type StatusName = (typeof STATUS_NAMES)[number];

// ---- File upload ----
export const ALLOWED_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ---- Polling ----
export const POLLING_INTERVAL_MS = 5000;

// ---- Currency formatting ----
export const CURRENCY_LOCALE = 'kk-KZ';
export const CURRENCY_SUFFIX = ' ₸';
