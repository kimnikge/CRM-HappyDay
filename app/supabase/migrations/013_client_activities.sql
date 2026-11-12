-- ============================================================
-- 013_client_activities.sql
-- История обращений клиента: звонки, письма, WhatsApp, встречи,
-- заметки + «следующее действие» (напоминание).
--
-- Зачем: карточка клиента должна отвечать на вопрос «когда и по какому
-- поводу он обращался», а не только «сколько заказов было». Заказы уже
-- связаны через orders.client_id, но коммуникации нигде не хранились.
--
-- Модель доступа — как у остальных таблиц после 009: только администраторы
-- (public.is_admin()). Создание/удаление — через приложение (браузер, JWT).
--
-- Идемпотентна.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'note',
  happened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary       TEXT NOT NULL,
  -- когда перезвонить / вернуться к клиенту; NULL = напоминание не нужно
  next_action_at TIMESTAMPTZ,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_client_activities_kind
    CHECK (kind IN ('call', 'email', 'whatsapp', 'meeting', 'note')),
  CONSTRAINT chk_client_activities_summary_not_blank
    CHECK (length(btrim(summary)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_client_activities_client
  ON public.client_activities(client_id, happened_at DESC);

-- «Кому пора позвонить»: частичный индекс только по строкам с напоминанием
CREATE INDEX IF NOT EXISTS idx_client_activities_next_action
  ON public.client_activities(next_action_at)
  WHERE next_action_at IS NOT NULL;

ALTER TABLE public.client_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access" ON public.client_activities;
DROP POLICY IF EXISTS "Admins full access" ON public.client_activities;
CREATE POLICY "Admins full access"
  ON public.client_activities
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Проверка после применения:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.client_activities'::regclass;
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'client_activities';
