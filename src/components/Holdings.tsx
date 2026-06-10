import { HoldingData } from '../utils/pnl'

interface Props {
  holdings: HoldingData[]
}

function fmtNum(v: number, decimals = 0) {
  return v.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function PnLCell({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-gray-300">—</span>
  const cls = value >= 0 ? 'text-red-600' : 'text-green-600'
  return (
    <span className={`${cls} font-medium tabular-nums`}>
      {value >= 0 ? '+' : ''}
      {fmtNum(value)}
      {suffix}
    </span>
  )
}

export default function Holdings({ holdings }: Props) {
  if (holdings.length === 0) return null

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">目前持倉</h2>
      <div className="overflow-x-auto">
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
                <td className="py-3 font-bold text-gray-900">{h.stockCode}</td>
                <td className="py-3 text-right tabular-nums">{h.totalShares.toLocaleString()}</td>
                <td className="py-3 text-right text-gray-600 tabular-nums">{fmtNum(h.avgCost, 2)}</td>
                <td className="py-3 text-right text-gray-600 tabular-nums">
                  {h.currentPrice !== null ? fmtNum(h.currentPrice, 2) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-3 text-right text-gray-700 tabular-nums">
                  {h.marketValue !== null ? fmtNum(h.marketValue) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-3 text-right">
                  <PnLCell value={h.unrealizedPnL} />
                </td>
                <td className="py-3 text-right">
                  <PnLCell
                    value={h.returnRate !== null ? Math.round(h.returnRate * 100) / 100 : null}
                    suffix="%"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
