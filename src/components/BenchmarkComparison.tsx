import { useState, useEffect } from 'react'
import { fetchStockPrices, clearPriceCache } from '../services/stockPrices'
import { fetchDividends, clearDividendCache } from '../services/dividends'
import { Transaction, StockDetail } from '../types'
import { getSharesOnDate } from '../utils/pnl'

interface Props {
  firstBuyDate: string
  portfolioReturn: number                              // all-time total return (已含股利)
  pricesByStock: Map<string, Map<string, number>>     // stockCode → date → close
  transactions: Transaction[]
  holdings: StockDetail[]                             // 目前持倉（含 currentPrice）
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

async function fetchTotalReturn(code: string, fromDate: string): Promise<BenchmarkResult | null> {
  const [prices, dividends] = await Promise.all([
    fetchStockPrices(code, fromDate),
    fetchDividends(code),
  ])
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

/**
 * 計算特定區間的組合報酬：
 * - 對每檔現持股：取 fromDate 當時的持股數 × 當時股價 = 期初市值
 * - 期末市值 = 現在持股數 × 現價
 * - return = (期末 - 期初) / 期初
 *
 * 不含期間內新增買進的貢獻（它們在 fromDate 持股數 = 0 所以自動排除），
 * 也不含期間內賣掉的股票（已不在 holdings 內，自動排除）。
 * 這是「現有持股從 fromDate 至今的純股價報酬」。
 */
function calcPortfolioReturn(
  pricesByStock: Map<string, Map<string, number>>,
  transactions: Transaction[],
  holdings: StockDetail[],
  fromDate: string,
): number | null {
  let startValue = 0
  let endValue = 0

  for (const h of holdings) {
    if (h.currentPrice === null || h.totalShares <= 0) continue
    const priceMap = pricesByStock.get(h.stockCode)
    if (!priceMap) continue

    // 找 fromDate 當日或之後最近的有價格日
    const dates = [...priceMap.keys()].sort()
    const startDateKey = dates.find(d => d >= fromDate)
    if (!startDateKey) continue

    const sharesOnDate = getSharesOnDate(transactions, h.stockCode, fromDate)
    if (sharesOnDate <= 0) continue

    const startPrice = priceMap.get(startDateKey)!
    startValue += sharesOnDate * startPrice
    endValue += h.totalShares * h.currentPrice
  }

  if (startValue <= 0) return null
  return ((endValue - startValue) / startValue) * 100
}

export default function BenchmarkComparison({
  firstBuyDate,
  portfolioReturn,
  pricesByStock,
  transactions,
  holdings,
}: Props) {
  const [period, setPeriod] = useState<Period>('all')
  const [benchmarkCode, setBenchmarkCode] = useState(DEFAULT_CODE)
  const [inputCode, setInputCode] = useState('')
  const [result, setResult] = useState<BenchmarkResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  function getFromDate(): string {
    if (period === 'all') return firstBuyDate
    const daysAgo = PERIODS.find(p => p.key === period)!.days!
    return maxDate(subtractDays(daysAgo), firstBuyDate)
  }

  useEffect(() => {
    if (!firstBuyDate) return
    setLoading(true)
    setErrorMsg(null)
    fetchTotalReturn(benchmarkCode, getFromDate())
      .then(r => {
        if (r !== null) {
          setResult(r)
        } else {
          setErrorMsg('incomplete')
        }
      })
      .catch(() => setErrorMsg('notfound'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstBuyDate, benchmarkCode, period, retryCount])

  function handleCompare() {
    const code = inputCode.trim().toUpperCase()
    if (!code) return
    setBenchmarkCode(code)
    setInputCode('')
    setResult(null)
    setLoading(true)
    setErrorMsg(null)
  }

  function handleRetry() {
    clearPriceCache(benchmarkCode)
    clearDividendCache(benchmarkCode)
    setResult(null)
    setErrorMsg(null)
    setRetryCount(c => c + 1)
  }

  const fromDate = getFromDate()
  const activePortfolioReturn = period === 'all'
    ? portfolioReturn
    : calcPortfolioReturn(pricesByStock, transactions, holdings, fromDate)

  const benchmarkReturn = result?.returnPct ?? null
  const diff = (benchmarkReturn !== null && activePortfolioReturn !== null)
    ? activePortfolioReturn - benchmarkReturn
    : null
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
  const color = (n: number) => n >= 0 ? 'text-green-600' : 'text-red-500'
  const isDefault = benchmarkCode === DEFAULT_CODE

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
            onClick={() => { setBenchmarkCode(DEFAULT_CODE); setResult(null); setErrorMsg(null) }}
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
      ) : errorMsg === 'incomplete' ? (
        <div className="text-xs space-y-1.5">
          <p className="text-amber-500">
            ⚠ {benchmarkCode} 歷史資料不完整（股價更新中可能被限流），數字可能偏低
          </p>
          <button
            onClick={handleRetry}
            className="text-xs text-teal-600 hover:text-teal-800 underline underline-offset-2"
          >
            清除快取並重新查詢
          </button>
        </div>
      ) : errorMsg === 'notfound' ? (
        <div className="text-xs text-red-400">找不到 {benchmarkCode} 資料</div>
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
          {result && (
            <p className="text-xs text-gray-400 mt-2">
              比較區間：{fmtPeriod(result.actualStartDate)} 起
            </p>
          )}
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
