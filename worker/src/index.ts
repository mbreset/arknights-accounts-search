interface Env {
  DB: D1Database
  VISIT_RATE_LIMITER: RateLimit
  ALLOWED_ORIGINS: string
  VISITOR_HASH_PEPPER: string
  ADMIN_IP: string
}

type VisitBody = {
  visitor_id?: unknown
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }
const MAX_BODY_BYTES = 256
const VISITOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const json = (body: unknown, status = 200, origin?: string) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...JSON_HEADERS,
    ...(origin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    } : {}),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
})

const allowedOrigin = (request: Request, env: Env) => {
  const origin = request.headers.get('Origin') ?? ''
  const allowed = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
  return allowed.includes(origin) ? origin : null
}

const seoulDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

const hashVisitor = async (visitorId: string, pepper: string) => {
  const input = new TextEncoder().encode(`${pepper}:${visitorId}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const readLimitedBody = async (request: Request) => {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const combined = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(combined)
}

const readCounts = async (env: Env, day: string) => {
  const [daily, total] = await env.DB.batch([
    env.DB.prepare('SELECT visitor_count FROM daily_counts WHERE day = ?').bind(day),
    env.DB.prepare('SELECT visitor_count FROM global_counts WHERE id = 1'),
  ])
  return {
    today: Number(daily.results[0]?.visitor_count ?? 0),
    total: Number(total.results[0]?.visitor_count ?? 0),
  }
}

const recordVisit = async (request: Request, env: Env, origin: string) => {
  const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const day = seoulDate()
  if (clientIp === env.ADMIN_IP) return json(await readCounts(env, day), 200, origin)

  const rateLimit = await env.VISIT_RATE_LIMITER.limit({ key: clientIp })
  if (!rateLimit.success) return json({ error: 'Too many requests.' }, 429, origin)

  let body: VisitBody
  try {
    const rawBody = await readLimitedBody(request)
    if (rawBody === null) return json({ error: 'Request body is too large.' }, 413, origin)
    body = JSON.parse(rawBody) as VisitBody
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin)
  }

  if (typeof body.visitor_id !== 'string' || !VISITOR_ID_PATTERN.test(body.visitor_id)) {
    return json({ error: 'Invalid visitor identifier.' }, 400, origin)
  }

  const visitorHash = await hashVisitor(body.visitor_id, env.VISITOR_HASH_PEPPER)
  const now = new Date().toISOString()
  const [lifetimeInsert, dailyInsert] = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO lifetime_visitors (visitor_hash, first_seen_at) VALUES (?, ?)').bind(visitorHash, now),
    env.DB.prepare('INSERT OR IGNORE INTO daily_visitors (day, visitor_hash, first_seen_at) VALUES (?, ?, ?)').bind(day, visitorHash, now),
  ])

  const updates: D1PreparedStatement[] = []
  if ((lifetimeInsert.meta.changes ?? 0) > 0) {
    updates.push(env.DB.prepare('UPDATE global_counts SET visitor_count = visitor_count + 1 WHERE id = 1'))
  }
  if ((dailyInsert.meta.changes ?? 0) > 0) {
    updates.push(env.DB.prepare(`
      INSERT INTO daily_counts (day, visitor_count) VALUES (?, 1)
      ON CONFLICT(day) DO UPDATE SET visitor_count = visitor_count + 1
    `).bind(day))
  }
  if (updates.length) await env.DB.batch(updates)

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
    },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env)
    if (!origin) return json({ error: 'Origin is not allowed.' }, 403)

    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    })
    if (request.method === 'POST' && url.pathname === '/visit') return recordVisit(request, env, origin)
    return json({ error: 'Not found.' }, 404, origin)
  },
} satisfies ExportedHandler<Env>
