import type { VercelRequest, VercelResponse } from '@vercel/node'

// 證交所 STOCK_DAY 代理。
// 重點：TWSE 被限流時會回 HTTP 200 + stat 帶「查詢過於頻繁」訊息，
// 這種回應絕對不能進 CDN 快取，否則會污染所有使用者 30 分鐘 — 改回 429。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { stockNo, date } = req.query
  if (typeof stockNo !== 'string' || typeof date !== 'string') {
    return res.status(400).json({ error: 'missing stockNo or date' })
  }

  try {
    const upstream = await fetch(
      `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY` +
      `?stockNo=${encodeURIComponent(stockNo)}&date=${encodeURIComponent(date)}&response=json`,
    )
    if (!upstream.ok) {
      return res.status(502).json({ error: `TWSE ${upstream.status}` })
    }
    const json = (await upstream.json()) as { stat?: string }

    // 合法回應只有兩種：有資料（OK）或真的查無資料；其他都當限流處理
    const stat = json.stat ?? ''
    if (stat !== 'OK' && !stat.includes('沒有符合')) {
      return res.status(429).json({ error: 'TWSE rate limited', stat })
    }

    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400')
    return res.status(200).json(json)
  } catch {
    return res.status(502).json({ error: 'TWSE unreachable' })
  }
}
