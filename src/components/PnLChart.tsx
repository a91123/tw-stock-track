import { useState } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import { DailyPortfolioData } from '../types'
import { todayTW, isTradingHours } from '../utils/market'

// 台股慣例：紅漲綠跌
const UP_COLOR = '#dc2626'   // red-600
const DOWN_COLOR = '#16a34a' // green-600

function fmtDateShort(s: string) {
  const [, m, d] = s.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

function fmtY(v: number) {
  const abs = Math.abs(v)
  if (abs >= 10000) return `${(v / 10000).toFixed(0)}萬`
  return v.toLocaleString()
}

function fmtTooltipValue(value: number) {
  return `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString()} 元`
}

const CUMULATIVE_LABELS: Record<string, string> = {
  totalPnL: '總損益',
  unrealizedPnL: '未實現',
  realizedPnL: '已實現',
}

interface Props {
  data: DailyPortfolioData[]
}

type Tab = 'daily' | 'cumulative'
type Range = 'all' | '1w' | '1m' | 'ytd' | 'custom'

const RANGE_LABELS: { key: Range; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: '1w', label: '近一週' },
  { key: '1m', label: '近一月' },
  { key: 'ytd', label: '年初至今' },
]

// 區間起始日（含），all/無條件回 null
function rangeStart(range: Range, today: string): string | null {
  if (range === 'all' || range === 'custom') return null
  if (range === 'ytd') return `${today.slice(0, 4)}-01-01`
  const d = new Date(today + 'T00:00:00')
  if (range === '1w') d.setDate(d.getDate() - 7)
  else if (range === '1m') d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

export default function PnLChart({ data }: Props) {
  const [tab, setTab] = useState<Tab>('daily')
  const [range, setRange] = useState<Range>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  if (data.length === 0) return null

  const intraday = isTradingHours()
  const today = todayTW()

  const allChartData = data.map(d => ({
    label: fmtDateShort(d.date),
    fullDate: d.date,
    totalPnL: Math.round(d.totalPnL),
    unrealizedPnL: Math.round(d.unrealizedPnL),
    realizedPnL: Math.round(d.realizedPnL),
    dailyChange: Math.round(d.dailyChange),
    dailyChangePercent: d.dailyChangePercent,
  }))

  const start = rangeStart(range, today)
  const chartData = allChartData.filter(d => {
    if (range === 'custom') {
      if (customFrom && d.fullDate < customFrom) return false
      if (customTo && d.fullDate > customTo) return false
      return true
    }
    return !start || d.fullDate >= start
  })

  const latestTotal = chartData.length > 0 ? chartData[chartData.length - 1].totalPnL : 0
  const cumulColor = latestTotal >= 0 ? UP_COLOR : DOWN_COLOR

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">走勢分析</h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => setTab('daily')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              tab === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            每日損益
          </button>
          <button
            onClick={() => setTab('cumulative')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              tab === 'cumulative' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            累計損益
          </button>
        </div>
      </div>

      {/* 走勢分析：時間區間 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {RANGE_LABELS.map(r => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              range === r.key ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={() => setRange('custom')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            range === 'custom' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          自訂
        </button>
        {range === 'custom' && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-1.5 py-1 border border-gray-200 rounded-md"
            />
            <span>~</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-1.5 py-1 border border-gray-200 rounded-md"
            />
          </span>
        )}
      </div>

      {chartData.length === 0 && (
        <div className="py-12 text-center text-gray-300 text-sm">此區間沒有資料</div>
      )}

      {chartData.length > 0 && tab === 'daily' && (
        <>
          <div className="flex items-center gap-2 mb-3">
          <p className="text-xs text-gray-400">每個交易日的損益變化（紅＝當日獲利、綠＝當日虧損）</p>
          {intraday && <span className="text-xs text-amber-500 font-medium">今日盤中數字未定</span>}
        </div>
          <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 640 ? 220 : 300}>
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={60} />
              <Tooltip
                formatter={(value: number, _name: string, item: { payload?: { dailyChangePercent?: number | null } }) => {
                  const pct = item?.payload?.dailyChangePercent
                  const pctStr = pct != null ? `（${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%）` : ''
                  return [`${fmtTooltipValue(value)}${pctStr}`, '當日損益']
                }}
                labelFormatter={(_: string, payload) => `日期：${payload?.[0]?.payload?.fullDate ?? ''}`}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                cursor={{ fill: '#f9fafb' }}
              />
              <ReferenceLine y={0} stroke="#d1d5db" />
              <Bar dataKey="dailyChange" maxBarSize={40} radius={[2, 2, 0, 0]}>
                {chartData.map((entry, i) => {
                  const isIntradayBar = intraday && entry.fullDate === today
                  return (
                    <Cell
                      key={i}
                      fill={entry.dailyChange >= 0 ? UP_COLOR : DOWN_COLOR}
                      fillOpacity={isIntradayBar ? 0.35 : 0.85}
                      stroke={isIntradayBar ? '#f59e0b' : undefined}
                      strokeWidth={isIntradayBar ? 1.5 : 0}
                      strokeDasharray={isIntradayBar ? '3 2' : undefined}
                    />
                  )
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      {chartData.length > 0 && tab === 'cumulative' && (
        <>
          <p className="text-xs text-gray-400 mb-3">從第一筆交易起的累計總損益走勢</p>
          <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 640 ? 220 : 300}>
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={cumulColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={cumulColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={60} />
              <Tooltip
                formatter={(value: number, name: string) => [fmtTooltipValue(value), CUMULATIVE_LABELS[name] ?? name]}
                labelFormatter={(_: string, payload) => `日期：${payload?.[0]?.payload?.fullDate ?? ''}`}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend formatter={(v: string) => CUMULATIVE_LABELS[v] ?? v} wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="4 2" />
              <Area type="monotone" dataKey="totalPnL" stroke={cumulColor} strokeWidth={2} fill="url(#grad)" dot={false} activeDot={{ r: 4, fill: cumulColor, strokeWidth: 0 }} />
              <Area type="monotone" dataKey="unrealizedPnL" stroke="#93c5fd" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 2" />
              <Area type="monotone" dataKey="realizedPnL" stroke="#fbbf24" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
