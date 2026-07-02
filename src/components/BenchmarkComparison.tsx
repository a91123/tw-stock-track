import { useState, useEffect } from 'react'
import { fetchStockPrices, clearPriceCache } from '../services/stockPrices'
import { fetchDividends, clearDividendCache } from '../services/dividends'

interface Props {
  firstBuyDate: string
  portfolioReturn: number
}

const DEFAULT_CODE = '0050'

interface BenchmarkResult {
  returnPct: number
  actualStartDate: string  // 實際取到的第一筆價格日期
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

  // 若起始日距 fromDate 超過 45 天，代表歷史月份因限流沒抓到，數字會嚴重偏低
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

export default function BenchmarkComparison({ firstBuyDate, portfolioReturn }: Props) {
  const [benchmarkCode, setBenchmarkCode] = useState(DEFAULT_CODE)
  const [inputCode, setInputCode] = useState('')
  const [result, setResult] = useState<BenchmarkResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!firstBuyDate) return
    setLoading(true)
    setErrorMsg(null)
    fetchTotalReturn(benchmarkCode, firstBuyDate)
      .then(r => {
        if (r !== null) {
          setResult(r)
        } else {
          setErrorMsg('incomplete')
        }
      })
      .catch(() => setErrorMsg('notfound'))
      .finally(() => setLoading(false))
  }, [firstBuyDate, benchmarkCode, retryCount])

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

  const benchmarkReturn = result?.returnPct ?? null
  const diff = benchmarkReturn !== null ? portfolioReturn - benchmarkReturn : null
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
              <div className={`text-xl font-bold ${color(portfolioReturn)}`}>{fmt(portfolioReturn)}</div>
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
