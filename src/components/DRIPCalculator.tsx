import { useState } from 'react'
import { fetchStockPrices } from '../services/stockPrices'
import { fetchDividends } from '../services/dividends'

interface Result {
  initialShares: number
  startPrice: number
  currentPrice: number
  regularValue: number
  regularDivCash: number
  dripShares: number
  dripValue: number
  dripExtra: number
  dripPct: number
  reinvestedCount: number
}

export default function DRIPCalculator() {
  const [open, setOpen] = useState(false)
  const [stockCode, setStockCode] = useState('')
  const [investAmount, setInvestAmount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function calculate() {
    const code = stockCode.trim().toUpperCase()
    const amount = parseInt(investAmount)
    if (!code || !amount || !startDate) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const [prices, dividends] = await Promise.all([
        fetchStockPrices(code, startDate),
        fetchDividends(code),
      ])

      const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
      const startEntry = sorted.find(p => p.date >= startDate)
      if (!startEntry) { setError('找不到起始日價格'); return }

      const currentEntry = sorted[sorted.length - 1]
      const initialShares = Math.floor(amount / startEntry.close)
      if (initialShares === 0) { setError('投入金額不足購買一股'); return }

      const relevantDivs = dividends
        .filter(d => d.exDate >= startDate && d.cashPerShare > 0)
        .sort((a, b) => a.exDate.localeCompare(b.exDate))

      // DRIP simulation：每次除息後以除息日市價再買進
      let dripShares = initialShares
      let regularDivCash = 0
      let reinvestedCount = 0

      for (const div of relevantDivs) {
        regularDivCash += initialShares * div.cashPerShare
        const divCash = dripShares * div.cashPerShare
        const exEntry = sorted.find(p => p.date >= div.exDate)
        if (!exEntry) continue
        const newShares = Math.floor(divCash / exEntry.close)
        if (newShares > 0) {
          dripShares += newShares
          reinvestedCount++
        }
      }

      const regularValue = initialShares * currentEntry.close
      const dripValue = dripShares * currentEntry.close
      // 公平比較：不再投入的總財富 = 股票市值 + 累計現金股利
      const regularTotal = regularValue + regularDivCash
      const dripExtra = dripValue - regularTotal
      const dripPct = regularTotal > 0 ? (dripExtra / regularTotal) * 100 : 0

      setResult({
        initialShares,
        startPrice: startEntry.close,
        currentPrice: currentEntry.close,
        regularValue,
        regularDivCash,
        dripShares,
        dripValue,
        dripExtra,
        dripPct,
        reinvestedCount,
      })
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
        <span>股利再投入試算（DRIP）</span>
        <span className="text-gray-400 text-xs">{open ? '▲ 收起' : '▼ 展開'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-400">
            試算「把每次股利全部再買進同一檔股票」vs「拿股利當現金」的最終財富差距
          </p>
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
              value={investAmount}
              onChange={e => setInvestAmount(e.target.value)}
              placeholder="初始投入（元）"
              className="flex-1 min-w-[130px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
            />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="flex-1 min-w-[130px] text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
            />
            <button
              onClick={calculate}
              disabled={loading || !stockCode || !investAmount || !startDate}
              className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
            >
              {loading ? '計算中…' : '試算'}
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {result && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">不再投入（股票＋股利現金）</div>
                  <div className="text-base font-bold text-gray-700">
                    ${fmt(result.regularValue + result.regularDivCash)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    股票 ${fmt(result.regularValue)}
                    ＋股利 ${fmt(result.regularDivCash)}
                  </div>
                </div>
                <div className="bg-teal-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">股利全再投入（僅股票）</div>
                  <div className="text-base font-bold text-teal-700">${fmt(result.dripValue)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {fmt(result.dripShares)} 股 × {result.currentPrice} 元
                  </div>
                </div>
              </div>
              <div className={`rounded-lg p-3 text-center ${result.dripExtra >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className="text-xs text-gray-500 mb-1">再投入多賺／少賺</div>
                <div className={`text-xl font-bold ${color(result.dripExtra)}`}>
                  {result.dripExtra >= 0 ? '+' : ''}{fmt(result.dripExtra)}
                </div>
                <div className={`text-sm font-medium mt-0.5 ${color(result.dripExtra)}`}>
                  {fmtPct(result.dripPct)}
                </div>
              </div>
              <p className="text-xs text-gray-400">
                起始 {fmt(result.initialShares)} 股 @ {result.startPrice} 元｜
                共再投入 {result.reinvestedCount} 次｜
                現價 {result.currentPrice} 元｜不含交易成本
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
