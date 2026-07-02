import { useState, useEffect } from 'react'
import { fetchStockPrices } from '../services/stockPrices'
import { fetchDividends } from '../services/dividends'

interface Props {
  firstBuyDate: string
  portfolioReturn: number
}

const DEFAULT_CODE = '0050'

async function fetchTotalReturn(code: string, fromDate: string): Promise<number | null> {
  const [prices, dividends] = await Promise.all([
    fetchStockPrices(code, fromDate),
    fetchDividends(code),
  ])
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
  const startEntry = sorted.find(p => p.date >= fromDate)
  const endEntry = sorted[sorted.length - 1]
  if (!startEntry || !endEntry || startEntry.date === endEntry.date) return null

  const cumDiv = dividends
    .filter(d => d.exDate >= fromDate)
    .reduce((sum, d) => sum + d.cashPerShare, 0)

  return ((endEntry.close + cumDiv - startEntry.close) / startEntry.close) * 100
}

export default function BenchmarkComparison({ firstBuyDate, portfolioReturn }: Props) {
  const [benchmarkCode, setBenchmarkCode] = useState(DEFAULT_CODE)
  const [inputCode, setInputCode] = useState('')
  const [benchmarkReturn, setBenchmarkReturn] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!firstBuyDate) return
    setLoading(true)
    setError(false)
    fetchTotalReturn(benchmarkCode, firstBuyDate)
      .then(r => { if (r !== null) setBenchmarkReturn(r); else setError(true) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [firstBuyDate, benchmarkCode])

  function handlePK() {
    const code = inputCode.trim().toUpperCase()
    if (!code) return
    setBenchmarkCode(code)
    setInputCode('')
    setBenchmarkReturn(null)
  }

  const diff = benchmarkReturn !== null ? portfolioReturn - benchmarkReturn : null
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
  const color = (n: number) => n >= 0 ? 'text-green-600' : 'text-red-500'
  const isDefault = benchmarkCode === DEFAULT_CODE

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          績效 vs {isDefault ? '大盤（0050）' : benchmarkCode} 含股利
        </h3>
        {!isDefault && (
          <button
            onClick={() => { setBenchmarkCode(DEFAULT_CODE); setBenchmarkReturn(null) }}
            className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
          >
            回到大盤
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-gray-400">載入中…</div>
      ) : error ? (
        <div className="text-xs text-red-400">找不到 {benchmarkCode} 資料</div>
      ) : (
        <div className="flex items-stretch gap-3">
          <div className="flex-1 bg-teal-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">我的投資組合</div>
            <div className={`text-xl font-bold ${color(portfolioReturn)}`}>{fmt(portfolioReturn)}</div>
          </div>
          <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">{benchmarkCode} 含股利</div>
            <div className={`text-xl font-bold ${color(benchmarkReturn!)}`}>{fmt(benchmarkReturn!)}</div>
          </div>
          {diff !== null && (
            <div className={`flex-1 rounded-lg p-3 text-center ${diff >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-xs text-gray-500 mb-1">超越對手</div>
              <div className={`text-xl font-bold ${color(diff)}`}>{fmt(diff)}</div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <input
          type="text"
          value={inputCode}
          onChange={e => setInputCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handlePK()}
          placeholder="輸入股票代碼 PK（如 2330、00919）"
          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
        />
        <button
          onClick={handlePK}
          disabled={!inputCode.trim()}
          className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
        >
          PK
        </button>
      </div>
      <p className="text-xs text-gray-300 mt-1.5">以首筆買入日為基準，資料快取 7 天</p>
    </div>
  )
}
