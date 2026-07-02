import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface Holding {
  stockCode: string
  marketValue?: number | null
  totalShares: number
  avgCost: number
}

interface Props {
  holdings: Holding[]
  names: Record<string, string>
}

const COLORS = [
  '#0d9488', '#0891b2', '#7c3aed', '#db2777', '#d97706',
  '#16a34a', '#2563eb', '#dc2626', '#9333ea', '#0369a1',
]

export default function AllocationChart({ holdings, names }: Props) {
  const data = holdings
    .map(h => ({
      code: h.stockCode,
      name: `${h.stockCode} ${names[h.stockCode] ?? ''}`.trim(),
      value: Math.round(h.marketValue ?? h.totalShares * h.avgCost),
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)

  if (data.length === 0) return null

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">資產配置</h3>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="w-full sm:w-48 h-48 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [
                  `${((value / total) * 100).toFixed(1)}%`,
                  `$${value.toLocaleString()}`,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 w-full grid grid-cols-1 gap-1.5">
          {data.map((d, i) => (
            <div key={d.code} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-gray-700 truncate">{d.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 text-gray-500">
                <span>{((d.value / total) * 100).toFixed(1)}%</span>
                <span className="text-gray-300">|</span>
                <span>${d.value.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
