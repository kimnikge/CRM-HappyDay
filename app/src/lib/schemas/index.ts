import { z } from 'zod';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '$lib/config';

// ============================================================
// Shared Zod schemas — single source of truth (client + server)
//
// Architecture: compose via .pick()/.extend()/.merge().
// Each schema builds on a base; no field is defined twice.
// ============================================================

// ---- Re-export file constants (backward compatible) ----
export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE };

// ---- Base field definitions (DRY building blocks) ----

const emailField = z.string().email('Некорректный email').optional().or(z.literal(''));

const optionalString = z.string().optional();
const optionalInt = z.number().int().positive().optional();

// ---- Client ----
export const createClientSchema = z.object({
  name:           z.string().min(1, 'Название обязательно'),
  contact_person: optionalString,
  phone:          optionalString,
  email:          emailField,
  notes:          optionalString,
});

export type CreateClient = z.infer<typeof createClientSchema>;

// ---- Order: core fields shared by create + update + public form ----
const orderCoreFields = {
  event_date:         z.string().optional(),
  format:             optionalString,
  theme:              optionalString,
  guest_count:        optionalInt,
  service_rounds:     optionalInt,
  approval_date:       z.string().optional(),
  start_time:          z.string().optional(),
  end_time:            z.string().optional(),
  waiter_arrival:      z.string().optional(),
  equipment_delivery:  optionalString,
  tables_ready:        z.string().optional(),
  address:             optionalString,
  access_system:       optionalString,
  floor:               optionalString,
  entry_map:           optionalString,
  electricity:         optionalString,
  tables_info:         optionalString,
  utility_room:        optionalString,
  banner:              optionalString,
  event_level:         optionalString,
  menu_comment:        optionalString,
  alcohol:             optionalString,
  water:               optionalString,
  juices:              optionalString,
  coffee:              optionalString,
  hot_dishes:          optionalString,
  dishware:            optionalString,
  extra_requirements:  optionalString,
};

// ---- Order (create) ----
export const createOrderSchema = z.object({
  client_id:      z.string().uuid(),
  company_name:   z.string().min(1, 'Название компании обязательно'),
  contact_person: optionalString,
  phone:          optionalString,
  email:          emailField,
  ...orderCoreFields,
});

export type CreateOrder = z.infer<typeof createOrderSchema>;

// ---- Order (full update) — all optional ----
export const updateOrderSchema = z.object({
  company_name:        z.string().min(1).optional(),
  contact_person:      optionalString,
  phone:               optionalString,
  email:               emailField.optional(),
  ...Object.fromEntries(
    Object.entries(orderCoreFields).map(([k, v]) => [k, v.optional()]),
  ),
  total_cost:          z.number().optional(),
  payment_status:      optionalString,
  is_important:        z.boolean().optional(),   // G13
  reminder_days:       z.number().int().positive().optional(), // G17
  internal_notes:      optionalString,           // G24
});

export type UpdateOrder = z.infer<typeof updateOrderSchema>;

// ---- Public form (client-facing) — required fields enforced ----
// NOTE: spread optional core fields FIRST, then override with required,
// otherwise required fields get clobbered by their optional counterparts.
const REQUIRED_FORM_FIELDS = ['event_date', 'start_time', 'address', 'guest_count'] as const;
const optionalFormFields = Object.fromEntries(
  Object.entries(orderCoreFields)
    .filter(([k]) => !(REQUIRED_FORM_FIELDS as readonly string[]).includes(k))
    .map(([k, v]) => [k, v.optional()]),
);

export const publicFormSchema = z.object({
  ...optionalFormFields,
  event_date:   z.string().min(1, 'Дата обязательна'),
  start_time:   z.string().min(1, 'Время начала обязательно'),
  address:      z.string().min(1, 'Адрес обязателен'),
  guest_count:  z.number().int().positive('Должно быть больше 0'),
});

export type PublicForm = z.infer<typeof publicFormSchema>;

// ---- Status change ----
export const changeStatusSchema = z.object({
  status_id: z.string().uuid('Неверный ID статуса'),
  comment:   optionalString,
});

export type ChangeStatus = z.infer<typeof changeStatusSchema>;

// ---- File upload validation (client-side) ----
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { valid: false, error: 'Недопустимый формат файла. Разрешены: JPEG, PNG, PDF, DOCX, XLSX' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Файл слишком большой. Максимум 10 МБ' };
  }
  return { valid: true };
}
