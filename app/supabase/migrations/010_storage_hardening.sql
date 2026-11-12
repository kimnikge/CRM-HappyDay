-- ============================================================
-- 010_storage_hardening.sql
-- Приводит Storage к той же модели доступа, что и таблицы в 009.
--
-- Что закрывается:
--   1) Bucket order-files создавался ТОЛЬКО вручную (001 это лишь
--      комментировал) — на чистом окружении загрузка файлов падала,
--      а "как настроено в проде" нигде не зафиксировано. Теперь bucket
--      создаётся миграцией идемпотентно.
--
--   2) Политика "Authenticated manage files" (001) давала управление
--      файлами ЛЮБОМУ валидному JWT, включая пользователей с
--      role = 'pending'. После 009 доступ к таблицам — только у админов,
--      а Storage оставался дырой. Меняем политику на admin-only.
--
-- Идемпотентна: повторный запуск безопасен.
-- ============================================================

-- ============================================================
-- 1. Bucket order-files: приватный, лимит 10 МБ (как в ТЗ)
--    ON CONFLICT DO NOTHING — не перетираем ручные настройки прода.
--    Если bucket в проде публичный и вы хотите это изменить:
--      UPDATE storage.buckets SET public = false WHERE id = 'order-files';
--    После этого старые публичные ссылки перестанут работать, а UI
--    уже использует createSignedUrl — это ожидаемое поведение.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('order-files', 'order-files', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Политика на объекты: только администраторы
--    "Authenticated manage files" больше не нужна — удаляем.
--    Требует public.is_admin() из 009; если 009 не применена,
--    миграция упадёт на undefined_function — это ожидаемо.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated manage files" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage files" ON storage.objects;

CREATE POLICY "Admins manage files"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'order-files' AND public.is_admin())
  WITH CHECK (bucket_id = 'order-files' AND public.is_admin());

-- ============================================================
-- Готово. Проверка после применения (SQL Editor):
--   SELECT id, name, public, file_size_limit
--   FROM storage.buckets WHERE id = 'order-files';
--
--   SELECT policyname, roles, cmd, qual
--   FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--   ORDER BY policyname;
-- ============================================================
