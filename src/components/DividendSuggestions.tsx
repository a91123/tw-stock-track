import { useState } from 'react'
import { Transaction } from '../types'

export interface SuggestedDividend {
  stockCode: string
  stockName?: string
  exDate: string
  cashPerShare: number
  sharesHeld: number
  totalAmount: number
}

interface Props {
  suggestions: SuggestedDividend[]
  onAdd: (txs: Omit<Transaction, 'id'>[]) => void
  onDismiss: () => void
}

function fmtMoney(n: number) {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}

export default function DividendSuggestions({ suggestions, onAdd, onDismiss }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(suggestions.map(s => `${s.stockCode}:${s.exDate}`)),
  )

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleAdd() {
    const txs = suggestions
      .filter(s => selected.has(`${s.stockCode}:${s.exDate}`))
      .map(s => ({
        stockCode: s.stockCode,
        type: 'dividend' as const,
        date: s.exDate,
        shares: s.sharesHeld,
        price: s.cashPerShare,
      }))
    onAdd(txs)
  }

  const totalSelected = suggestions
    .filter(s => selected.has(`${s.stockCode}:${s.exDate}`))
    .reduce((sum, s) => sum + s.totalAmount, 0)

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">找到未入帳的配息紀錄</p>
          <p className="text-xs text-gray-500 mt-0.5">根據持股期間計算，確認後加入</p>
        </div>
        <button onClick={onDismiss} className="text-gray-300 hover:text-gray-500 text-xl leading-none">×</button>
      </div>

      <div className="divide-y divide-gray-100">
        {suggestions.map(s => {
          const key = `${s.stockCode}:${s.exDate}`
          return (
            <label key={key} className="flex items-center gap-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(key)}
                onChange={() => toggle(key)}
                className="w-4 h-4 rounded accent-blue-600 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900">
                  {s.stockName || s.stockCode}
                </span>
                {s.stockName && (
                  <span className="text-xs text-gray-400 ml-1.5">{s.stockCode}</span>
                )}
                <div className="text-xs text-gray-500 mt-0.5">
                  {s.exDate} 除息・{s.sharesHeld.toLocaleString()} 股 × ${s.cashPerShare}
                </div>
              </div>
              <span className="text-sm font-semibold text-teal-600 tabular-nums flex-shrink-0">
                +{fmtMoney(s.totalAmount)}
              </span>
            </label>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <span className="text-xs text-gray-500">
          合計{' '}
          <span className="font-semibold text-teal-600">+{fmtMoney(totalSelected)} 元</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            略過
          </button>
          <button
            onClick={handleAdd}
            disabled={selected.size === 0}
            className="px-4 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            加入所選（{selected.size} 筆）
          </button>
        </div>
      </div>
    </div>
  )
}
