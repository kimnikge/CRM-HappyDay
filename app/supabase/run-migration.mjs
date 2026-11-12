// Migration runner — applies SQL migrations against Supabase PostgreSQL.
//
// Usage (запускать из каталога app/):
//   node supabase/run-migration.mjs                     → применить все неприменённые миграции
//   node supabase/run-migration.mjs 004                 → применить только 004_*.sql
//   node supabase/run-migration.mjs 004 --password=xxx  → то же + пароль БД явным флагом
//
// Единственный позиционный аргумент — префикс имени файла миграции (обычно 3 цифры).
// Пароль БД берётся ТОЛЬКО из:
//   1) переменной окружения SUPABASE_DB_PASSWORD (в т.ч. загруженной из app/.env), либо
//   2) флага --password=...
// Позиционные аргументы больше НЕ используются как пароль (это была ошибка:
// `node supabase/run-migration.mjs 004` подставлял строку "004" в connection string).
//
// Требуется пакет `pg` (уже в dependencies) и доступ к Postgres на порт 5432
// (transaction pooler 6543 не пропускает DDL/CREATE FUNCTION).
//
// Проект определяется автоматически из PUBLIC_SUPABASE_URL (`https://<ref>.supabase.co`).
// Переопределения (нужны, если db.<ref>.supabase.co не резолвится — используйте
// Session pooler из Dashboard → Settings → Database):
//   SUPABASE_PROJECT_REF, SUPABASE_DB_HOST, SUPABASE_DB_PORT,
//   SUPABASE_DB_USER (для pooler — postgres.<ref>), SUPABASE_DB_NAME
//
// Пример для pooler:
//   SUPABASE_DB_HOST=aws-0-eu-central-1.pooler.supabase.com \
//   node supabase/run-migration.mjs 009 --password=... 

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// ---- Load .env manually (no dependencies) ----
function loadEnv() {
	const envPath = path.join(rootDir, '.env');
	if (!fs.existsSync(envPath)) return;
	const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const val = trimmed.slice(eqIdx + 1).trim();
		if (!process.env[key]) process.env[key] = val;
	}
}
loadEnv();

// ---- CLI parsing ----
// Один неоднозначный аргумент: [migration-prefix] [--password=...]
const usage = `Usage:
  node supabase/run-migration.mjs                     # все неприменённые миграции
  node supabase/run-migration.mjs 004                 # только 004_*.sql
  node supabase/run-migration.mjs 004 --password=xxx  # пароль флагом

Пароль БД также можно задать переменной окружения SUPABASE_DB_PASSWORD
(например, в app/.env — файл читается автоматически).`;

let targetMig = null;
let passwordFlag = null;

for (const arg of process.argv.slice(2)) {
	if (arg === '--help' || arg === '-h') {
		console.log(usage);
		process.exit(0);
	} else if (arg.startsWith('--password=')) {
		passwordFlag = arg.slice('--password='.length);
		if (!passwordFlag) {
			console.error('❌ --password= требует непустое значение.');
			console.error(usage);
			process.exit(1);
		}
	} else if (arg.startsWith('-')) {
		console.error(`❌ Неизвестный флаг: ${arg}`);
		console.error(usage);
		process.exit(1);
	} else if (targetMig !== null) {
		console.error(`❌ Лишний позиционный аргумент: ${arg}`);
		console.error('   Пароль передаётся только через SUPABASE_DB_PASSWORD или --password=...');
		console.error(usage);
		process.exit(1);
	} else {
		targetMig = arg;
	}
}

// ---- Config ----
// Проект определяется по PUBLIC_SUPABASE_URL (https://<ref>.supabase.co) —
// отдельно хардкодить ref больше не нужно. Любой параметр подключения можно
// переопределить через окружение: новые проекты Supabase не всегда отдают
// db.<ref>.supabase.co, и тогда нужен session pooler (5432), у которого
// другой хост и пользователь postgres.<ref>.
function refFromUrl(url) {
	if (!url) return null;
	try {
		const host = new URL(url).hostname;
		const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(host);
		return m ? m[1] : null;
	} catch {
		return null;
	}
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || refFromUrl(process.env.PUBLIC_SUPABASE_URL);
if (!PROJECT_REF) {
	console.error('❌ Не удалось определить ref проекта.');
	console.error('   Задайте PUBLIC_SUPABASE_URL=https://<ref>.supabase.co в app/.env');
	console.error('   либо SUPABASE_PROJECT_REF=<ref>.');
	process.exit(1);
}

const DB_HOST = process.env.SUPABASE_DB_HOST || `db.${PROJECT_REF}.supabase.co`;
const DB_PORT = process.env.SUPABASE_DB_PORT || '5432';
const DB_USER = process.env.SUPABASE_DB_USER || `postgres.${PROJECT_REF}`;
const DB_NAME = process.env.SUPABASE_DB_NAME || 'postgres';
const password = passwordFlag || process.env.SUPABASE_DB_PASSWORD || null;

if (!password) {
	console.error('❌ Пароль БД не задан. Один из вариантов:');
	console.error('   1. Добавить SUPABASE_DB_PASSWORD=yourpass в app/.env (или в окружение)');
	console.error('   2. Передать флагом: node supabase/run-migration.mjs 004 --password=yourpass');
	process.exit(1);
}

// Прямое подключение к Postgres: DDL и CREATE FUNCTION через transaction
// pooler (6543) не проходят, поэтому по умолчанию порт 5432.
const connectionString = `postgresql://${DB_USER}:${encodeURIComponent(password)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
console.log(`🔗 Проект ${PROJECT_REF} → ${DB_HOST}:${DB_PORT} (${DB_USER})`);

// Discover migration files sorted by name
const migrationsDir = path.join(__dirname, 'migrations');
let files = fs.readdirSync(migrationsDir)
	.filter((f) => f.endsWith('.sql'))
	.sort();

if (targetMig) {
	const matches = files.filter((f) => f.startsWith(targetMig));
	if (matches.length === 0) {
		console.error(`❌ Миграция с префиксом "${targetMig}" не найдена в ${migrationsDir}`);
		process.exit(1);
	}
	if (matches.length > 1) {
		console.error(`❌ Префикс "${targetMig}" неоднозначен, подходят несколько файлов:`);
		for (const m of matches) console.error(`   - ${m}`);
		console.error('   Укажите более длинный префикс, например 004_atomic.');
		process.exit(1);
	}
	files = matches;
}

if (files.length === 0) {
	console.log('ℹ️  Файлы миграций не найдены.');
	process.exit(0);
}

const pool = new pg.Pool({
	connectionString,
	max: 1,
	idleTimeoutMillis: 5000,
});

try {
	const client = await pool.connect();
	console.log('🔌 Connected to Supabase PostgreSQL\n');

	// Ensure tracking table exists
	await client.query(`
		CREATE TABLE IF NOT EXISTS _migrations (
			filename   TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`);

	for (const file of files) {
		// Skip already-applied migrations
		const { rows: already } = await client.query(
			'SELECT 1 FROM _migrations WHERE filename = $1',
			[file],
		);
		if (already.length > 0) {
			console.log(`⏭️  ${file} — already applied, skipping`);
			continue;
		}

		const sqlPath = path.join(migrationsDir, file);
		const sql = fs.readFileSync(sqlPath, 'utf-8');

		console.log(`🚀 Applying ${file}...`);
		await client.query('BEGIN');
		try {
			await client.query(sql);
			await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
			await client.query('COMMIT');
			console.log(`   ✅ ${file} — done`);
		} catch (err) {
			await client.query('ROLLBACK');
			console.error(`   ❌ ${file} — FAILED:`, err.message);
			throw err;
		}
	}

	// Verify key functions exist
	console.log('\n🔍 Verification:');
	const { rows: funcs } = await client.query(`
		SELECT routine_name FROM information_schema.routines
		WHERE routine_name IN ('change_order_status', 'submit_order_form', 'is_admin')
		ORDER BY routine_name
	`);
	for (const f of funcs) {
		console.log(`   Function ${f.routine_name} ✅`);
	}

	client.release();
	console.log('\n🎉 All migrations applied successfully.');
} catch (err) {
	console.error('\n❌ Migration failed:', err.message);
	process.exit(1);
} finally {
	await pool.end();
}
