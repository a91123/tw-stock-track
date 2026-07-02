import { useMemo, useState } from 'react'
import { Transaction } from '../types'
import { FeeSettings, tradeFee, sellTax } from '../utils/fees'

interface Props {
  transactions: Transaction[]
  feeSettings: FeeSettings
  stockNames: Record<string, string>
}

interface YearData {
  year: string
  buyAmount: number
  sellAmount: number
  dividendAmount: number
  feesAndTax: number
  netCashFlow: number // sell + dividend - buy - fees
}

export default function AnnualReport({ transactions, feeSettings, stockNames: _stockNames }: Props) {
  const [open, setOpen] = useState(false)

  const yearlyData = useMemo<YearData[]>(() => {
    const byYear: Record<string, YearData> = {}

    for (const t of transactions) {
      const year = t.date.slice(0, 4)
      if (!byYear[year]) {
        byYear[year] = { year, buyAmount: 0, sellAmount: 0, dividendAmount: 0, feesAndTax: 0, netCashFlow: 0 }
      }
      const d = byYear[year]
      const amount = t.shares * t.price

      if (t.type === 'buy') {
        const fee = feeSettings.enabled ? tradeFee(amount, feeSettings.discount) : 0
        d.buyAmount += amount
        d.feesAndTax += fee
      } else if (t.type === 'sell') {
        const fee = feeSettings.enabled ? tradeFee(amount, feeSettings.discount) : 0
        const tax = feeSettings.enabled ? sellTax(amount, t.stockCode) : 0
        d.sellAmount += amount
        d.feesAndTax += fee + tax
      } else if (t.type === 'dividend') {
        d.dividendAmount += amount
      }
    }

    return Object.values(byYear)
      .map(d => ({
        ...d,
        netCashFlow: d.sellAmount + d.dividendAmount - d.buyAmount - d.feesAndTax,
      }))
      .sort((a, b) => b.year.localeCompare(a.year))
  }, [transactions, feeSettings])

  if (yearlyData.length === 0) return null

  const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
  const sign = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}`
  const color = (n: number) => n >= 0 ? 'text-red-600' : 'text-green-600'

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-sm font-semibold text-gray-700"
      >
        <span>年度損益報表</span>
        <span className="text-gray-400 text-xs">{open ? '▲ 收起' : '▼ 展開'}</span>
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="pb-2 text-left font-medium">年度</th>
                <th className="pb-2 text-right font-medium">買入金額</th>
                <th className="pb-2 text-right font-medium">賣出金額</th>
                <th className="pb-2 text-right font-medium">股利收入</th>
                <th className="pb-2 text-right font-medium">手續費＋稅</th>
                <th className="pb-2 text-right font-medium">現金淨流入</th>
              </tr>
            </thead>
            <tbody>
              {yearlyData.map(d => (
                <tr key={d.year} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 font-semibold text-gray-700">{d.year}</td>
                  <td className="py-2 text-right text-gray-600 tabular-nums">{fmt(d.buyAmount)}</td>
                  <td className="py-2 text-right text-gray-600 tabular-nums">{fmt(d.sellAmount)}</td>
                  <td className="py-2 text-right text-teal-600 tabular-nums">
                    {d.dividendAmount > 0 ? `+${fmt(d.dividendAmount)}` : '—'}
                  </td>
                  <td className="py-2 text-right text-gray-500 tabular-nums">
                    {d.feesAndTax > 0 ? `-${fmt(d.feesAndTax)}` : '—'}
                  </td>
                  <td className={`py-2 text-right font-semibold tabular-nums ${color(d.netCashFlow)}`}>
                    {sign(d.netCashFlow)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-300 mt-2">現金淨流入 = 賣出 + 股利 − 買入 − 交易成本</p>
        </div>
      )}
    </div>
  )
}
