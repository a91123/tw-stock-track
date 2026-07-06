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

// 實際除息結果，date 即除息日。平準金/資本公積配息在 TaiwanStockDividend
// 會是 0，這個 dataset 一定有金額，但只精確到小數兩位。
interface FinMindDividendResult {
  stock_id: string
  date: string
  stock_and_cache_dividend: number
  stock_or_cache_dividend: string // '息' 現金股利 / '權' 股票股利
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
    const [announced, results] = await Promise.all([
      fetchDataset<FinMindDividend>('TaiwanStockDividend', stockCode),
      fetchDataset<FinMindDividendResult>('TaiwanStockDividendResult', stockCode),
    ])

    // 除息日 → 每股現金股利。先墊 Result（實際除息，一定有金額），
    // 再用 TaiwanStockDividend 覆蓋（含未來已公告場次，金額較精確）。
    const merged = new Map<string, number>()
    for (const r of results) {
      if (!r.stock_or_cache_dividend?.includes('息')) continue
      if (r.date && r.stock_and_cache_dividend > 0) merged.set(r.date, r.stock_and_cache_dividend)
    }
    for (const d of announced) {
      if (!d.CashExDividendTradingDate || d.CashExDividendTradingDate === '0000-00-00') continue
      const cash = (d.CashEarningsDistribution ?? 0) + (d.CashStatutorySurplus ?? 0) + (d.CashCapitalReserveDistribution ?? 0)
      if (cash > 0) merged.set(d.CashExDividendTradingDate, cash)
    }

    const data = [...merged.entries()]
      .map(([exDate, cashPerShare]) => ({ stockCode, exDate, cashPerShare }))
      .sort((a, b) => a.exDate.localeCompare(b.exDate))

    try { localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() } satisfies DivCache)) } catch { /* ignore quota */ }
    return data
  } catch {
    return []
  }
}

async function fetchDataset<T>(dataset: string, stockCode: string): Promise<T[]> {
  const res = await fetch(
    `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${encodeURIComponent(stockCode)}&start_date=2015-01-01`,
  )
  if (!res.ok) return []
  const json = (await res.json()) as { status: number; data: T[] }
  return json.status === 200 ? json.data : []
}

export function clearDividendCache(stockCode: string) {
  localStorage.removeItem(`div_cache_${stockCode}`)
}
