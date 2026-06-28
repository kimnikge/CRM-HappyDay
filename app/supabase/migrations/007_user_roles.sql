-- ============================================================
-- 007_user_roles.sql
-- Add role-based access: admin (full access) / pending (awaiting approval)
-- New registrations default to 'pending' until an admin approves them.
-- ============================================================

-- 1. Add role column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'pending';

-- 2. Update existing profiles to admin (backfill)
UPDATE public.profiles SET role = 'admin' WHERE role = 'pending';

-- 3. Update trigger: new users get 'pending' role by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, initials, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    public.compute_initials(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)),
    'pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
