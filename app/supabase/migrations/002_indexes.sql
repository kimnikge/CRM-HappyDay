-- ============================================================
-- CATERING CRM — Performance Indexes
-- Migration 002: Add indexes for critical query paths
-- ============================================================

-- 1. orders.status_id — used in EVERY kanban query (filter + group)
CREATE INDEX IF NOT EXISTS idx_orders_status_id ON public.orders(status_id);

-- 2. orders.event_date — used in date filter + urgency check
CREATE INDEX IF NOT EXISTS idx_orders_event_date ON public.orders(event_date);

-- 3. orders.company_name — used in search (ILIKE)
-- GIN trgm index for fuzzy text search performance
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_orders_company_name_trgm ON public.orders USING gin (company_name gin_trgm_ops);

-- 4. orders.contact_person — used in search (ILIKE)
CREATE INDEX IF NOT EXISTS idx_orders_contact_person_trgm ON public.orders USING gin (contact_person gin_trgm_ops);

-- 5. orders.form_token — used in public form lookup (UNIQUE + index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_form_token ON public.orders(form_token) WHERE form_token IS NOT NULL;

-- 6. orders.created_at — used in default sort
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- 7. orders.manager_id — used in JOIN with profiles
CREATE INDEX IF NOT EXISTS idx_orders_manager_id ON public.orders(manager_id);

-- 8. orders.client_id — used in JOIN with clients
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders(client_id);

-- 9. files.order_id — used in file listing per order
CREATE INDEX IF NOT EXISTS idx_files_order_id ON public.files(order_id);

-- 10. status_history.order_id — used in history view
CREATE INDEX IF NOT EXISTS idx_status_history_order_id ON public.status_history(order_id);

-- 11. clients.name — used in client list sort
CREATE INDEX IF NOT EXISTS idx_clients_name ON public.clients(name);

-- ============================================================
-- Add CHECK constraint: guest_count must be positive
-- ============================================================
ALTER TABLE public.orders ADD CONSTRAINT chk_guest_count_positive
  CHECK (guest_count IS NULL OR guest_count > 0) NOT VALID;
-- NOT VALID: skip existing rows, enforce for new inserts/updates
