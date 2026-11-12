-- ============================================================
-- 011_profiles_self_select.sql
-- Побочный эффект 009: политика "Admins full access" на profiles
-- не даёт обычному пользователю прочитать СВОЮ строку. Клиентский
-- auth-стор (src/lib/stores/auth.svelte.ts) определяет роль запросом
-- profiles.role: без строки role = null, проверка "pending" не
-- срабатывает, и пользователь видит пустое приложение вместо
-- сообщения «ожидает подтверждения».
--
-- Что делаем: разрешаем authenticated читать ТОЛЬКО свою строку.
-- Роль при этом остаётся read-only на уровне политик (запись — только
-- админ), а смена role дополнительно закрыта триггером
-- prevent_role_escalation из 009.
--
-- Идемпотентна.
-- ============================================================

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;

CREATE POLICY "Users read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Проверка после применения:
--   SELECT policyname, cmd, roles, qual FROM pg_policies
--   WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname;
-- Ожидается две политики: "Admins full access" (ALL) и
-- "Users read own profile" (SELECT).
