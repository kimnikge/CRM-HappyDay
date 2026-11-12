-- ============================================================
-- verify-p0.sql — проверка P0 после применения 009 и 010.
-- Запускать в Supabase SQL Editor целиком (или через run-migration.mjs
-- не нужно — это read-only скрипт). Каждая строка = один чек:
--   OK   — как задумано
--   FAIL — применить миграцию / разобраться
-- Если запрос упал с ошибкой — значит объект из 009/010 отсутствует,
-- применяйте миграцию.
-- ============================================================

WITH checks AS (

  -- 1. RLS включён на всех таблицах public, где он нужен
  SELECT '1. RLS включён на 7 таблицах' AS check_name,
         CASE WHEN count(*) = 7 THEN 'OK' ELSE 'FAIL (включён на ' || count(*) || ' из 7)' END AS result
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('profiles','statuses','clients','orders','files','status_history','order_audit_log')
    AND c.relrowsecurity

  UNION ALL

  -- 2. Все политики public — admin-only (кроме anon-чтения статусов)
  SELECT '2. Политики public используют is_admin()',
         CASE WHEN count(*) = 7 THEN 'OK' ELSE 'FAIL (найдено ' || count(*) || ' из 7)' END
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual LIKE '%is_admin%'

  UNION ALL

  -- 3. Старой пермиссивной политики не осталось
  SELECT '3. Нет "Authenticated full access"',
         CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL (осталось политик: ' || count(*) || ')' END
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname = 'Authenticated full access'

  UNION ALL

  -- 4. Публичная форма по-прежнему может читать статусы анонимно
  SELECT '4. anon читает statuses (нужно публичной форме)',
         CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FAIL' END
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'statuses'
    AND policyname = 'Public read statuses' AND roles::text LIKE '%anon%'

  UNION ALL

  -- 5. anon не может вызывать SECURITY DEFINER RPC
  SELECT '5. anon не может вызывать change_order_status',
         CASE WHEN NOT has_function_privilege('anon',
              'public.change_order_status(uuid,uuid,uuid,text)', 'EXECUTE')
              THEN 'OK' ELSE 'FAIL' END

  UNION ALL

  SELECT '6. anon не может вызывать submit_order_form',
         CASE WHEN NOT has_function_privilege('anon',
              'public.submit_order_form(uuid,jsonb,uuid)', 'EXECUTE')
              THEN 'OK' ELSE 'FAIL' END

  UNION ALL

  -- 7. authenticated и service_role могут (иначе приложение сломается)
  SELECT '7. authenticated может вызывать change_order_status',
         CASE WHEN has_function_privilege('authenticated',
              'public.change_order_status(uuid,uuid,uuid,text)', 'EXECUTE')
              THEN 'OK' ELSE 'FAIL' END

  UNION ALL

  SELECT '8. service_role может вызывать submit_order_form',
         CASE WHEN has_function_privilege('service_role',
              'public.submit_order_form(uuid,jsonb,uuid)', 'EXECUTE')
              THEN 'OK' ELSE 'FAIL' END

  UNION ALL

  -- 9. Триггер запрета эскалации ролей на месте
  SELECT '9. Триггер prevent_role_escalation активен',
         CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FAIL' END
  FROM pg_trigger
  WHERE tgname = 'trg_prevent_role_escalation' AND NOT tgisinternal

  UNION ALL

  -- 10. Bucket order-files существует
  SELECT '10. Bucket order-files создан',
         CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FAIL' END
  FROM storage.buckets WHERE id = 'order-files'

  UNION ALL

  -- 11. Политика Storage — admin-only
  SELECT '11. Storage-политика использует is_admin()',
         CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FAIL' END
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND qual LIKE '%is_admin%'

  UNION ALL

  -- 12. Старой Storage-политики не осталось
  SELECT '12. Нет "Authenticated manage files"',
         CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL' END
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Authenticated manage files'

  UNION ALL

  -- 13. Все активные пользователи — администраторы (иначе после 009
  --     они потеряют доступ к данным; UI их пускает)
  SELECT '13. Нет активных пользователей с role <> admin',
         CASE WHEN count(*) = 0 THEN 'OK'
              ELSE 'ВНИМАНИЕ: пользователей с иной ролью: ' || count(*) ||
                   ' — они потеряют доступ, выдайте им admin' END
  FROM public.profiles
  WHERE role IS DISTINCT FROM 'admin'
)
SELECT check_name, result FROM checks ORDER BY check_name;
