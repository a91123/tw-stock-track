import type { VercelRequest, VercelResponse } from '@vercel/node'

// 櫃買中心配息 API 沒有開放 CORS，由這個函式代理。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code } = req.query
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'missing code' })
  }

  try {
    const upstream = await fetch(
      `https://www.tpex.org.tw/www/zh-tw/exRight/exDividend` +
      `?code=${encodeURIComponent(code)}&response=json`,
    )
    if (!upstream.ok) {
      return res.status(502).json({ error: `TPEx ${upstream.status}` })
    }
    const json = await upstream.json()
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(json)
  } catch {
    return res.status(502).json({ error: 'TPEx unreachable' })
  }
}
