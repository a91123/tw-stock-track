export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // Yahoo Finance path is passed as ?path=... to avoid Vercel treating
  // ticker symbols with dot-extensions (e.g. 00981A.TW) as static files.
  const yPath = url.searchParams.get('path') ?? ''
  url.searchParams.delete('path')

  const targetUrl = `https://query2.finance.yahoo.com${yPath}${url.search}`

  const upstream = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://finance.yahoo.com',
    },
  })

  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
