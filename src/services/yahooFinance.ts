import { StockPrice } from '../types'

interface YahooChartResult {
  meta: { regularMarketPrice: number; currency: string; symbol: string }
  timestamp: number[]
  indicators: {
    quote: [{ close: (number | null)[] }]
  }
}

interface YahooResponse {
  chart: {
    result: YahooChartResult[] | null
    error: { code: string; description: string } | null
  }
}

const cache = new Map<string, { prices: StockPrice[]; fetchedAt: number }>()
const CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours

function rangeForDays(days: number): string {
  if (days > 730) return '5y'
  if (days > 365) return '2y'
  if (days > 180) return '1y'
  if (days > 90) return '6mo'
  if (days > 30) return '3mo'
  return '1mo'
}

export async function fetchStockPrices(
  stockCode: string,
  fromDate: string,
  forceRefresh = false,
): Promise<StockPrice[]> {
  const cacheKey = `${stockCode}:${fromDate}`
  const cached = cache.get(cacheKey)
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.prices
  }

  const days = Math.ceil((Date.now() - new Date(fromDate).getTime()) / 86400000)
  const range = rangeForDays(days + 30)

  const ticker = encodeURIComponent(`${stockCode}.TW`)
  const url = `/api/yahoo/v8/finance/chart/${ticker}?interval=1d&range=${range}`

  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

  const data: YahooResponse = await res.json()
  if (data.chart.error) throw new Error(data.chart.error.description)
  if (!data.chart.result?.length) throw new Error(`查無股票 ${stockCode}`)

  const { timestamp, indicators } = data.chart.result[0]
  const closes = indicators.quote[0].close

  const prices: StockPrice[] = []
  for (let i = 0; i < timestamp.length; i++) {
    if (closes[i] == null) continue
    const dateStr = new Date(timestamp[i] * 1000).toISOString().slice(0, 10)
    if (dateStr >= fromDate) prices.push({ date: dateStr, close: closes[i]! })
  }

  cache.set(cacheKey, { prices, fetchedAt: Date.now() })
  return prices
}

export function clearPriceCache() {
  cache.clear()
}
