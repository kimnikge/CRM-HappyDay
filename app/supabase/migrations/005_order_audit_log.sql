-- ============================================================
-- 005_order_audit_log.sql
-- G15: Field-level change history for orders.
-- Tracks who changed what field, from what to what, and when.
-- ============================================================

-- Audit log table
CREATE TABLE IF NOT EXISTS public.order_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  field_name  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_by  UUID REFERENCES public.profiles(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying audit by order
CREATE INDEX IF NOT EXISTS idx_order_audit_log_order_id ON public.order_audit_log(order_id);

-- Trigger function: log changed fields
CREATE OR REPLACE FUNCTION public.log_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  col_name TEXT;
  old_val TEXT;
  new_val TEXT;
BEGIN
  -- Get current user ID from Supabase auth context
  v_user_id := auth.uid();

  -- Compare each text/numeric/timestamp field
  FOR col_name IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'orders' AND table_schema = 'public'
      AND data_type IN ('text', 'integer', 'bigint', 'numeric', 'boolean', 'date', 'time without time zone', 'timestamp with time zone', 'uuid')
      AND column_name NOT IN ('id', 'created_at', 'updated_at', 'form_token')
  LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col_name, col_name)
    INTO old_val, new_val
    USING OLD, NEW;

    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO public.order_audit_log (order_id, field_name, old_value, new_value, changed_by)
      VALUES (NEW.id, col_name, old_val, new_val, v_user_id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_order_audit ON public.orders;
CREATE TRIGGER trg_order_audit
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_changes();
