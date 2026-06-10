import { StockPrice } from '../types'

// Per-month cache.
// Key: "twse:STOCK:YYYY-MM" or "tpex:STOCK:YYYY-MM"
// Past months are cached forever (historical data never changes).
// Current month refreshes every 30 minutes (new trades arrive through the day).
interface MonthEntry { prices: StockPrice[]; fetchedAt: number }
const monthCache = new Map<string, MonthEntry>()
const CURRENT_TTL = 30 * 60 * 1000

function isPast(year: number, month: number): boolean {
  const now = new Date()
  return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)
}

// "115/06/09"  →  "2026-06-09"
function rocToISO(rocDate: string): string {
  const [y, m, d] = rocDate.split('/')
  return `${parseInt(y, 10) + 1911}-${m}-${d}`
}

async function fetchTWSEMonth(stockCode: string, year: number, month: number): Promise<StockPrice[]> {
  const key = `twse:${stockCode}:${year}-${String(month).padStart(2, '0')}`
  const cached = monthCache.get(key)
  if (cached && (isPast(year, month) || Date.now() - cached.fetchedAt < CURRENT_TTL)) return cached.prices

  try {
    const date = `${year}${String(month).padStart(2, '0')}01`
    const res = await fetch(`/api/twse?stockNo=${encodeURIComponent(stockCode)}&date=${date}`)
    if (!res.ok) return []

    const json = await res.json() as { stat: string; fields?: string[]; data?: string[][] }
    if (json.stat !== 'OK' || !json.data?.length || !json.fields) return []

    const closeIdx = json.fields.indexOf('收盤價')
    if (closeIdx === -1) return []

    const prices: StockPrice[] = json.data.flatMap(row => {
      const raw = row[closeIdx].replace(/,/g, '').trim()
      if (!raw || raw === '--') return []
      const close = parseFloat(raw)
      return isNaN(close) ? [] : [{ date: rocToISO(row[0]), close }]
    })

    monthCache.set(key, { prices, fetchedAt: Date.now() })
    return prices
  } catch {
    return []
  }
}

async function fetchTPExMonth(stockCode: string, year: number, month: number): Promise<StockPrice[]> {
  const key = `tpex:${stockCode}:${year}-${String(month).padStart(2, '0')}`
  const cached = monthCache.get(key)
  if (cached && (isPast(year, month) || Date.now() - cached.fetchedAt < CURRENT_TTL)) return cached.prices

  try {
    // TPEX uses ROC calendar in the date parameter
    const rocYear = year - 1911
    const d = `${rocYear}/${String(month).padStart(2, '0')}/01`
    const res = await fetch(`/api/tpex?stkno=${encodeURIComponent(stockCode)}&d=${encodeURIComponent(d)}`)
    if (!res.ok) return []

    const json = await res.json() as { iTotalRecords?: number; aaData?: string[][] }
    if (!json.aaData?.length) return []

    // TPEX aaData column order: 日期(0) 成交股數(1) 成交金額(2) 開盤(3) 最高(4) 最低(5) 收盤(6) 漲跌(7) 筆數(8)
    const prices: StockPrice[] = json.aaData.flatMap(row => {
      const raw = row[6]?.replace(/,/g, '').trim()
      if (!raw || raw === '--') return []
      const close = parseFloat(raw)
      return isNaN(close) ? [] : [{ date: rocToISO(row[0]), close }]
    })

    monthCache.set(key, { prices, fetchedAt: Date.now() })
    return prices
  } catch {
    return []
  }
}

async function collectAllMonths(
  fetcher: (year: number, month: number) => Promise<StockPrice[]>,
  fromDate: string,
): Promise<StockPrice[]> {
  const from = new Date(fromDate)
  const today = new Date()

  const months: { year: number; month: number }[] = []
  let cur = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth(), 1)
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  // Browser naturally limits concurrent fetches to ~6; no manual batching needed
  const results = await Promise.all(months.map(({ year, month }) => fetcher(year, month)))
  return results
    .flat()
    .filter(p => p.date >= fromDate)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchStockPrices(
  stockCode: string,
  fromDate: string,
  forceRefresh = false,
): Promise<StockPrice[]> {
  if (forceRefresh) clearPriceCache(stockCode)

  // Try TWSE (listed stocks) first, fall back to TPEx (OTC stocks)
  let prices = await collectAllMonths((y, m) => fetchTWSEMonth(stockCode, y, m), fromDate)

  if (prices.length === 0) {
    prices = await collectAllMonths((y, m) => fetchTPExMonth(stockCode, y, m), fromDate)
  }

  if (prices.length === 0) throw new Error(`查無股票 ${stockCode}`)

  return prices
}

export function clearPriceCache(stockCode?: string) {
  if (stockCode) {
    for (const key of [...monthCache.keys()]) {
      if (key.includes(`:${stockCode}:`)) monthCache.delete(key)
    }
  } else {
    monthCache.clear()
  }
}
