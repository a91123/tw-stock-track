import { StockPrice } from '../types'

const CACHE_KEY_PREFIX = 'tw-adj-price-v1-'
const TTL = 12 * 60 * 60 * 1000 // 12 hours

interface CacheEntry {
  prices: StockPrice[]
  fromDate: string
  fetchedAt: number
}

function readCache(code: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + code)
    if (!raw) return null
    return JSON.parse(raw) as CacheEntry
  } catch {
    return null
  }
}

function writeCache(code: string, entry: CacheEntry) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + code, JSON.stringify(entry))
  } catch { /* quota */ }
}

// 偵測 >40% 單日價格跳動（股票分割），將分割前所有歷史價格乘以同樣倍率
function adjustForSplits(sorted: StockPrice[]): StockPrice[] {
  if (sorted.length < 2) return sorted
  const result = sorted.map(p => ({ ...p }))
  for (let i = 1; i < result.length; i++) {
    if (result[i - 1].close === 0) continue
    const ratio = result[i].close / result[i - 1].close
    if (ratio < 0.6 || ratio > 1.65) {
      for (let j = 0; j < i; j++) {
        result[j] = { ...result[j], close: result[j].close * ratio }
      }
    }
  }
  return result
}

export function clearAdjustedPriceCache(code: string) {
  localStorage.removeItem(CACHE_KEY_PREFIX + code)
}

export async function fetchAdjustedPrices(code: string, fromDate: string): Promise<StockPrice[]> {
  const entry = readCache(code)
  if (
    entry &&
    Date.now() - entry.fetchedAt < TTL &&
    entry.fromDate <= fromDate
  ) {
    return entry.prices.filter(p => p.date >= fromDate)
  }

  const fetchFrom = entry && entry.fromDate < fromDate ? entry.fromDate : fromDate

  // TaiwanStockPrice = free tier; provides daily close prices
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(code)}&start_date=${fetchFrom}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FinMind error: ${res.status}`)

  const json = (await res.json()) as {
    status: number
    data: { date: string; close: number }[]
  }
  if (json.status !== 200 || !json.data?.length) return []

  const raw = json.data
    .map(d => ({ date: d.date, close: d.close }))
    .filter(p => p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  const prices = adjustForSplits(raw)

  writeCache(code, { prices, fromDate: fetchFrom, fetchedAt: Date.now() })

  return prices.filter(p => p.date >= fromDate)
}
