-- ============================================================
-- 006_new_order_fields.sql
-- G13, G17, G24: Add is_important, reminder_days, internal_notes
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reminder_days INTEGER;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS internal_notes TEXT;
