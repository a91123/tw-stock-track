export default async function handler(req: any, res: any) {
  // req.query.path is string[] from the catch-all route
  const { path, ...queryParams } = req.query as Record<string, string | string[]>

  const pathStr = Array.isArray(path) ? path.join('/') : (path ?? '')

  const qs = new URLSearchParams(
    Object.entries(queryParams).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map(i => [k, i]) : [[k, String(v ?? '')]]
    )
  ).toString()

  const targetUrl = `https://query1.finance.yahoo.com/${pathStr}${qs ? '?' + qs : ''}`

  const upstream = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  })

  const body = await upstream.text()
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
  res.status(upstream.status).send(body)
}
