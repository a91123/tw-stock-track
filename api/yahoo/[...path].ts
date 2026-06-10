// Edge Runtime runs on Cloudflare's network — avoids AWS Lambda IP blocks from Yahoo Finance
export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // Strip /api/yahoo prefix, forward the rest of the path + original query string
  const targetPath = url.pathname.replace(/^\/api\/yahoo/, '')
  const targetUrl = `https://query1.finance.yahoo.com${targetPath}${url.search}`

  const upstream = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
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
