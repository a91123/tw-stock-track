import { StockPrice } from '../types'

// 台股每日收盤價：證交所 (TWSE) + 櫃買中心 (TPEx) 官方 API
//
// 以「月」為單位快取並持久化到 localStorage：
// - 過去月份的歷史資料永遠不變 → 永久快取，整個 app 生命週期只抓一次
// - 當月資料每 30 分鐘過期重抓
// 所有對外請求經過全域節流（每個請求間隔 350ms）+ 失敗重試，避免被證交所限流。

// v3: 舊版曾把證交所限流時的「偽裝成查無資料」回應存進快取 — 換 key 作廢舊資料
const CACHE_KEY = 'tw-stock-price-month-cache-v3'
const CURRENT_TTL = 30 * 60 * 1000
// 查無資料的月份（掛牌前、下市後）也快取，但給較短的 TTL：
// 永不快取會讓這些月份每次開 app 都重查，反而把證交所打到限流
const EMPTY_TTL = 6 * 60 * 60 * 1000
const REQUEST_GAP = 600
const MAX_RETRIES = 2
// 連線層級失敗（被封鎖/斷線）後的冷卻時間 — 期間內所有請求直接快速失敗
const CIRCUIT_COOLDOWN = 60 * 1000

export class PriceFetchError extends Error {}

interface MonthEntry {
  prices: StockPrice[]
  fetchedAt: number
}

const monthCache: Map<string, MonthEntry> = (() => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return new Map()
    return new Map(Object.entries(JSON.parse(raw) as Record<string, MonthEntry>))
  } catch {
    return new Map()
  }
})()

function persistCache(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(monthCache)))
  } catch {
    // localStorage 滿了 — 記憶體快取仍然有效，只是下次開啟要重抓
  }
}

function isPast(year: number, month: number): boolean {
  const now = new Date()
  return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)
}

function cacheGet(key: string, year: number, month: number): StockPrice[] | null {
  const entry = monthCache.get(key)
  if (!entry) return null
  const age = Date.now() - entry.fetchedAt
  if (entry.prices.length === 0) {
    // 空結果只信任一段時間：過去月份 6 小時、當月 30 分鐘。
    // 限流偽裝成「查無資料」時最多錯 6 小時，會自我修復；
    // 但不能永不快取 — 掛牌前的月份每次重查會把證交所打到封鎖
    return age < (isPast(year, month) ? EMPTY_TTL : CURRENT_TTL) ? entry.prices : null
  }
  if (isPast(year, month) || age < CURRENT_TTL) return entry.prices
  return null
}

function cacheSet(key: string, prices: StockPrice[]): void {
  monthCache.set(key, { prices, fetchedAt: Date.now() })
  persistCache()
}

// "115/06/09"  →  "2026-06-09"
function rocToISO(rocDate: string): string {
  const [y, m, d] = rocDate.split('/')
  return `${parseInt(y, 10) + 1911}-${m}-${d}`
}

// 全域節流：所有對證交所/櫃買的請求依序排隊，彼此間隔 REQUEST_GAP
let nextSlot = 0
async function throttle(): Promise<void> {
  const now = Date.now()
  const wait = Math.max(0, nextSlot - now)
  nextSlot = Math.max(now, nextSlot) + REQUEST_GAP
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
}

// 斷路器：一個請求重試到死都連不上，代表整個來源被封鎖了，
// 冷卻期間內排隊中的其他請求直接快速失敗，不要繼續轟炸讓封鎖加劇
let circuitOpenUntil = 0

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    if (Date.now() < circuitOpenUntil) {
      throw new PriceFetchError('股價伺服器連線失敗（可能暫時被限流），請等一分鐘後再試')
    }
    await throttle()
    if (Date.now() < circuitOpenUntil) {
      throw new PriceFetchError('股價伺服器連線失敗（可能暫時被限流），請等一分鐘後再試')
    }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch {
      if (attempt >= MAX_RETRIES) {
        circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN
        throw new PriceFetchError('股價伺服器連線失敗（可能暫時被限流），請稍後再試')
      }
      // 退避後重試：1s、2s
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
}

function parseClose(raw: string | undefined): number | null {
  const cleaned = raw?.replace(/,/g, '').trim()
  if (!cleaned || cleaned === '--') return null
  const close = parseFloat(cleaned)
  return isNaN(close) ? null : close
}

async function fetchTWSEMonth(stockCode: string, year: number, month: number): Promise<StockPrice[]> {
  const key = `twse:${stockCode}:${year}-${String(month).padStart(2, '0')}`
  const cached = cacheGet(key, year, month)
  if (cached) return cached

  // 證交所有開 CORS，瀏覽器直連 — 千萬不要走伺服器代理：
  // 證交所會封鎖海外機房 IP（Vercel 函式打不進去），使用者自己的 IP 反而暢通
  const date = `${year}${String(month).padStart(2, '0')}01`
  const json = (await fetchJson(
    `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY` +
    `?stockNo=${encodeURIComponent(stockCode)}&date=${date}&response=json`,
  )) as { stat: string; fields?: string[]; data?: string[][] }

  const stat = json.stat ?? ''
  let prices: StockPrice[] = []
  if (stat === 'OK' && json.data?.length && json.fields) {
    const closeIdx = json.fields.indexOf('收盤價')
    if (closeIdx !== -1) {
      prices = json.data.flatMap(row => {
        const close = parseClose(row[closeIdx])
        return close === null ? [] : [{ date: rocToISO(row[0]), close }]
      })
    }
  } else if (!stat.includes('沒有符合') && stat !== 'OK') {
    // 不是「查無資料」也不是 OK → 限流或異常回應，絕對不能存進快取
    throw new PriceFetchError('證交所查詢過於頻繁，請等一分鐘後再按「更新股價」')
  }

  cacheSet(key, prices)
  return prices
}

async function fetchTPExMonth(stockCode: string, year: number, month: number): Promise<StockPrice[]> {
  const key = `tpex:${stockCode}:${year}-${String(month).padStart(2, '0')}`
  const cached = cacheGet(key, year, month)
  if (cached) return cached

  // 櫃買中心 API 沒開放 CORS，瀏覽器無法直接呼叫 — 走 Vercel 函式代理 (api/tpex.ts)
  const d = `${year}/${String(month).padStart(2, '0')}/01`
  const json = (await fetchJson(
    `/api/tpex?code=${encodeURIComponent(stockCode)}&date=${encodeURIComponent(d)}&response=json`,
  )) as { tables?: { data?: string[][] }[] }

  // data 欄位順序: 日期(0) 成交仟股(1) 成交仟元(2) 開盤(3) 最高(4) 最低(5) 收盤(6) 漲跌(7) 筆數(8)
  const rows = json.tables?.[0]?.data ?? []
  const prices: StockPrice[] = rows.flatMap(row => {
    const close = parseClose(row[6])
    return close === null ? [] : [{ date: rocToISO(row[0]), close }]
  })

  cacheSet(key, prices)
  return prices
}

// toDate 省略時抓到本月（持有中的股票）；有給則抓到該月為止（已出清的股票只需要抓到最後
// 一筆交易當月，之後的股價從未被損益計算用到，抓了也是白抓，還會多打一次即時 API）
function monthsBetween(fromDate: string, toDate?: string): { year: number; month: number }[] {
  const from = new Date(fromDate)
  const to = toDate ? new Date(toDate) : new Date()
  const months: { year: number; month: number }[] = []
  let cur = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return months
}

async function collectAllMonths(
  fetcher: (year: number, month: number) => Promise<StockPrice[]>,
  fromDate: string,
  toDate?: string,
): Promise<StockPrice[]> {
  // 並發發出即可 — throttle() 會把實際請求排成序列；已快取的月份直接返回不佔節流額度
  // 注意：不要過濾掉 fromDate 之前的價格 — 若第一筆交易是「今天」（尚無收盤價），
  // 過濾會把僅有的資料全部丟光，誤判成「查無股票」。損益計算會自行對齊交易日。
  const results = await Promise.all(monthsBetween(fromDate, toDate).map(({ year, month }) => fetcher(year, month)))
  return results
    .flat()
    .sort((a, b) => a.date.localeCompare(b.date))
}

// 記錄每檔股票屬於上市 (tse) 或上櫃 (otc) — 即時報價的 MIS 查詢需要這個前綴
const stockMarkets = new Map<string, 'tse' | 'otc'>()

export function getStockMarket(stockCode: string): 'tse' | 'otc' | undefined {
  return stockMarkets.get(stockCode)
}

export async function fetchStockPrices(
  stockCode: string,
  fromDate: string,
  forceRefresh = false,
  toDate?: string,
): Promise<StockPrice[]> {
  // 強制更新只需要丟掉「當月」快取 — 過去月份的歷史資料不會變
  if (forceRefresh) {
    const now = new Date()
    const suffix = `:${stockCode}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    monthCache.delete(`twse${suffix}`)
    monthCache.delete(`tpex${suffix}`)
    persistCache()
  }

  // 先查證交所（上市），查無資料再查櫃買中心（上櫃）
  let prices = await collectAllMonths((y, m) => fetchTWSEMonth(stockCode, y, m), fromDate, toDate)
  if (prices.length > 0) {
    stockMarkets.set(stockCode, 'tse')
    return prices
  }

  prices = await collectAllMonths((y, m) => fetchTPExMonth(stockCode, y, m), fromDate, toDate)
  if (prices.length > 0) {
    stockMarkets.set(stockCode, 'otc')
    return prices
  }

  throw new Error(`查無股票 ${stockCode}`)
}

export function clearPriceCache(stockCode?: string): void {
  if (stockCode) {
    for (const key of [...monthCache.keys()]) {
      if (key.includes(`:${stockCode}:`)) monthCache.delete(key)
    }
  } else {
    monthCache.clear()
  }
  persistCache()
}
