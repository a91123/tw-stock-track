export const config = { runtime: 'edge' }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface Auth {
  crumb: string
  cookie: string
  at: number
}

// Warm-instance cache — Edge Functions are stateless across invocations but
// warm instances persist globals between requests.
let cached: Auth | null = null

async function getAuth(): Promise<Auth | null> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached

  try {
    // Step 1: hit the consent endpoint to get session cookies
    const r1 = await fetch('https://fc.yahoo.com/', {
      redirect: 'manual',
      headers: { 'User-Agent': UA },
    })
    const cookie = r1.headers.get('set-cookie') ?? ''

    // Step 2: exchange cookies for a crumb
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': cookie },
    })
    if (!r2.ok) return null
    const crumb = (await r2.text()).trim()
    // Crumbs are short strings like "8eLFBHBbzT2"; reject if we got HTML back
    if (!crumb || crumb.length > 30 || crumb.includes('<')) return null

    cached = { crumb, cookie, at: Date.now() }
    return cached
  } catch {
    return null
  }
}

const BASE = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com',
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const targetPath = url.pathname.replace(/^\/api\/yahoo/, '')

  // Attempt crumb auth once
  const auth = await getAuth()

  let search = url.search
  if (auth?.crumb) {
    const sep = search ? '&' : '?'
    search += `${sep}crumb=${encodeURIComponent(auth.crumb)}`
  }

  const headers: Record<string, string> = { ...BASE }
  if (auth?.cookie) headers['Cookie'] = auth.cookie

  // Prefer query2 (different IP pool) — fall back to query1
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    const upstream = await fetch(`https://${host}${targetPath}${search}`, { headers })
    if (upstream.ok || upstream.status !== 503) {
      const body = await upstream.text()
      return new Response(body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
  }

  // Both hosts returned 503
  return new Response(JSON.stringify({ error: 'upstream unavailable' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
