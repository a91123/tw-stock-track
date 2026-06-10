export const config = { runtime: 'edge' }

// Proxy for Taiwan Stock Exchange (TWSE) official after-trading data.
// Returns daily OHLCV for one month per request.
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const stockNo = url.searchParams.get('stockNo') ?? ''
  const date = url.searchParams.get('date') ?? '' // YYYYMMDD, e.g. "20260601"

  const target =
    `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY` +
    `?stockNo=${encodeURIComponent(stockNo)}&date=${date}&response=json`

  const upstream = await fetch(target, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  })
  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
