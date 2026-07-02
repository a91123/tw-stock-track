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

  // If we have older cache that covers even earlier dates, keep that range
  const fetchFrom = entry && entry.fromDate < fromDate ? entry.fromDate : fromDate

  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPriceAdj&data_id=${encodeURIComponent(code)}&start_date=${fetchFrom}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FinMind error: ${res.status}`)

  const json = (await res.json()) as {
    status: number
    data: { date: string; close?: number; Close?: number }[]
  }
  if (json.status !== 200 || !json.data?.length) return []

  const prices: StockPrice[] = json.data
    .map(d => ({ date: d.date, close: d.close ?? d.Close ?? 0 }))
    .filter(p => p.close > 0)

  writeCache(code, { prices, fromDate: fetchFrom, fetchedAt: Date.now() })

  return prices.filter(p => p.date >= fromDate)
}
