export const config = { runtime: 'edge' }

// Proxy for Taipei Exchange (TPEx / OTC market) after-trading data.
// Returns daily OHLCV for one month per request.
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const stkno = url.searchParams.get('stkno') ?? ''
  const d = url.searchParams.get('d') ?? '' // ROC date, e.g. "115/06/01"

  const target =
    `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php` +
    `?l=zh-tw&d=${encodeURIComponent(d)}&stkno=${encodeURIComponent(stkno)}&o=json`

  const upstream = await fetch(target, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  })
  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
