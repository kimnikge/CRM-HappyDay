-- ============================================================
-- CATERING CRM MVP — Database Schema
-- Supabase PostgreSQL
-- ============================================================

-- 1. PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  phone      TEXT,
  initials   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compute initials from full_name
CREATE OR REPLACE FUNCTION public.compute_initials(full_name TEXT)
RETURNS TEXT AS $$
DECLARE
  words TEXT[];
  result TEXT := '';
  i INTEGER;
BEGIN
  words := regexp_split_to_array(trim(full_name), '\s+');
  FOR i IN 1..array_length(words, 1) LOOP
    IF words[i] != '' AND length(result) < 2 THEN
      result := result || upper(left(words[i], 1));
    END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, initials)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    public.compute_initials(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. STATUSES (fixed set, 7 statuses)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.statuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  order_index INTEGER NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed fixed statuses (idempotent: skip if already seeded)
INSERT INTO public.statuses (name, order_index) VALUES
  ('Черновик',         0),
  ('На согласовании',  1),
  ('Подтверждён',      2),
  ('В работе',         3),
  ('Выезд',            4),
  ('Завершён',         5),
  ('Отменён',          6)
ON CONFLICT (name) DO NOTHING;

-- 3. CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);

-- 4. ORDERS (central table, 28 form fields + system fields)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number        INTEGER GENERATED ALWAYS AS IDENTITY,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  manager_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status_id           UUID REFERENCES public.statuses(id) ON DELETE SET NULL,

  -- Client & contacts
  company_name        TEXT NOT NULL,
  contact_person      TEXT,
  phone               TEXT,
  email               TEXT,

  -- Core parameters
  event_date          DATE,
  approval_date       DATE,
  format              TEXT,
  theme               TEXT,
  guest_count         INTEGER,
  service_rounds      INTEGER,

  -- Time
  start_time          TIME,
  end_time            TIME,
  waiter_arrival      TIME,
  equipment_delivery  TEXT,
  tables_ready        TIME,

  -- Location
  address             TEXT,
  access_system       TEXT,
  floor               TEXT,
  entry_map           TEXT,
  electricity         TEXT,

  -- Equipment
  tables_info         TEXT,
  utility_room        TEXT,
  banner              TEXT,

  -- Event level
  event_level         TEXT,

  -- Menu
  menu_file_path      TEXT,
  menu_comment        TEXT,

  -- Beverages
  alcohol             TEXT,
  water               TEXT,
  juices              TEXT,
  coffee              TEXT,

  -- Other
  hot_dishes          TEXT,
  dishware            TEXT,
  extra_requirements  TEXT,

  -- Finance
  total_cost          DECIMAL(12,2),
  payment_status      TEXT,

  -- Cancellation
  cancel_reason       TEXT,

  -- Public form
  form_token          UUID DEFAULT gen_random_uuid(),
  form_submitted      BOOLEAN NOT NULL DEFAULT false,

  -- Meta
  source              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. FILES (attachments)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   INTEGER,
  mime_type   TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. STATUS HISTORY (audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  old_status_id UUID REFERENCES public.statuses(id),
  new_status_id UUID NOT NULL REFERENCES public.statuses(id),
  changed_by    UUID REFERENCES public.profiles(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  comment       TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY (all authenticated = full access)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;

-- All authenticated users have full access (single role = manager)
-- Wrapped in DO blocks for idempotency (skip if policy already exists)
DO $$ BEGIN CREATE POLICY "Authenticated full access" ON public.profiles     FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated full access" ON public.statuses     FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated full access" ON public.clients      FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated full access" ON public.orders       FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated full access" ON public.files        FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated full access" ON public.status_history FOR ALL TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Public (unauthenticated) can read statuses (for form rendering)
DO $$ BEGIN CREATE POLICY "Public read statuses" ON public.statuses FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Note: buckets must be created via Supabase Dashboard or SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('order-files', 'order-files', false);

-- Storage RLS: authenticated users can manage files in order-files bucket
CREATE POLICY "Authenticated manage files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'order-files')
  WITH CHECK (bucket_id = 'order-files');
