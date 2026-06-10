import { useState, useMemo } from 'react'
import { DailyPortfolioData } from '../types'
import { todayTW, isTradingHours } from '../utils/market'

const DOW = ['一', '二', '三', '四', '五', '六', '日']

interface Cell {
  day: number | null
  dateStr: string | null
  change: number | null
  isToday: boolean
}

function buildWeeks(year: number, month: number, pnlMap: Map<string, number>): Cell[][] {
  const today = todayTW()
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7 // Mon=0 … Sun=6

  const cells: Cell[] = Array.from({ length: startOffset }, () => ({
    day: null, dateStr: null, change: null, isToday: false,
  }))

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      day: d,
      dateStr,
      change: pnlMap.get(dateStr) ?? null,
      isToday: dateStr === today,
    })
  }

  while (cells.length % 7 !== 0)
    cells.push({ day: null, dateStr: null, change: null, isToday: false })

  const weeks: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function fmtAmt(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}萬`
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`
  return `${sign}${abs}`
}

interface Props {
  data: DailyPortfolioData[]
}

export default function ReturnCalendar({ data }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const intraday = isTradingHours()

  const pnlMap = useMemo(() => {
    const m = new Map<string, number>()
    data.forEach(d => m.set(d.date, d.dailyChange))
    return m
  }, [data])

  const weeks = useMemo(() => buildWeeks(year, month, pnlMap), [year, month, pnlMap])

  const maxAbs = useMemo(() => {
    let max = 1
    weeks.flat().forEach(c => { if (c.change !== null) max = Math.max(max, Math.abs(c.change)) })
    return max
  }, [weeks])

  // Include today even if intraday — must match cumulative P&L (telescoping sum)
  const monthTotal = useMemo(
    () => weeks.flat().reduce((s, c) => s + (c.change ?? 0), 0),
    [weeks],
  )

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  function prev() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function next() {
    if (isCurrentMonth) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const roundedTotal = Math.round(monthTotal)

  return (
    <div className="bg-white rounded-xl p-3 sm:p-5 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">報酬日曆</h2>
          {roundedTotal !== 0 && (
            <span className={`text-sm font-bold ${roundedTotal > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {fmtAmt(roundedTotal)}
            </span>
          )}
          {intraday && isCurrentMonth && (
            <span className="text-xs text-amber-500 font-medium">盤中數字未定</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 text-xl leading-none">‹</button>
          <span className="text-sm font-medium text-gray-700 w-24 text-center">
            {year}/{String(month).padStart(2, '0')}
          </span>
          <button
            onClick={next}
            disabled={isCurrentMonth}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 text-xl leading-none disabled:opacity-30"
          >›</button>
        </div>
      </div>

      {/* Grid: 7 weekday cols + 1 weekly-total col */}
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, 1fr) 44px' }}>
        {/* Headers */}
        {DOW.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
        <div className="text-center text-xs text-gray-400 font-medium py-1">週損益</div>

        {weeks.flatMap((week, wi) => {
          const weekTotal = Math.round(week.reduce((s, c) => s + (c.change ?? 0), 0))
          const weekHasData = week.some(c => c.change !== null)

          const dayCells = week.map((cell, di) => {
            if (!cell.day) return <div key={`e-${wi}-${di}`} />

            const isIntradayCell = cell.isToday && intraday

            const ratio = cell.change !== null && maxAbs > 0
              ? Math.min(Math.abs(cell.change) / maxAbs, 1) : 0
            // Intraday cell: half opacity to signal uncertainty
            const alpha = cell.change !== null && cell.change !== 0
              ? (isIntradayCell ? 0.18 : 0.15 + ratio * 0.7)
              : 0

            const bg = cell.change === null || cell.change === 0 ? undefined
              : cell.change > 0
                ? `rgba(220, 38, 38, ${alpha})`
                : `rgba(22, 163, 74, ${alpha})`

            const amtColor = cell.change !== null && cell.change !== 0
              ? cell.change > 0 ? 'text-red-700' : 'text-green-700'
              : 'text-gray-400'

            return (
              <div
                key={cell.dateStr!}
                style={{ backgroundColor: bg }}
                className={`rounded-lg p-1 sm:p-1.5 flex flex-col min-h-[44px] sm:min-h-[56px] relative ${
                  cell.isToday
                    ? isIntradayCell
                      ? 'ring-2 ring-amber-400 ring-inset'   // 盤中：橘色框
                      : 'ring-2 ring-blue-400 ring-inset'    // 收盤後：藍色框
                    : ''
                }`}
              >
                <span className={`text-xs leading-none ${
                  cell.isToday
                    ? isIntradayCell ? 'font-bold text-amber-500' : 'font-bold text-blue-600'
                    : 'text-gray-500'
                }`}>
                  {cell.day}
                </span>

                {isIntradayCell ? (
                  /* 盤中：顯示「盤中」標籤，數字灰色表示未定 */
                  <div className="mt-auto flex flex-col gap-0.5">
                    <span className="text-amber-500 font-semibold" style={{ fontSize: '9px' }}>盤中</span>
                    {cell.change !== null && (
                      <span className="text-gray-400" style={{ fontSize: '10px', lineHeight: 1.3 }}>
                        {fmtAmt(Math.round(cell.change))}
                      </span>
                    )}
                  </div>
                ) : (
                  cell.change !== null && (
                    <span className={`mt-auto font-medium ${amtColor}`} style={{ fontSize: '10px', lineHeight: 1.3 }}>
                      {fmtAmt(Math.round(cell.change))}
                    </span>
                  )
                )}
              </div>
            )
          })

          const weekTotalCell = (
            <div key={`wt-${wi}`} className="flex items-center justify-end pr-0.5">
              {weekHasData && weekTotal !== 0 && (
                <span
                  className={`font-semibold ${weekTotal > 0 ? 'text-red-600' : 'text-green-600'}`}
                  style={{ fontSize: '10px' }}
                >
                  {fmtAmt(weekTotal)}
                </span>
              )}
            </div>
          )

          return [...dayCells, weekTotalCell]
        })}
      </div>
    </div>
  )
}
