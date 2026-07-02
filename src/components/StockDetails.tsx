import { Fragment, useState } from 'react'
import { StockDetail } from '../types'
import EditableName from './EditableName'

interface Props {
  details: StockDetail[]
  names: Record<string, string>
  onRename: (code: string, name: string) => void
}

function fmtNum(v: number, decimals = 0) {
  return v.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtDate(s: string) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${y}/${m}/${d}`
}

function PnL({ value, suffix = '', decimals = 0 }: { value: number | null; suffix?: string; decimals?: number }) {
  if (value === null) return <span className="text-gray-300">—</span>
  const cls = value >= 0 ? 'text-red-600' : 'text-green-600'
  return (
    <span className={`${cls} font-semibold tabular-nums`}>
      {value >= 0 ? '+' : ''}{fmtNum(value, decimals)}{suffix}
    </span>
  )
}

const TYPE_LABEL: Record<string, string> = { buy: '買入', sell: '賣出', dividend: '股利' }

function TxSubList({ d }: { d: StockDetail }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
      {d.transactions.map(tx => (
        <div key={tx.id} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className={`px-1.5 py-0.5 rounded font-medium ${
              tx.type === 'buy' ? 'bg-green-100 text-green-700'
                : tx.type === 'sell' ? 'bg-red-100 text-red-700'
                : 'bg-teal-100 text-teal-700'
            }`}>
              {TYPE_LABEL[tx.type]}
            </span>
            <span className="text-gray-500">{fmtDate(tx.date)}</span>
          </div>
          <span className="text-gray-600 tabular-nums">
            {tx.shares.toLocaleString()} {tx.type === 'dividend' ? '股 × 配' : '股 ×'} {tx.price.toFixed(2)}
            {' ＝ '}{fmtNum(Math.round(tx.shares * tx.price))}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function StockDetails({ details, names, onRename }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (details.length === 0) return null

  function toggle(code: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">個股損益明細</h2>
      <p className="text-xs text-gray-400 mb-4">點任一列展開該股票的歷次交易。報酬率＝總損益÷歷來買進成本；年化為該股 XIRR。</p>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 font-medium">股票</th>
              <th className="pb-2 font-medium text-right">已實現價差</th>
              <th className="pb-2 font-medium text-right">股利</th>
              <th className="pb-2 font-medium text-right">未實現</th>
              <th className="pb-2 font-medium text-right">總損益</th>
              <th className="pb-2 font-medium text-right">報酬率</th>
              <th className="pb-2 font-medium text-right">年化</th>
            </tr>
          </thead>
          <tbody>
            {details.map(d => (
              <Fragment key={d.stockCode}>
                <tr
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggle(d.stockCode)}
                >
                  <td className="py-3 font-bold text-gray-900">
                    <span className="inline-block w-3 text-gray-300">{expanded.has(d.stockCode) ? '▾' : '▸'}</span>
                    {d.stockCode}
                    <span className="ml-2"><EditableName code={d.stockCode} name={names[d.stockCode]} onRename={onRename} /></span>
                    {d.totalShares > 0
                      ? <span className="ml-2 text-xs font-normal text-gray-400">持有 {d.totalShares.toLocaleString()} 股</span>
                      : <span className="ml-2 text-xs font-normal text-gray-300">已出清</span>}
                  </td>
                  <td className="py-3 text-right"><PnL value={d.realizedTradePnL} /></td>
                  <td className="py-3 text-right">
                    {d.dividendTotal > 0 ? <span className="text-teal-600 font-semibold tabular-nums">+{fmtNum(d.dividendTotal)}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-3 text-right"><PnL value={d.unrealizedPnL} /></td>
                  <td className="py-3 text-right"><PnL value={d.totalPnL} /></td>
                  <td className="py-3 text-right"><PnL value={d.returnRate} suffix="%" decimals={2} /></td>
                  <td className="py-3 text-right"><PnL value={d.annualizedReturn} suffix="%" decimals={1} /></td>
                </tr>
                {expanded.has(d.stockCode) && (
                  <tr>
                    <td colSpan={7} className="pb-3 px-1"><TxSubList d={d} /></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {details.map(d => (
          <div key={d.stockCode} className="rounded-lg border border-gray-100 p-3">
            <button className="w-full flex items-center justify-between mb-2" onClick={() => toggle(d.stockCode)}>
              <span className="flex items-center gap-2">
                <span className="text-gray-300">{expanded.has(d.stockCode) ? '▾' : '▸'}</span>
                <span className="font-bold text-base text-gray-900">{d.stockCode}</span>
                <EditableName code={d.stockCode} name={names[d.stockCode]} onRename={onRename} />
                <span className="text-xs text-gray-400">{d.totalShares > 0 ? `持有 ${d.totalShares.toLocaleString()}` : '已出清'}</span>
              </span>
              <PnL value={d.totalPnL} />
            </button>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between"><span className="text-gray-400">已實現價差</span><PnL value={d.realizedTradePnL} /></div>
              <div className="flex justify-between"><span className="text-gray-400">股利</span>{d.dividendTotal > 0 ? <span className="text-teal-600 font-semibold tabular-nums">+{fmtNum(d.dividendTotal)}</span> : <span className="text-gray-300">—</span>}</div>
              <div className="flex justify-between"><span className="text-gray-400">未實現</span><PnL value={d.unrealizedPnL} /></div>
              <div className="flex justify-between"><span className="text-gray-400">報酬率</span><PnL value={d.returnRate} suffix="%" decimals={2} /></div>
              <div className="flex justify-between col-span-2"><span className="text-gray-400">年化報酬率</span><PnL value={d.annualizedReturn} suffix="%" decimals={1} /></div>
            </div>
            {expanded.has(d.stockCode) && <div className="mt-3"><TxSubList d={d} /></div>}
          </div>
        ))}
      </div>
    </div>
  )
}
