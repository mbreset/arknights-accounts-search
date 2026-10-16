import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import worker from '../worker/src/index.ts'

const origin = 'https://mbreset.github.io'
const visitorId = '11111111-1111-4111-8111-111111111111'
const initialMigration = readFileSync(new URL('../worker/migrations/0001_initial.sql', import.meta.url), 'utf8')
const idfarmMigration = readFileSync(new URL('../worker/migrations/0002_idfarm_stats.sql', import.meta.url), 'utf8')
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function fixture(t) {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(initialMigration)
  db.exec("UPDATE global_counts SET visitor_count = 123 WHERE id = 1")
  db.prepare('INSERT INTO daily_counts VALUES (?, 12)').run(today())
  db.prepare('INSERT INTO lifetime_visitors VALUES (?, ?)').run('legacy-hash', '2026-01-01')
  db.prepare('INSERT INTO daily_visitors VALUES (?, ?, ?)').run(today(), 'legacy-hash', '2026-01-01')
  const snapshot = () => Object.fromEntries(
    ['lifetime_visitors', 'daily_visitors', 'daily_counts', 'global_counts']
      .map((name) => [name, db.prepare(`SELECT * FROM ${name}`).all()]),
  )
  const original = snapshot()
  db.exec(idfarmMigration)

  // Run the Worker's SQL against SQLite through the D1 prepare/batch contract.
  const env = {
    DB: {
      prepare(sql) {
        return { sql, args: [], bind(...args) { return { sql, args } } }
      },
      async batch(statements) {
        db.exec('BEGIN')
        try {
          const results = statements.map(({ sql, args }) => {
            const statement = db.prepare(sql)
            if (statement.columns().length) return { results: statement.all(...args), meta: {} }
            return { results: [], meta: { changes: Number(statement.run(...args).changes) } }
          })
          db.exec('COMMIT')
          return results
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      },
    },
    VISIT_RATE_LIMITER: { async limit() { return { success: true } } },
    ALLOWED_ORIGINS: origin,
    VISITOR_HASH_PEPPER: 'test-only-pepper',
    ADMIN_IP: '192.0.2.1',
  }
  const request = (path, { admin = false, method = 'POST', body, requestOrigin = origin } = {}) => worker.fetch(
    new Request(`https://stats.example${path}`, {
      method,
      headers: { Origin: requestOrigin, 'CF-Connecting-IP': admin ? env.ADMIN_IP : '192.0.2.2' },
      ...(method === 'POST' ? { body: body ?? JSON.stringify({ visitor_id: visitorId }) } : {}),
    }), env,
  )
  const counts = async (path) => (await request(path, { admin: true })).json()
  return { db, env, request, counts, snapshot, original }
}

test('migration preserves every original row and starts IDFarm at zero', async (t) => {
  const f = fixture(t)
  assert.deepEqual(f.snapshot(), f.original)
  assert.deepEqual(await f.counts('/visit'), { today: 12, total: 123 })
  assert.deepEqual(await f.counts('/visit/idfarm'), { today: 0, total: 0 })
  f.db.exec(idfarmMigration)
  assert.deepEqual(f.snapshot(), f.original)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM idfarm_lifetime_visitors').get().count, 0)
})

test('same visitor is counted independently and deduplicated within each site', async (t) => {
  const f = fixture(t)
  for (let i = 0; i < 3; i++) assert.equal((await f.request('/visit/idfarm')).status, 204)
  assert.deepEqual(f.snapshot(), f.original)
  assert.deepEqual(await f.counts('/visit/idfarm'), { today: 1, total: 1 })
  for (let i = 0; i < 3; i++) assert.equal((await f.request('/visit')).status, 204)
  assert.deepEqual(await f.counts('/visit'), { today: 13, total: 124 })
  assert.deepEqual(await f.counts('/visit/idfarm'), { today: 1, total: 1 })
  f.db.exec(idfarmMigration)
  assert.deepEqual(await f.counts('/visit/idfarm'), { today: 1, total: 1 })
})

test('existing original visitor is still new to IDFarm', async (t) => {
  const f = fixture(t)
  await f.request('/visit')
  const before = f.snapshot()
  await f.request('/visit/idfarm')
  assert.deepEqual(f.snapshot(), before)
  assert.deepEqual(await f.counts('/visit/idfarm'), { today: 1, total: 1 })
})

test('returning visitor increases daily count without increasing lifetime count', async (t) => {
  const f = fixture(t)
  await f.request('/visit/idfarm')
  f.db.prepare('UPDATE idfarm_daily_visitors SET day = ?').run('2020-01-01')
  f.db.prepare('UPDATE idfarm_daily_counts SET day = ?').run('2020-01-01')
  await f.request('/visit/idfarm')
  assert.deepEqual(await f.counts('/visit/idfarm'), { today: 1, total: 1 })
  assert.deepEqual(f.snapshot(), f.original)
})

test('admin reads do not count visits and normal visitors cannot read counts', async (t) => {
  const f = fixture(t)
  for (const path of ['/visit', '/visit/idfarm']) {
    const admin = await f.request(path, { admin: true, body: '{}' })
    assert.equal(admin.status, 200)
    assert.equal(admin.headers.get('Access-Control-Allow-Origin'), origin)
    assert.equal(admin.headers.get('Cache-Control'), 'no-store')
  }
  assert.deepEqual(f.snapshot(), f.original)
  assert.deepEqual(await f.counts('/visit/idfarm'), { today: 0, total: 0 })
  const visitor = await f.request('/visit/idfarm')
  assert.equal(visitor.status, 204)
  assert.equal(await visitor.text(), '')
})

test('both endpoints retain origin, body, routing and rate-limit protection', async (t) => {
  const f = fixture(t)
  for (const path of ['/visit', '/visit/idfarm']) {
    assert.equal((await f.request(path, { requestOrigin: 'https://other.example' })).status, 403)
    assert.equal((await f.request(path, { body: '{' })).status, 400)
    assert.equal((await f.request(path, { body: '{}' })).status, 400)
    assert.equal((await f.request(path, { body: 'x'.repeat(257) })).status, 413)
    assert.equal((await f.request(path, { method: 'GET' })).status, 404)
    assert.equal((await f.request(path, { method: 'OPTIONS' })).status, 204)
  }
  assert.equal((await f.request('/visit/other')).status, 404)
  f.env.VISIT_RATE_LIMITER.limit = async () => ({ success: false })
  for (const path of ['/visit', '/visit/idfarm']) assert.equal((await f.request(path)).status, 429)
  assert.deepEqual(f.snapshot(), f.original)
  assert.deepEqual(await f.counts('/visit/idfarm'), { today: 0, total: 0 })
})
