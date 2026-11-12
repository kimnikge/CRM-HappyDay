-- ============================================================
-- 012_orders_constraints.sql
-- Закрывает долг по модели данных:
--
--   1) Перечисления (format, water, coffee, dishware, event_level)
--      хранились как TEXT без ограничений — записать можно было что угодно
--      (API/PostgREST, SQL, старые импорты). UI при этом работает по
--      фиксированным спискам из app/src/lib/config.ts, поэтому «Банкет»
--      вместо «банкет» тихо ломал цвет тега и не находился в селекте.
--      Здесь: данные приводятся к каноническим значениям + CHECK.
--
--   2) orders.order_number — identity-колонка без UNIQUE. Уникальность
--      держалась только на последовательности. Добавляем настоящий
--      UNIQUE, чтобы дубликат номера заказа был невозможен.
--
-- Идемпотентна: повторный запуск безопасен.
-- ============================================================

-- ============================================================
-- 1. Нормализация существующих значений к каноническому виду
--    (ровно те строки, которые предлагает UI в select)
-- ============================================================

UPDATE public.orders
   SET format = lower(btrim(format))
 WHERE format IS NOT NULL
   AND format IS DISTINCT FROM lower(btrim(format));

UPDATE public.orders
   SET water = lower(btrim(water))
 WHERE water IS NOT NULL
   AND water IS DISTINCT FROM lower(btrim(water));

UPDATE public.orders
   SET coffee = lower(btrim(coffee))
 WHERE coffee IS NOT NULL
   AND coffee IS DISTINCT FROM lower(btrim(coffee));

UPDATE public.orders
   SET dishware = lower(btrim(dishware))
 WHERE dishware IS NOT NULL
   AND dishware IS DISTINCT FROM lower(btrim(dishware));

UPDATE public.orders
   SET event_level = btrim(event_level)
 WHERE event_level IS NOT NULL
   AND event_level IS DISTINCT FROM btrim(event_level);

-- ============================================================
-- 2. CHECK-ограничения на перечисления
--    NOT VALID + VALIDATE: новые/изменённые строки проверяются сразу,
--    существующие — отдельным проходом. Если в проде найдётся мусор,
--    VALIDATE упадёт с понятной ошибкой, а не заблокирует таблицу.
-- ============================================================

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_format
    CHECK (format IS NULL OR format IN ('банкет','фуршет','кофе-брейк','коктейль','буфет'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_water
    CHECK (water IS NULL OR water IN ('бутилированная','в графинах'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_coffee
    CHECK (coffee IS NULL OR coffee IN ('растворимый','зерновой'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_dishware
    CHECK (dishware IS NULL OR dishware IN ('керамика','одноразовая','керамика + одноразовая'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_event_level
    CHECK (event_level IS NULL OR event_level IN ('СГО','Бизнес','Частное'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.orders VALIDATE CONSTRAINT chk_orders_format;
ALTER TABLE public.orders VALIDATE CONSTRAINT chk_orders_water;
ALTER TABLE public.orders VALIDATE CONSTRAINT chk_orders_coffee;
ALTER TABLE public.orders VALIDATE CONSTRAINT chk_orders_dishware;
ALTER TABLE public.orders VALIDATE CONSTRAINT chk_orders_event_level;

-- ============================================================
-- 3. Уникальность номера заказа
-- ============================================================

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Проверка после применения:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid = 'public.orders'::regclass
--   ORDER BY conname;
