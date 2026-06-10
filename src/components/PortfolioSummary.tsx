import type { ReactNode } from 'react'
import { PortfolioSummaryData } from '../types'

function fmtTWD(v: number) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v)
}

function PnLBadge({ value, large }: { value: number; large?: boolean }) {
  const cls = value >= 0 ? 'text-red-600' : 'text-green-600'
  const size = large ? 'text-2xl' : 'text-lg'
  return (
    <span className={`${cls} ${size} font-bold tabular-nums`}>
      {value >= 0 ? '+' : ''}
      {fmtTWD(value)}
    </span>
  )
}

function Card({ title, children, sub }: { title: string; children: ReactNode; sub?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-400 font-medium mb-1">{title}</p>
      <div>{children}</div>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function Skeleton() {
  return <div className="h-8 bg-gray-100 rounded animate-pulse w-32" />
}

interface Props {
  summary: PortfolioSummaryData
  loading: boolean
}

export default function PortfolioSummary({ summary, loading }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card
        title="總損益"
        sub={`${summary.returnRate >= 0 ? '+' : ''}${summary.returnRate.toFixed(2)}%`}
      >
        {loading ? <Skeleton /> : <PnLBadge value={summary.totalPnL} large />}
      </Card>

      <Card title="未實現損益">
        {loading ? <Skeleton /> : <PnLBadge value={summary.unrealizedPnL} large />}
      </Card>

      <Card title="已實現損益">
        {loading ? <Skeleton /> : <PnLBadge value={summary.realizedPnL} large />}
      </Card>

      <Card title="持倉市值" sub={`成本：${fmtTWD(summary.costBasis)}`}>
        {loading ? (
          <Skeleton />
        ) : (
          <span className="text-2xl font-bold text-gray-900 tabular-nums">
            {fmtTWD(summary.portfolioValue)}
          </span>
        )}
      </Card>
    </div>
  )
}
