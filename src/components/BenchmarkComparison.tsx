import { useState, useEffect } from 'react'
import { fetchStockPrices } from '../services/stockPrices'
import { fetchDividends } from '../services/dividends'

interface Props {
  firstBuyDate: string  // YYYY-MM-DD
  portfolioReturn: number  // %
}

export default function BenchmarkComparison({ firstBuyDate, portfolioReturn }: Props) {
  const [benchmarkReturn, setBenchmarkReturn] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!firstBuyDate) return

    Promise.all([
      fetchStockPrices('0050', firstBuyDate),
      fetchDividends('0050'),
    ]).then(([prices, dividends]) => {
      const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
      const startEntry = sorted.find(p => p.date >= firstBuyDate)
      const endEntry = sorted[sorted.length - 1]
      if (!startEntry || !endEntry || startEntry.date === endEntry.date) return

      const startPrice = startEntry.close

      // 累積自買入日後的每股現金股利
      const cumulativeDividends = dividends
        .filter(d => d.exDate >= firstBuyDate)
        .reduce((sum, d) => sum + d.cashPerShare, 0)

      // Total Return = (現價 + 累積股利 - 買入價) / 買入價
      const totalReturn = ((endEntry.close + cumulativeDividends - startPrice) / startPrice) * 100
      setBenchmarkReturn(totalReturn)
    })
    .catch(() => {})
    .finally(() => setLoading(false))
  }, [firstBuyDate])

  const diff = benchmarkReturn !== null ? portfolioReturn - benchmarkReturn : null

  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
  const color = (n: number) => n >= 0 ? 'text-green-600' : 'text-red-500'

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">績效 vs 大盤（0050 含股利）</h3>
      {loading ? (
        <div className="text-xs text-gray-400">載入中…</div>
      ) : benchmarkReturn === null ? (
        <div className="text-xs text-gray-400">無法取得 0050 資料</div>
      ) : (
        <div className="flex items-stretch gap-3">
          <div className="flex-1 bg-teal-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">我的投資組合</div>
            <div className={`text-xl font-bold ${color(portfolioReturn)}`}>{fmt(portfolioReturn)}</div>
          </div>
          <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">0050 含股利</div>
            <div className={`text-xl font-bold ${color(benchmarkReturn)}`}>{fmt(benchmarkReturn)}</div>
          </div>
          {diff !== null && (
            <div className={`flex-1 rounded-lg p-3 text-center ${diff >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-xs text-gray-500 mb-1">超越大盤</div>
              <div className={`text-xl font-bold ${color(diff)}`}>{fmt(diff)}</div>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-gray-300 mt-2">以首筆買入日為基準，0050 快取 7 天</p>
    </div>
  )
}
