-- ============================================================
-- 008_fix_profile_fkeys.sql
-- Fix FK constraints referencing profiles so users can be deleted.
-- All references use ON DELETE SET NULL to preserve data integrity.
-- ============================================================

-- 1. Drop existing FKs referencing profiles
ALTER TABLE public.status_history DROP CONSTRAINT IF EXISTS status_history_changed_by_fkey;
ALTER TABLE public.orders         DROP CONSTRAINT IF EXISTS orders_manager_id_fkey;
ALTER TABLE public.clients        DROP CONSTRAINT IF EXISTS clients_created_by_fkey;
ALTER TABLE public.files          DROP CONSTRAINT IF EXISTS files_uploaded_by_fkey;
ALTER TABLE public.order_audit_log DROP CONSTRAINT IF EXISTS order_audit_log_changed_by_fkey;

-- 2. Recreate with ON DELETE SET NULL
ALTER TABLE public.status_history
  ADD CONSTRAINT status_history_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.files
  ADD CONSTRAINT files_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- order_audit_log may not exist yet (migration 005), skip if missing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_audit_log') THEN
    ALTER TABLE public.order_audit_log
      ADD CONSTRAINT order_audit_log_changed_by_fkey
      FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
