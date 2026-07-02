import { useState } from 'react'
import { fetchStockPrices } from '../services/stockPrices'
import { StockPrice } from '../types'

interface Result {
  totalInvested: number
  totalShares: number
  marketValue: number
  pnl: number
  returnRate: number
  months: number
  currentPrice: number
}

function firstOfMonth(prices: StockPrice[], year: number, month: number): StockPrice | null {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return prices.find(p => p.date.startsWith(prefix)) ?? null
}

export default function DCACalculator() {
  const [open, setOpen] = useState(false)
  const [stockCode, setStockCode] = useState('')
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [startYM, setStartYM] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function calculate() {
    const code = stockCode.trim().toUpperCase()
    const amount = parseInt(monthlyAmount)
    if (!code || !amount || !startYM) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const startDate = `${startYM}-01`
      const prices = await fetchStockPrices(code, startDate)
      if (prices.length === 0) { setError('找不到該股票價格資料'); return }
      const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))

      const [sy, sm] = startYM.split('-').map(Number)
      const now = new Date()
      let totalShares = 0
      let totalInvested = 0
      let monthCount = 0

      for (let y = sy, m = sm; y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1); m++) {
        if (m > 12) { m = 1; y++ }
        const p = firstOfMonth(sorted, y, m)
        if (!p) continue
        const shares = Math.floor(amount / p.close)
        if (shares <= 0) continue
        totalShares += shares
        totalInvested += shares * p.close
        monthCount++
      }

      const currentPrice = sorted[sorted.length - 1].close
      const marketValue = totalShares * currentPrice
      const pnl = marketValue - totalInvested
      const returnRate = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0

      setResult({ totalInvested, totalShares, marketValue, pnl, returnRate, months: monthCount, currentPrice })
    } catch {
      setError('計算失敗，請確認股票代碼是否正確')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
  const color = (n: number) => n >= 0 ? 'text-red-600' : 'text-green-600'

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-sm font-semibold text-gray-700"
      >
        <span>定期定額試算</span>
        <span className="text-gray-400 text-xs">{open ? '▲ 收起' : '▼ 展開'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={stockCode}
              onChange={e => setStockCode(e.target.value)}
              placeholder="股票代碼（如 0050）"
              className="flex-1 min-w-[130px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
            />
            <input
              type="number"
              value={monthlyAmount}
              onChange={e => setMonthlyAmount(e.target.value)}
              placeholder="每月投入（元）"
              className="flex-1 min-w-[130px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
            />
            <input
              type="month"
              value={startYM}
              onChange={e => setStartYM(e.target.value)}
              className="flex-1 min-w-[130px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
            />
            <button
              onClick={calculate}
              disabled={loading || !stockCode || !monthlyAmount || !startYM}
              className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
            >
              {loading ? '計算中…' : '試算'}
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {result && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">總投入</div>
                  <div className="text-base font-bold text-gray-700">${fmt(result.totalInvested)}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">目前市值</div>
                  <div className="text-base font-bold text-gray-700">${fmt(result.marketValue)}</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${result.pnl >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <div className="text-xs text-gray-500 mb-1">損益</div>
                  <div className={`text-base font-bold ${color(result.pnl)}`}>{result.pnl >= 0 ? '+' : ''}{fmt(result.pnl)}</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${result.returnRate >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <div className="text-xs text-gray-500 mb-1">報酬率</div>
                  <div className={`text-base font-bold ${color(result.returnRate)}`}>{fmtPct(result.returnRate)}</div>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                共 {result.months} 個月，累積 {fmt(result.totalShares)} 股，現價 {result.currentPrice} 元
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
