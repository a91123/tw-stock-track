import type { VercelRequest, VercelResponse } from '@vercel/node'

// 櫃買中心的 API 沒有開放 CORS，瀏覽器無法直接呼叫 — 由這個函式代理。
// 不需要任何金鑰，純轉發。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, date } = req.query
  if (typeof code !== 'string' || typeof date !== 'string') {
    return res.status(400).json({ error: 'missing code or date' })
  }

  try {
    const upstream = await fetch(
      `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock` +
      `?code=${encodeURIComponent(code)}&date=${encodeURIComponent(date)}&response=json`,
    )
    if (!upstream.ok) {
      return res.status(502).json({ error: `TPEx ${upstream.status}` })
    }
    const json = (await upstream.json()) as { tables?: { data?: unknown[] }[] }
    // 只快取「真的有資料」的回應，空回應可能是上游異常，不能污染 CDN
    if (json.tables?.[0]?.data?.length) {
      res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400')
    } else {
      res.setHeader('Cache-Control', 'no-store')
    }
    return res.status(200).json(json)
  } catch {
    return res.status(502).json({ error: 'TPEx unreachable' })
  }
}
