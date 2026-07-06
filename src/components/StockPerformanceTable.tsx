import { useMemo, useState } from 'react'
import { getStockPerformance, StockPerformance } from '../utils/performance'
import { HoldingData } from '../utils/pnl'

interface Props {
  holdings: HoldingData[]
  pricesByStock: Map<string, Map<string, number>>
  names: Record<string, string>
}

type SortKey = 'change1d' | 'change5d' | 'change20d' | 'changeYTD'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'change1d', label: '近1日' },
  { key: 'change5d', label: '近5日' },
  { key: 'change20d', label: '近20日' },
  { key: 'changeYTD', label: '今年以來' },
]

function Pct({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300">—</span>
  const cls = value >= 0 ? 'text-red-600' : 'text-green-600'
  return (
    <span className={`${cls} font-medium tabular-nums`}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

export default function StockPerformanceTable({ holdings, pricesByStock, names }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('change1d')
  const [sortDesc, setSortDesc] = useState(true)

  const rows = useMemo(
    () => getStockPerformance(holdings.map(h => h.stockCode), pricesByStock),
    [holdings, pricesByStock],
  )

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return sortDesc ? bv - av : av - bv
    })
  }, [rows, sortKey, sortDesc])

  if (rows.length === 0) return null

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDesc(d => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">個股表現</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 font-medium">名稱</th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className="pb-2 font-medium text-right cursor-pointer select-none hover:text-teal-600 whitespace-nowrap"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}{sortKey === col.key ? (sortDesc ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.stockCode} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 font-semibold text-gray-900 whitespace-nowrap">
                  {names[r.stockCode] || r.stockCode}
                  {names[r.stockCode] && <span className="ml-1.5 text-xs font-normal text-gray-400">{r.stockCode}</span>}
                </td>
                <td className="py-2 text-right"><Pct value={r.change1d} /></td>
                <td className="py-2 text-right"><Pct value={r.change5d} /></td>
                <td className="py-2 text-right"><Pct value={r.change20d} /></td>
                <td className="py-2 text-right"><Pct value={r.changeYTD} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
