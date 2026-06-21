import { useState } from 'react'
import { HoldingData } from '../utils/pnl'

interface Props {
  holdings: HoldingData[]
  isRealtime?: boolean
  names: Record<string, string>
  onRename: (code: string, name: string) => void
}

function fmtNum(v: number, decimals = 0) {
  return v.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// 點擊即可輸入/編輯股票中文名稱
function EditableName({ code, name, onRename }: { code: string; name?: string; onRename: (c: string, n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name ?? '')

  function save() {
    onRename(code, val)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        placeholder="輸入名稱"
        className="w-20 px-1 py-0.5 text-xs font-normal border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        onClick={e => e.stopPropagation()}
      />
    )
  }
  return (
    <button
      onClick={e => { e.stopPropagation(); setVal(name ?? ''); setEditing(true) }}
      className={`text-xs font-normal ${name ? 'text-gray-500' : 'text-blue-400'} hover:text-blue-600`}
      title="點擊編輯名稱"
    >
      {name || '＋命名'}
    </button>
  )
}

function PnLText({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-gray-300">—</span>
  const cls = value >= 0 ? 'text-red-600' : 'text-green-600'
  return (
    <span className={`${cls} font-semibold tabular-nums`}>
      {value >= 0 ? '+' : ''}{fmtNum(value)}{suffix}
    </span>
  )
}

export default function Holdings({ holdings, isRealtime, names, onRename }: Props) {
  if (holdings.length === 0) return null

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-gray-700">目前持倉</h2>
        {isRealtime && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            盤中即時
          </span>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 font-medium">股票代碼</th>
              <th className="pb-2 font-medium text-right">持股數</th>
              <th className="pb-2 font-medium text-right">均攤成本</th>
              <th className="pb-2 font-medium text-right">現價</th>
              <th className="pb-2 font-medium text-right">市值（元）</th>
              <th className="pb-2 font-medium text-right">未實現損益</th>
              <th className="pb-2 font-medium text-right">報酬率</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr key={h.stockCode} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{h.stockCode}</span>
                    <EditableName code={h.stockCode} name={names[h.stockCode]} onRename={onRename} />
                  </div>
                </td>
                <td className="py-3 text-right tabular-nums">{h.totalShares.toLocaleString()}</td>
                <td className="py-3 text-right text-gray-600 tabular-nums">{fmtNum(h.avgCost, 2)}</td>
                <td className="py-3 text-right text-gray-600 tabular-nums">
                  {h.currentPrice !== null ? fmtNum(h.currentPrice, 2) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-3 text-right text-gray-700 tabular-nums">
                  {h.marketValue !== null ? fmtNum(h.marketValue) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-3 text-right">
                  <PnLText value={h.unrealizedPnL} />
                </td>
                <td className="py-3 text-right">
                  <PnLText
                    value={h.returnRate !== null ? Math.round(h.returnRate * 100) / 100 : null}
                    suffix="%"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {holdings.map(h => (
          <div key={h.stockCode} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2">
                <span className="font-bold text-base text-gray-900">{h.stockCode}</span>
                <EditableName code={h.stockCode} name={names[h.stockCode]} onRename={onRename} />
              </span>
              <PnLText
                value={h.returnRate !== null ? Math.round(h.returnRate * 100) / 100 : null}
                suffix="%"
              />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">持股數</span>
                <span className="text-gray-700 tabular-nums">{h.totalShares.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">市值</span>
                <span className="text-gray-700 tabular-nums">
                  {h.marketValue !== null ? fmtNum(h.marketValue) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">均攤成本</span>
                <span className="text-gray-700 tabular-nums">{fmtNum(h.avgCost, 2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">現價</span>
                <span className="text-gray-700 tabular-nums">
                  {h.currentPrice !== null ? fmtNum(h.currentPrice, 2) : '—'}
                </span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-gray-400">未實現損益</span>
                <PnLText value={h.unrealizedPnL} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
