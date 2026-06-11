import type { VercelRequest, VercelResponse } from '@vercel/node'

// 證交所 MIS 行情站代理 — 盤中即時報價（約 5-10 秒快照）。
// MIS 沒開 CORS 且需要 Referer，由伺服器端代為呼叫。
// 支援批次：ex_ch=tse_2330.tw|otc_6488.tw
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { ex_ch } = req.query
  if (typeof ex_ch !== 'string' || !/^[a-z0-9_.|A-Z]+$/.test(ex_ch)) {
    return res.status(400).json({ error: 'missing or invalid ex_ch' })
  }

  try {
    const upstream = await fetch(
      `https://mis.twse.com.tw/stock/api/getStockInfo.jsp` +
      `?ex_ch=${encodeURIComponent(ex_ch)}&json=1&delay=0`,
      { headers: { Referer: 'https://mis.twse.com.tw/stock/index.jsp' } },
    )
    if (!upstream.ok) {
      return res.status(502).json({ error: `MIS ${upstream.status}` })
    }
    const json = (await upstream.json()) as { msgArray?: unknown[] }

    // 即時資料只短暫快取 10 秒，讓同持股清單的多個分頁/使用者共享
    if (json.msgArray?.length) {
      res.setHeader('Cache-Control', 'public, s-maxage=10')
    } else {
      res.setHeader('Cache-Control', 'no-store')
    }
    return res.status(200).json(json)
  } catch {
    return res.status(502).json({ error: 'MIS unreachable' })
  }
}
