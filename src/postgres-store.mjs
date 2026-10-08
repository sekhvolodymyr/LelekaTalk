import pg from 'pg';

export const emptyDatabase = () => ({ version: 1, users: [], sessions: [], mvp: { version: 1, chats: [], messages: [], blocks: [], channels: [], posts: [], comments: [], plans: [], habits: [], reports: [] } });

// Compatibility store for the first MVP. A row lock prevents concurrent
// serverless instances from overwriting another request's updates.
// Large deployments should migrate the individual collections to tables.
export function createPostgresStore(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
  pool.on('error', () => console.error('Postgres idle connection failed.'));
  let ready;
  async function initialize() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '15000ms'");
      await client.query('SELECT pg_advisory_xact_lock(1818584929)');
      await client.query('CREATE TABLE IF NOT EXISTS leleka_mvp_state (id integer PRIMARY KEY CHECK (id = 1), payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
      await client.query('INSERT INTO leleka_mvp_state (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify(emptyDatabase())]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async function ensureReady() {
    ready ??= initialize().catch(error => { ready = undefined; throw error; });
    await ready;
  }
  return {
    async run(mutating, action) {
      await ensureReady();
      const client = await pool.connect();
      let transaction = false;
      try {
        if (mutating) {
          await client.query('BEGIN'); transaction = true;
          await client.query("SET LOCAL statement_timeout = '15000ms'");
          await client.query("SET LOCAL idle_in_transaction_session_timeout = '20000ms'");
        }
        const result = await client.query(`SELECT payload FROM leleka_mvp_state WHERE id = 1${mutating ? ' FOR UPDATE' : ''}`);
        const database = result.rows[0].payload;
        const previous = JSON.stringify(database);
        const response = await action(database);
        const next = JSON.stringify(database);
        if (mutating && next !== previous) await client.query('UPDATE leleka_mvp_state SET payload = $1::jsonb, updated_at = now() WHERE id = 1', [next]);
        if (transaction) { await client.query('COMMIT'); transaction = false; }
        return response;
      } catch (error) {
        if (transaction) await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
    close: () => pool.end(),
  };
}
