// Migration runner — applies SQL migrations against Supabase PostgreSQL.
// Reads DB password from .env (SUPABASE_DB_PASSWORD) or 1st CLI argument.
// Usage:
//   node supabase/run-migration.mjs              → run all pending
//   node supabase/run-migration.mjs 004          → run specific migration
//   node supabase/run-migration.mjs 004 pass     → with explicit password

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

// ---- Config ----
const PROJECT_REF = 'jioeuhpqhvszkjteyveh';
const DB_PASSWORD = process.argv[2] || process.env.SUPABASE_DB_PASSWORD || null;
const TARGET = process.argv[3] || process.argv[2] || null; // arg can be migration number

// Normalise: if 1st arg is a migration number, treat 2nd as password
let password = DB_PASSWORD;
let targetMig = null;
for (const a of process.argv.slice(2)) {
	if (/^\d{3}$/.test(a)) { targetMig = a; }
	else if (a && !a.startsWith('-')) { password = a; }
}

if (!password) {
	console.error('❌ DB password not set. Either:');
	console.error('   1. Add SUPABASE_DB_PASSWORD=yourpass to app/.env');
	console.error('   2. Or pass as argument: node supabase/run-migration.mjs YOURPASS 004');
	process.exit(1);
}

// Direct PostgreSQL connection (bypasses pooler, supports DDL).
// Use this for migrations; the pooler blocks CREATE FUNCTION etc.
const connectionString = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

// Discover migration files sorted by name
const migrationsDir = path.join(__dirname, 'migrations');
const files = fs.readdirSync(migrationsDir)
	.filter(f => f.endsWith('.sql'))
	.sort();

if (targetMig) {
	const match = files.find(f => f.startsWith(targetMig));
	if (!match) {
		console.error(`❌ Migration ${targetMig} not found in ${migrationsDir}`);
		process.exit(1);
	}
	files.length = 0;
	files.push(match);
}

if (files.length === 0) {
	console.log('ℹ️  No migration files found.');
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
		WHERE routine_name IN ('change_order_status', 'submit_order_form')
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
