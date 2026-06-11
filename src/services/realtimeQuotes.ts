// 盤中即時報價：證交所 MIS 行情站（經 api/mis.ts 代理）
// 一個請求批次查詢所有持股，回傳 Map<股票代碼, 現價>

export interface StockSymbol {
  code: string
  market: 'tse' | 'otc'
}

interface MisItem {
  c?: string  // 股票代碼
  z?: string  // 最新成交價（快照間隔可能是 '-'）
  b?: string  // 五檔最佳買價，'_' 分隔
}

// z 可能是 '-'（快照間隔沒有成交），備援用最佳買價
function pickPrice(item: MisItem): number | null {
  const z = parseFloat(item.z ?? '')
  if (!isNaN(z) && z > 0) return z
  const bestBid = parseFloat((item.b ?? '').split('_')[0])
  if (!isNaN(bestBid) && bestBid > 0) return bestBid
  return null
}

export async function fetchRealtimeQuotes(symbols: StockSymbol[]): Promise<Map<string, number>> {
  if (symbols.length === 0) return new Map()

  const exCh = symbols.map(s => `${s.market}_${s.code}.tw`).join('|')
  const res = await fetch(`/api/mis?ex_ch=${encodeURIComponent(exCh)}`)
  if (!res.ok) throw new Error(`MIS ${res.status}`)

  const json = (await res.json()) as { msgArray?: MisItem[] }
  const quotes = new Map<string, number>()
  for (const item of json.msgArray ?? []) {
    const price = pickPrice(item)
    if (item.c && price !== null) quotes.set(item.c, price)
  }
  return quotes
}
