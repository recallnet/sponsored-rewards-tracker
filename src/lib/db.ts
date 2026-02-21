import { neon } from '@neondatabase/serverless';

type SQL = ReturnType<typeof neon>;

let _sql: SQL | null = null;

function getSql(): SQL | null {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[db] DATABASE_URL not set — persistence disabled');
    return null;
  }
  _sql = neon(url);
  return _sql;
}

export async function initDb(): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS reward_cache (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      last_block BIGINT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function loadCache(key: string): Promise<{ value: unknown; lastBlock: number } | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT value, last_block FROM reward_cache WHERE key = ${key}
    ` as unknown as { value: unknown; last_block: string | number }[];
    if (!rows || rows.length === 0) return null;
    return {
      value: rows[0].value,
      lastBlock: Number(rows[0].last_block ?? 0),
    };
  } catch (e) {
    console.error(`[db] loadCache(${key}) error:`, e);
    return null;
  }
}

export async function saveCache(key: string, value: unknown, lastBlock: number): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  try {
    await sql`
      INSERT INTO reward_cache (key, value, last_block, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}, ${lastBlock}, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = ${JSON.stringify(value)}, last_block = ${lastBlock}, updated_at = NOW()
    `;
  } catch (e) {
    console.error(`[db] saveCache(${key}) error:`, e);
  }
}
