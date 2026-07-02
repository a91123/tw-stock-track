import { useState } from 'react'
import { fetchStockPrices } from '../services/stockPrices'
import { StockPrice } from '../types'

interface Result {
  totalInvested: number
  totalShares: number
  marketValue: number
  pnl: number
  returnRate: number
  pastMonths: number
  futureMonths: number
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
  const [investYears, setInvestYears] = useState('10')
  const [assumedReturn, setAssumedReturn] = useState('8')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function calculate() {
    const code = stockCode.trim().toUpperCase()
    const amount = parseInt(monthlyAmount)
    const years = parseInt(investYears)
    const annualReturnPct = parseFloat(assumedReturn)

    if (!code || !amount || !startYM || !years || isNaN(annualReturnPct)) return
    if (years < 1 || years > 50) { setError('投資年限請填 1–50 年'); return }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const now = new Date()
      const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const monthlyReturn = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1

      // Fetch real historical prices; if start is future, still need the latest price as base
      const fetchFrom = startYM <= currentYM ? `${startYM}-01` : `${currentYM}-01`
      const prices = await fetchStockPrices(code, fetchFrom)
      if (prices.length === 0) { setError('找不到該股票價格資料'); return }

      const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
      const lastActualPrice = sorted[sorted.length - 1].close

      const [sy, sm] = startYM.split('-').map(Number)
      const totalMonths = years * 12

      let totalShares = 0
      let totalInvested = 0
      let pastMonths = 0
      let futureMonthIndex = 0   // compounds from lastActualPrice

      for (let i = 0; i < totalMonths; i++) {
        const offset = sm - 1 + i
        const y = sy + Math.floor(offset / 12)
        const m = (offset % 12) + 1
        const ym = `${y}-${String(m).padStart(2, '0')}`

        let price: number
        if (ym <= currentYM) {
          const p = firstOfMonth(sorted, y, m)
          if (!p) continue
          price = p.close
          pastMonths++
        } else {
          futureMonthIndex++
          price = lastActualPrice * Math.pow(1 + monthlyReturn, futureMonthIndex)
        }

        const shares = Math.floor(amount / price)
        if (shares <= 0) continue
        totalShares += shares
        totalInvested += shares * price
      }

      const finalPrice = futureMonthIndex > 0
        ? lastActualPrice * Math.pow(1 + monthlyReturn, futureMonthIndex)
        : lastActualPrice

      const marketValue = totalShares * finalPrice
      const pnl = marketValue - totalInvested
      const returnRate = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0
      const futureMonths = totalMonths - pastMonths

      setResult({ totalInvested, totalShares, marketValue, pnl, returnRate, pastMonths, futureMonths })
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
          {/* 第一行：股票代碼 + 每月投入 + 起始月 */}
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={stockCode}
              onChange={e => setStockCode(e.target.value)}
              placeholder="股票代碼（如 0050）"
              className="flex-1 min-w-[120px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
            />
            <input
              type="number"
              value={monthlyAmount}
              onChange={e => setMonthlyAmount(e.target.value)}
              placeholder="每月投入（元）"
              className="flex-1 min-w-[120px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
            />
            <input
              type="month"
              value={startYM}
              onChange={e => setStartYM(e.target.value)}
              className="flex-1 min-w-[120px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
            />
          </div>

          {/* 第二行：投資年限 + 假設年化 + 試算按鈕 */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5 flex-1 min-w-[100px]">
              <input
                type="number"
                value={investYears}
                onChange={e => setInvestYears(e.target.value)}
                min="1" max="50"
                placeholder="年限"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
              />
              <span className="text-sm text-gray-500 shrink-0">年</span>
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
              <input
                type="number"
                value={assumedReturn}
                onChange={e => setAssumedReturn(e.target.value)}
                step="0.5"
                placeholder="年化報酬"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
              />
              <span className="text-sm text-gray-500 shrink-0">% 年化</span>
            </div>
            <button
              onClick={calculate}
              disabled={loading || !stockCode || !monthlyAmount || !startYM || !investYears}
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
                  <div className="text-xs text-gray-500 mb-1">{result.futureMonths > 0 ? '預估市值' : '目前市值'}</div>
                  <div className="text-base font-bold text-gray-700">${fmt(result.marketValue)}</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${result.pnl >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <div className="text-xs text-gray-500 mb-1">損益</div>
                  <div className={`text-base font-bold ${color(result.pnl)}`}>
                    {result.pnl >= 0 ? '+' : ''}{fmt(result.pnl)}
                  </div>
                </div>
                <div className={`rounded-lg p-3 text-center ${result.returnRate >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <div className="text-xs text-gray-500 mb-1">報酬率</div>
                  <div className={`text-base font-bold ${color(result.returnRate)}`}>{fmtPct(result.returnRate)}</div>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                累積 {fmt(result.totalShares)} 股，共 {result.pastMonths + result.futureMonths} 個月
                {result.futureMonths > 0 && (
                  <span className="text-amber-500 ml-1">
                    （{result.pastMonths > 0 ? `${result.pastMonths} 個月實際 ／ ` : ''}{result.futureMonths} 個月預測 @ {assumedReturn}% 年化）
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
