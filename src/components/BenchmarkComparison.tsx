import { useState, useEffect, useMemo } from 'react'
import { fetchAdjustedPrices, clearAdjustedPriceCache } from '../services/adjustedPrices'
import { fetchDividends, clearDividendCache, DividendRecord } from '../services/dividends'
import { StockPrice, StockDetail } from '../types'

interface Props {
  firstBuyDate: string
  portfolioReturn: number
  pricesByStock: Map<string, Map<string, number>>
  holdings: StockDetail[]
}

type Period = '1M' | '3M' | '6M' | '1Y' | '3Y' | 'all'

const PERIODS: { key: Period; label: string; days: number | null }[] = [
  { key: '1M',  label: '1月',  days: 30   },
  { key: '3M',  label: '3月',  days: 90   },
  { key: '6M',  label: '6月',  days: 180  },
  { key: '1Y',  label: '1年',  days: 365  },
  { key: '3Y',  label: '3年',  days: 1095 },
  { key: 'all', label: '全期', days: null },
]

const DEFAULT_CODE = '0050'

interface BenchmarkResult {
  returnPct: number
  actualStartDate: string
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function subtractDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toDateStr(d)
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}

/** 從已載入的資料中計算指定區間的含股利報酬（同步，無網路請求） */
function computeBenchmarkReturn(
  prices: StockPrice[],
  dividends: DividendRecord[],
  fromDate: string,
): BenchmarkResult | null {
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))

  const startEntry = sorted.find(p => p.date >= fromDate)
  const endEntry = sorted[sorted.length - 1]
  if (!startEntry || !endEntry || startEntry.date === endEntry.date) return null

  const daysDiff = (new Date(startEntry.date).getTime() - new Date(fromDate).getTime()) / 86400000
  if (daysDiff > 45) return null

  const cumDiv = dividends
    .filter(d => d.exDate >= fromDate)
    .reduce((sum, d) => sum + d.cashPerShare, 0)

  return {
    returnPct: ((endEntry.close + cumDiv - startEntry.close) / startEntry.close) * 100,
    actualStartDate: startEntry.date,
  }
}

/** 期間組合報酬：現在持股數 × fromDate 股價 → 現價 */
function calcPortfolioReturn(
  pricesByStock: Map<string, Map<string, number>>,
  holdings: StockDetail[],
  fromDate: string,
): number | null {
  let startValue = 0
  let endValue = 0

  for (const h of holdings) {
    if (h.currentPrice === null || h.totalShares <= 0) continue
    const priceMap = pricesByStock.get(h.stockCode)
    if (!priceMap) continue

    const dates = [...priceMap.keys()].sort()
    const startDateKey = dates.find(d => d >= fromDate)
    if (!startDateKey) continue

    const startPrice = priceMap.get(startDateKey)!
    startValue += h.totalShares * startPrice
    endValue += h.totalShares * h.currentPrice
  }

  if (startValue <= 0) return null
  return ((endValue - startValue) / startValue) * 100
}

export default function BenchmarkComparison({
  firstBuyDate,
  portfolioReturn,
  pricesByStock,
  holdings,
}: Props) {
  const [period, setPeriod] = useState<Period>('all')
  const [benchmarkCode, setBenchmarkCode] = useState(DEFAULT_CODE)
  const [inputCode, setInputCode] = useState('')

  // 一次載入最長區間的資料，切期間不重新抓
  const [benchmarkPrices, setBenchmarkPrices] = useState<StockPrice[]>([])
  const [benchmarkDivs, setBenchmarkDivs] = useState<DividendRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!firstBuyDate) return
    setLoading(true)
    setErrorMsg(null)
    // 取「3 年前」與「firstBuyDate」的較早者，確保每個期間都有足夠的歷史資料
    const fetchFrom = subtractDays(3 * 365) < firstBuyDate
      ? subtractDays(3 * 365)
      : firstBuyDate
    Promise.all([
      fetchAdjustedPrices(benchmarkCode, fetchFrom),
      fetchDividends(benchmarkCode),
    ])
      .then(([prices, divs]) => {
        if (prices.length === 0) { setErrorMsg('notfound'); return }
        setBenchmarkPrices(prices)
        setBenchmarkDivs(divs)
      })
      .catch(() => setErrorMsg('notfound'))
      .finally(() => setLoading(false))
  }, [firstBuyDate, benchmarkCode, retryCount])

  // 基準從期間起點算（可早於 firstBuyDate）
  function getBenchmarkFromDate(): string {
    if (period === 'all') return firstBuyDate
    return subtractDays(PERIODS.find(p => p.key === period)!.days!)
  }

  // 組合只能從 firstBuyDate 算（買之前沒有部位）
  function getPortfolioFromDate(): string {
    if (period === 'all') return firstBuyDate
    return maxDate(subtractDays(PERIODS.find(p => p.key === period)!.days!), firstBuyDate)
  }

  // 切期間從記憶體算，不觸發 loading
  const result = useMemo<BenchmarkResult | null>(() => {
    if (benchmarkPrices.length === 0) return null
    return computeBenchmarkReturn(benchmarkPrices, benchmarkDivs, getBenchmarkFromDate())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkPrices, benchmarkDivs, period, firstBuyDate])

  function handleCompare() {
    const code = inputCode.trim().toUpperCase()
    if (!code) return
    setBenchmarkCode(code)
    setInputCode('')
    setBenchmarkPrices([])
    setBenchmarkDivs([])
    setErrorMsg(null)
  }

  function handleRetry() {
    clearAdjustedPriceCache(benchmarkCode)
    clearDividendCache(benchmarkCode)
    setBenchmarkPrices([])
    setBenchmarkDivs([])
    setErrorMsg(null)
    setRetryCount(c => c + 1)
  }

  const portfolioFromDate = getPortfolioFromDate()
  const activePortfolioReturn = period === 'all'
    ? portfolioReturn
    : calcPortfolioReturn(pricesByStock, holdings, portfolioFromDate)

  // 當期間超出持倉時間，組合 fromDate 被鎖在 firstBuyDate
  const portfolioCapped = period !== 'all' &&
    subtractDays(PERIODS.find(p => p.key === period)!.days!) < firstBuyDate

  const benchmarkReturn = result?.returnPct ?? null
  const diff = (benchmarkReturn !== null && activePortfolioReturn !== null)
    ? activePortfolioReturn - benchmarkReturn
    : null
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
  const color = (n: number) => n >= 0 ? 'text-green-600' : 'text-red-500'
  const isDefault = benchmarkCode === DEFAULT_CODE

  const incompleteForPeriod = !loading && !errorMsg && result === null && benchmarkPrices.length > 0

  function fmtPeriod(dateStr: string) {
    return dateStr.slice(0, 7).replace('-', '/')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          績效 vs {isDefault ? '大盤（0050）' : benchmarkCode} 含股利
        </h3>
        {!isDefault && (
          <button
            onClick={() => { setBenchmarkCode(DEFAULT_CODE); setBenchmarkPrices([]); setBenchmarkDivs([]) }}
            className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
          >
            回到大盤
          </button>
        )}
      </div>

      {/* 期間選擇 */}
      <div className="flex gap-1 mb-3">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              period === p.key
                ? 'bg-teal-600 text-white border-teal-600'
                : 'border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-xs text-gray-400">載入中…</div>
      ) : errorMsg === 'notfound' ? (
        <div className="space-y-1.5">
          <div className="text-xs text-red-400">找不到 {benchmarkCode} 資料</div>
          <button
            onClick={handleRetry}
            disabled={loading}
            className="text-xs text-teal-600 hover:text-teal-800 underline underline-offset-2 disabled:opacity-40"
          >
            重新整理
          </button>
        </div>
      ) : incompleteForPeriod ? (
        <div className="text-xs space-y-1.5">
          <p className="text-amber-500">
            ⚠ {benchmarkCode} 此區間資料不完整，數字可能偏低
          </p>
          <button
            onClick={handleRetry}
            disabled={loading}
            className="text-xs text-teal-600 hover:text-teal-800 underline underline-offset-2 disabled:opacity-40"
          >
            {loading ? '查詢中…' : '清除快取並重新查詢'}
          </button>
        </div>
      ) : benchmarkReturn === null ? (
        <div className="text-xs text-gray-400">查無 {benchmarkCode} 資料</div>
      ) : (
        <>
          <div className="flex items-stretch gap-3">
            <div className="flex-1 bg-teal-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">我的投資組合</div>
              {activePortfolioReturn !== null ? (
                <div className={`text-xl font-bold ${color(activePortfolioReturn)}`}>
                  {fmt(activePortfolioReturn)}
                </div>
              ) : (
                <div className="text-sm text-gray-400">—</div>
              )}
            </div>
            <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">{benchmarkCode} 含股利</div>
              <div className={`text-xl font-bold ${color(benchmarkReturn)}`}>{fmt(benchmarkReturn)}</div>
            </div>
            {diff !== null && (
              <div className={`flex-1 rounded-lg p-3 text-center ${diff >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="text-xs text-gray-500 mb-1">超越對手</div>
                <div className={`text-xl font-bold ${color(diff)}`}>{fmt(diff)}</div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">
              {result && <>基準：{fmtPeriod(result.actualStartDate)} 起（以收盤價計算，非成本報酬）</>}
              {portfolioCapped && (
                <span className="text-amber-500 ml-2">
                  組合持倉未滿 {PERIODS.find(p => p.key === period)!.label}，以 {fmtPeriod(firstBuyDate)} 起計
                </span>
              )}
            </p>
            <button
              onClick={handleRetry}
              disabled={loading}
              className="text-xs text-gray-300 hover:text-teal-600 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              title="數字不對？清除快取重新抓"
            >
              {loading ? '查詢中…' : '重新整理'}
            </button>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 mt-3">
        <input
          type="text"
          value={inputCode}
          onChange={e => setInputCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCompare()}
          placeholder="輸入股票代碼對比（如 2330、00919）"
          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
        />
        <button
          onClick={handleCompare}
          disabled={!inputCode.trim()}
          className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
        >
          對比
        </button>
      </div>
      <p className="text-xs text-gray-300 mt-1.5">以首筆買入日為基準，含股利總報酬</p>
    </div>
  )
}
