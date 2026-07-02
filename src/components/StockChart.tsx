import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Transaction } from '../types'

interface Props {
  stockCode: string
  prices: Map<string, number>   // date → close
  transactions: Transaction[]   // 該股所有交易
  avgCost: number
  currentPrice: number | null
}

function fmtDate(d: string) {
  return d.slice(0, 7).replace('-', '/')  // YYYY/MM
}

export default function StockChart({ stockCode, prices, transactions, avgCost, currentPrice }: Props) {
  const data = useMemo(() => {
    return [...prices.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, close]) => ({ date, close }))
  }, [prices])

  if (data.length < 2) return null

  const buyDates = new Set(
    transactions.filter(t => t.stockCode === stockCode && t.type === 'buy').map(t => t.date),
  )

  const min = Math.min(...data.map(d => d.close), avgCost) * 0.97
  const max = Math.max(...data.map(d => d.close), avgCost) * 1.03

  // Show ~6 evenly spaced X-axis ticks
  const tickInterval = Math.max(1, Math.floor(data.length / 6))

  return (
    <div className="pt-3 pb-1">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            interval={tickInterval}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={45}
            tickFormatter={v => v.toFixed(0)}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(2)} 元`, '收盤價']}
            labelFormatter={fmtDate}
            contentStyle={{ fontSize: 12 }}
          />
          {/* 均攤成本參考線 */}
          <ReferenceLine
            y={avgCost}
            stroke="#f59e0b"
            strokeDasharray="4 3"
            label={{ value: `成本 ${avgCost.toFixed(1)}`, position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
          />
          {/* 現價參考線 */}
          {currentPrice && (
            <ReferenceLine
              y={currentPrice}
              stroke="#0d9488"
              strokeDasharray="4 3"
              label={{ value: `現價 ${currentPrice.toFixed(1)}`, position: 'insideBottomRight', fontSize: 10, fill: '#0d9488' }}
            />
          )}
          <Line
            type="monotone"
            dataKey="close"
            stroke="#0d9488"
            strokeWidth={1.5}
            dot={(props) => {
              const { cx, cy, payload } = props
              if (!buyDates.has(payload.date)) return <g key={payload.date} />
              return (
                <circle key={payload.date} cx={cx} cy={cy} r={3} fill="#0d9488" stroke="#fff" strokeWidth={1} />
              )
            }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-1">● 買入日  — — 均攤成本  — — 現價</p>
    </div>
  )
}
