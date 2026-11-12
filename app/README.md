# Catering CRM

Внутренняя CRM для кейтеринговой компании (рынок Казахстана, суммы в ₸): канбан заказов,
карточка мероприятия с техническими полями, публичная форма для клиента, файлы, история
изменений и роли администраторов.

## Что умеет

- **Дашборд-канбан** (`/`) — 7 фиксированных статусов (Черновик → … → Отменён),
  drag&drop мышью и пальцем (Pointer Events), поиск, фильтр по дате, сумма по колонке,
  экспорт текущего списка в CSV. Автообновление каждые 5 секунд без сброса фильтров.
- **Карточка заказа** (`/orders/{id}`) — ~30 полей (клиент, параметры события, время,
  локация, оборудование, меню, напитки, финансы), смена статуса с причиной отмены,
  история статусов, важность/напоминание/внутренние заметки, загрузка файлов
  (JPEG/PNG/PDF/DOCX/XLSX до 10 МБ), PDF-выгрузка карточки.
- **Публичная форма** (`/form/{token}`) — клиент заполняет технические детали по ссылке
  из карточки заказа; отправка атомарная (RPC `submit_order_form`) с автопереходом
  «Черновик» → «На согласовании». Повторная отправка запрещена.
- **Клиенты** (`/clients`) — список, поиск, создание/редактирование/удаление.
- **Календарь** (`/calendar`) — заказы по датам мероприятий, сетка месяца и список.
- **Пользователи** (`/users`) — роли `admin` / `pending`: новый пользователь после
  регистрации ждёт подтверждения администратора.
- **Аккаунт** — вход, сброс пароля, страница профиля (`/profile`), тёмная тема.
- **Аудит** — история статусов, а также `order_audit_log`: триггер пишет диффы полей
  (кто, что, когда). В UI пока не выводится.

## Стек

| Слой | Технологии |
|------|-----------|
| Фронтенд | SvelteKit 2, Svelte 5 (runes), TypeScript, Tailwind CSS 4 (`@tailwindcss/vite`), Vite |
| БД и бэкенд | Supabase: PostgreSQL, Auth, Storage, Row Level Security, RPC-функции |
| Валидация | Zod 4 (`src/lib/schemas`) |
| PDF | jsPDF + шрифт Golos Text |
| Тесты | Vitest (`src/**/__tests__`) |
| Деплой | Vercel, `@sveltejs/adapter-auto` |

## Быстрый старт

Требуется Node.js 20+ и npm, а также проект Supabase.

```sh
cd app
npm install
cp .env.example .env   # заполнить значениями из Supabase Dashboard
npm run dev            # http://localhost:5173
```

### Переменные окружения (`app/.env`)

| Переменная | Назначение |
|------------|-----------|
| `PUBLIC_SUPABASE_URL` | URL проекта Supabase (публичная) |
| `PUBLIC_SUPABASE_ANON_KEY` | anon-ключ, ходит в браузер (публичная) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role, **только сервер**: `$lib/supabase-admin.server.ts`. В браузер не попадает |
| `SUPABASE_DB_PASSWORD` | пароль БД для скрипта миграций (в самом приложении не используется) |

`PUBLIC_*` попадают в клиентский бандл — секретов там быть не должно.

### Скрипты (`app/`)

| Команда | Что делает |
|---------|-----------|
| `npm run dev` | dev-сервер Vite |
| `npm run check` | `svelte-kit sync` + `svelte-check` (типы и ошибки Svelte) |
| `npm test` | однократный прогон Vitest |
| `npm run test:watch` | Vitest в watch-режиме |
| `npm run build` | production-сборка |
| `npm run preview` | локальный предпросмотр сборки |

## База данных и миграции

SQL лежит в `app/supabase/migrations/`. Порядок применения — по префиксу:

| Файл | Содержимое |
|------|-----------|
| `001_schema.sql` | таблицы `profiles`, `statuses`, `clients`, `orders`, `files`, `status_history`; триггеры `updated_at`, автосоздание профиля; RLS |
| `002_indexes.sql` | индексы под выборки канбана |
| `003_atomic_status_change.sql` | RPC `change_order_status` — смена статуса + запись истории в одной транзакции |
| `004_atomic_form_submit.sql` | RPC `submit_order_form` — атомарная отправка публичной формы |
| `005_order_audit_log.sql` | таблица `order_audit_log` + триггер диффов полей |
| `006_new_order_fields.sql` | `is_important`, `reminder_days`, `internal_notes` |
| `007_user_roles.sql` | колонка `profiles.role` (`admin` / `pending`) |
| `008_fix_profile_fkeys.sql` | FK на `profiles` с `ON DELETE SET NULL` |
| `009_security_hardening.sql` | RLS «только администратор», `is_admin()`, запрет эскалации ролей, отзыв `EXECUTE` у `PUBLIC`/`anon` на RPC |
| `010_storage_hardening.sql` | bucket `order-files` создаётся миграцией (приватный, 10 МБ), Storage-политика admin-only |

Способы применения:

1. **Ручной (SQL Editor Supabase)** — открыть файлы по очереди `001` … `010` и выполнить.
2. **Скрипт-раннер** (нужен прямой доступ к БД на порт 5432, pooler не пропускает DDL):

   ```sh
   cd app
   node supabase/run-migration.mjs          # все неприменённые
   node supabase/run-migration.mjs 009      # только 009_security_hardening.sql
   node supabase/run-migration.mjs 009 --password=...   # пароль флагом
   ```

   Пароль берётся только из `SUPABASE_DB_PASSWORD` (в т.ч. из `app/.env`) или флага
   `--password=...`; позиционный аргумент — это префикс миграции. Применённые файлы
   учитываются в таблице `_migrations`, повторно они не запускаются.

3. Storage: bucket `order-files` создаётся миграцией `010` (приватный, лимит 10 МБ).
   Если bucket уже заведён вручную — миграция его не перетирает (`ON CONFLICT DO NOTHING`),
   но политика доступа становится admin-only.
4. **Проверка после наката** — выполнить `supabase/verify-p0.sql` в SQL Editor: все
   строки должны быть `OK`. Чек 13 предупреждает, если есть пользователи с ролью,
   отличной от `admin` — после `009` они потеряют доступ к данным.
5. Первый администратор: зарегистрироваться, затем в SQL Editor выполнить
   `UPDATE public.profiles SET role = 'admin' WHERE id = '<uuid пользователя>';`
   (без администратора подтверждать новых пользователей некому).

## Безопасность

- RLS включён на всех таблицах `public`; политики «Admins full access» разрешают
  полный доступ только `authenticated` с `role = 'admin'` (проверка через
  `public.is_admin()`).
- Анонимам доступно только чтение `statuses` — это нужно публичной форме.
- Триггер `prevent_role_escalation` не даёт пользователю изменить `profiles.role`
  без прав администратора.
- RPC `change_order_status` и `submit_order_form` — `SECURITY DEFINER` (обходят RLS),
  поэтому `EXECUTE` им выдан только `authenticated` и `service_role`.
- service_role используется лишь на сервере (`$lib/supabase-admin.server.ts`);
  серверные хелперы без пользовательской сессии (`$lib/supabase.server.ts`) работают
  как `anon` и видят только публичные данные — для привилегированных операций
  нужен admin-клиент или проброс сессии.
- Политика `009_security_hardening.sql` меняет модель доступа: применять её нужно
  осознанно, после проверки, что API-слой ходит в БД под нужной ролью.

## Структура проекта

```
app/
├── src/
│   ├── routes/                 # страницы и API (SvelteKit file-based routing)
│   │   ├── +page.svelte        # дашборд-канбан
│   │   ├── orders/             # создание /orders/new и карточка /orders/{id}
│   │   ├── clients/            # страница клиентов
│   │   ├── calendar/           # календарь мероприятий
│   │   ├── form/[token]/       # публичная форма для клиента
│   │   ├── login/              # вход + сброс пароля
│   │   ├── profile/            # профиль пользователя
│   │   ├── users/              # управление пользователями и ролями
│   │   └── api/                # REST-эндпоинты (orders, clients, files, form, statuses, users)
│   ├── lib/
│   │   ├── components/         # Header, kanban/*, form/*, ui/*
│   │   ├── services/           # доступ к данным (orders, clients, files)
│   │   ├── schemas/            # Zod-схемы валидации
│   │   ├── stores/             # auth и kanban на Svelte 5 runes
│   │   ├── pdf/                # генерация PDF карточки заказа
│   │   ├── utils/              # телефонные маски и пр.
│   │   ├── config.ts           # бизнес-константы (форматы, статусы, валюта)
│   │   ├── supabase.ts         # браузерный клиент
│   │   ├── supabase.server.ts  # серверный anon-клиент (без сессии)
│   │   └── supabase-admin.server.ts # service_role, только сервер
│   ├── hooks.server.ts         # Supabase SSR-клиент в locals
│   └── app.css                 # Tailwind 4 + дизайн-токены
├── static/                     # favicon, manifest, sw.js
├── supabase/
│   ├── migrations/             # SQL-миграции 001–009
│   ├── config.toml             # локальный Supabase CLI
│   └── run-migration.mjs       # раннер миграций
├── vercel.json (в корне репо)  # сборка из app/
└── package.json
```

## Деплой

`/vercel.json` в корне репозитория уже настроен на сборку подкаталога `app/`:

```json
{
  "buildCommand": "cd app && npm run build",
  "installCommand": "cd app && npm install",
  "framework": "sveltekit"
}
```

1. Импортировать репозиторий в Vercel (корень — репозиторий, не `app/`).
2. В Settings → Environment Variables добавить `PUBLIC_SUPABASE_URL`,
   `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (и `SUPABASE_DB_PASSWORD`,
   если планируете запускать миграции из CI).
3. Миграции БД автоматически не применяются — их выполняют вручную/SQL-скриптом.
4. Домен и проект Supabase Auth: добавить production-URL в настройки Auth
   (Site URL / Redirect URLs для сброса пароля).

## Документация

- `docs/ТЗ-1.md`, `docs/ТЗ-2.md` — исходные технические задания.
- `docs/сценарий.md` — сценарии пользователя и gap-анализ (раздел 0 — актуализация
  на 12.11.2026).
