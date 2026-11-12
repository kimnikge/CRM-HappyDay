-- ============================================================
-- 009_security_hardening.sql
-- Закрывает дыры в безопасности БД: RLS, эскалация ролей, гранты RPC.
--
-- Какие угрозы закрываются:
--
--   0) Контекст. В 001_schema.sql RLS включён, но политика
--      "Authenticated full access" USING (true) на 6 таблицах давала
--      ЛЮБОМУ валидному JWT полный доступ ко всем данным, включая
--      неподтверждённых пользователей с role = 'pending'.
--      Роль 'pending' существовала в данных, но ничем не ограничивалась.
--
--   1) public.is_admin() — единая точка проверки «текущий пользователь —
--      администратор?». Нужна политикам и триггеру ниже.
--
--   2) public.order_audit_log (создана в 005) не имела ни RLS, ни политик:
--      любой authenticated (и anon, если ему выдан SELECT дефолтными
--      привилегиями Supabase) мог читать историю изменений всех заказов
--      через PostgREST. Включаем RLS + доступ только администраторам.
--
--   3) public.profiles.role редактировался напрямую из браузера (/users):
--      пользователь с role = 'pending' мог сам себе выставить role = 'admin'
--      (самоповышение привилегий). Триггер prevent_role_escalation
--      запрещает менять роль всем, кроме администратора.
--
--   4) Замена "Authenticated full access" на "Admins full access" на
--      profiles, statuses, clients, orders, files, status_history:
--      полный доступ к данным только у администраторов.
--      Публичная anon-политика чтения статусов ("Public read statuses")
--      НЕ удаляется — она нужна публичной форме.
--
--   5) Функции change_order_status(uuid,uuid,uuid,text) и
--      submit_order_form(uuid,jsonb,uuid) объявлены SECURITY DEFINER,
--      т.е. выполняются от владельца и обходят RLS. Исполнение по
--      умолчанию выдано роли PUBLIC, поэтому анонимный ключ позволял
--      вызывать их напрямую через /rest/v1/rpc/... и обходить RLS.
--      Отзываем EXECUTE у PUBLIC/anon, оставляем authenticated/service_role.
--
-- Миграция идемпотентна: CREATE OR REPLACE / DROP ... IF EXISTS /
-- DO-блоки с перехватом ошибок. Повторный запуск безопасен.
-- ============================================================

-- ============================================================
-- 1. Хелпер: является ли текущий пользователь администратором
--    SECURITY DEFINER — чтобы чтение profiles не зависело от RLS-политик
--    самой profiles (иначе возможна рекурсия политики в функцию).
--    STABLE — результат кэшируется в пределах запроса.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- По умолчанию EXECUTE у функций выдан PUBLIC — отзываем,
-- иначе REVOKE у anon не имеет смысла.
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- ============================================================
-- 2. order_audit_log: включаем RLS и доступ только администраторам
-- ============================================================

ALTER TABLE public.order_audit_log ENABLE ROW LEVEL SECURITY;

-- На случай повторного запуска и на случай старой пермиссивной политики
DROP POLICY IF EXISTS "Authenticated full access" ON public.order_audit_log;
DROP POLICY IF EXISTS "Admins only" ON public.order_audit_log;

CREATE POLICY "Admins only"
  ON public.order_audit_log
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 3. Защита от эскалации ролей: profiles.role меняет только админ
--    auth.uid() IS NULL = серверный контекст (service_role, прямой SQL
--    владельца БД, бэкфилл миграций) — такие изменения разрешаем,
--    иначе нельзя ни деплоить, ни администрировать вручную.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Только администратор может изменять роли'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;

CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- ============================================================
-- 4. Замена пермиссивных политик на «только администратор»
--    Для каждой таблицы: удаляем старую политику "Authenticated full access"
--    и (для идемпотентности) уже созданную "Admins full access",
--    затем создаём политику заново.
--    "Public read statuses" на public.statuses НЕ трогаем — она нужна anon.
-- ============================================================

-- 4.1. profiles
DROP POLICY IF EXISTS "Authenticated full access" ON public.profiles;
DROP POLICY IF EXISTS "Admins full access" ON public.profiles;
CREATE POLICY "Admins full access"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4.2. statuses (anon-политика чтения статусов сохраняется)
DROP POLICY IF EXISTS "Authenticated full access" ON public.statuses;
DROP POLICY IF EXISTS "Admins full access" ON public.statuses;
CREATE POLICY "Admins full access"
  ON public.statuses
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4.3. clients
DROP POLICY IF EXISTS "Authenticated full access" ON public.clients;
DROP POLICY IF EXISTS "Admins full access" ON public.clients;
CREATE POLICY "Admins full access"
  ON public.clients
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4.4. orders
DROP POLICY IF EXISTS "Authenticated full access" ON public.orders;
DROP POLICY IF EXISTS "Admins full access" ON public.orders;
CREATE POLICY "Admins full access"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4.5. files
DROP POLICY IF EXISTS "Authenticated full access" ON public.files;
DROP POLICY IF EXISTS "Admins full access" ON public.files;
CREATE POLICY "Admins full access"
  ON public.files
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4.6. status_history
DROP POLICY IF EXISTS "Authenticated full access" ON public.status_history;
DROP POLICY IF EXISTS "Admins full access" ON public.status_history;
CREATE POLICY "Admins full access"
  ON public.status_history
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 5. Ужесточение грантов на SECURITY DEFINER RPC
--    Функции обходят RLS, поэтому анонимный ключ не должен их вызывать.
--    DO-блоки перехватывают undefined_function (42883): если сигнатура
--    функции в конкретной БД отличается, шаг пропускается с NOTICE,
--    а не валит всю миграцию.
-- ============================================================

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.change_order_status(uuid, uuid, uuid, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.change_order_status(uuid, uuid, uuid, text) FROM anon;
  GRANT EXECUTE ON FUNCTION public.change_order_status(uuid, uuid, uuid, text)
    TO authenticated, service_role;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE '009: change_order_status(uuid,uuid,uuid,text) не найдена — шаг пропущен';
END;
$$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.submit_order_form(uuid, jsonb, uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.submit_order_form(uuid, jsonb, uuid) FROM anon;
  GRANT EXECUTE ON FUNCTION public.submit_order_form(uuid, jsonb, uuid)
    TO authenticated, service_role;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE '009: submit_order_form(uuid,jsonb,uuid) не найдена — шаг пропущен';
END;
$$;

-- ============================================================
-- Готово. Проверка после применения (SQL Editor):
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname IN ('is_admin','prevent_role_escalation',
--                     'change_order_status','submit_order_form');
--   SELECT tablename, policyname, roles, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN
--     ('profiles','statuses','clients','orders','files',
--      'status_history','order_audit_log')
--   ORDER BY tablename, policyname;
-- ============================================================
