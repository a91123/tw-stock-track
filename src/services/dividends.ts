export interface DividendRecord {
  stockCode: string
  exDate: string       // YYYY-MM-DD
  cashPerShare: number // 每股現金股利
}

interface FinMindDividend {
  stock_id: string
  CashExDividendTradingDate: string
  CashEarningsDistribution: number
  CashStatutorySurplus: number
  CashCapitalReserveDistribution: number  // 現金資本公積，高息ETF主要來源
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 天

interface DivCache {
  data: DividendRecord[]
  ts: number
}

export async function fetchDividends(stockCode: string): Promise<DividendRecord[]> {
  const cacheKey = `div_cache_${stockCode}`
  try {
    const raw = localStorage.getItem(cacheKey)
    if (raw) {
      const cached: DivCache = JSON.parse(raw)
      if (Date.now() - cached.ts < CACHE_TTL) return cached.data
    }
  } catch { /* ignore corrupt cache */ }

  try {
    const res = await fetch(
      `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividend&data_id=${encodeURIComponent(stockCode)}&start_date=2015-01-01`,
    )
    if (!res.ok) return []
    const json = (await res.json()) as { status: number; data: FinMindDividend[] }
    if (json.status !== 200) return []

    const data = json.data
      .filter(d => d.CashExDividendTradingDate && d.CashExDividendTradingDate !== '0000-00-00')
      .map(d => ({
        stockCode,
        exDate: d.CashExDividendTradingDate,
        cashPerShare: (d.CashEarningsDistribution ?? 0) + (d.CashStatutorySurplus ?? 0) + (d.CashCapitalReserveDistribution ?? 0),
      }))
      .filter(d => d.cashPerShare > 0)

    try { localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() } satisfies DivCache)) } catch { /* ignore quota */ }
    return data
  } catch {
    return []
  }
}

export function clearDividendCache(stockCode: string) {
  localStorage.removeItem(`div_cache_${stockCode}`)
}
