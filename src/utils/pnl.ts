import { Transaction, DailyPortfolioData, PortfolioSummaryData } from '../types'
import { FeeSettings, tradeFee, sellTax } from './fees'

interface Lot {
  shares: number
  costPerShare: number
}

type PositionMap = Map<string, Lot[]>

function applyTransactionsUpTo(
  transactions: Transaction[],
  date: string,
  fees: FeeSettings,
): { positions: PositionMap; realizedPnL: number } {
  const positions: PositionMap = new Map()
  let realizedPnL = 0

  const relevant = [...transactions]
    .filter(t => t.date <= date)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.type === 'buy' ? -1 : 1 // buys before sells on same day
    })

  for (const tx of relevant) {
    if (!positions.has(tx.stockCode)) positions.set(tx.stockCode, [])
    const lots = positions.get(tx.stockCode)!

    const amount = tx.shares * tx.price

    if (tx.type === 'buy') {
      // 買入手續費攤入成本
      const fee = fees.enabled ? tradeFee(amount, fees.discount) : 0
      lots.push({ shares: tx.shares, costPerShare: (amount + fee) / tx.shares })
    } else {
      // FIFO sell
      let remaining = tx.shares
      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0]
        const toSell = Math.min(remaining, lot.shares)
        realizedPnL += toSell * (tx.price - lot.costPerShare)
        lot.shares -= toSell
        remaining -= toSell
        if (lot.shares === 0) lots.shift()
      }
      // 賣出手續費 + 證交稅直接從已實現損益扣除
      if (fees.enabled) {
        realizedPnL -= tradeFee(amount, fees.discount) + sellTax(amount, tx.stockCode)
      }
    }
  }

  return { positions, realizedPnL }
}

function lastKnownPrice(
  pricesByStock: Map<string, Map<string, number>>,
  stockCode: string,
  upToDate: string,
): number | null {
  const prices = pricesByStock.get(stockCode)
  if (!prices) return null
  let last: number | null = null
  for (const [d, p] of [...prices.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (d > upToDate) break
    last = p
  }
  return last
}

export function calculateDailyPnL(
  transactions: Transaction[],
  pricesByStock: Map<string, Map<string, number>>,
  fees: FeeSettings,
): DailyPortfolioData[] {
  if (transactions.length === 0) return []

  const minDate = transactions.reduce(
    (min, t) => (t.date < min ? t.date : min),
    transactions[0].date,
  )

  const allDates = new Set<string>()
  pricesByStock.forEach(prices => {
    prices.forEach((_, d) => { if (d >= minDate) allDates.add(d) })
  })
  if (allDates.size === 0) return []

  const result: DailyPortfolioData[] = []

  for (const date of [...allDates].sort()) {
    const { positions, realizedPnL } = applyTransactionsUpTo(transactions, date, fees)

    let portfolioValue = 0
    let costBasis = 0

    positions.forEach((lots, stockCode) => {
      const totalShares = lots.reduce((s, l) => s + l.shares, 0)
      if (totalShares === 0) return
      const price = lastKnownPrice(pricesByStock, stockCode, date)
      if (price === null) return
      portfolioValue += totalShares * price
      costBasis += lots.reduce((s, l) => s + l.shares * l.costPerShare, 0)
    })

    const unrealizedPnL = portfolioValue - costBasis
    const totalPnL = unrealizedPnL + realizedPnL
    const dailyChange = result.length > 0 ? totalPnL - result[result.length - 1].totalPnL : totalPnL
    const prevValue = result.length > 0 ? result[result.length - 1].portfolioValue : 0
    const dailyChangePercent = prevValue > 0 ? (dailyChange / prevValue) * 100 : null
    result.push({ date, portfolioValue, costBasis, unrealizedPnL, realizedPnL, totalPnL, dailyChange, dailyChangePercent })
  }

  return result
}

export function computeSummary(dailyData: DailyPortfolioData[]): PortfolioSummaryData {
  if (dailyData.length === 0)
    return { totalPnL: 0, unrealizedPnL: 0, realizedPnL: 0, portfolioValue: 0, costBasis: 0, returnRate: 0 }
  const latest = dailyData[dailyData.length - 1]
  const returnRate = latest.costBasis > 0 ? (latest.totalPnL / latest.costBasis) * 100 : 0
  return { ...latest, returnRate }
}

export function getUniqueStockCodes(transactions: Transaction[]): string[] {
  return [...new Set(transactions.map(t => t.stockCode))]
}

export interface HoldingData {
  stockCode: string
  totalShares: number
  avgCost: number
  currentPrice: number | null
  marketValue: number | null
  unrealizedPnL: number | null
  returnRate: number | null
}

export function getCurrentHoldings(
  transactions: Transaction[],
  currentPrices: Map<string, number>,
  fees: FeeSettings,
): HoldingData[] {
  if (transactions.length === 0) return []
  const today = new Date().toISOString().slice(0, 10)
  const { positions } = applyTransactionsUpTo(transactions, today, fees)
  const holdings: HoldingData[] = []

  positions.forEach((lots, stockCode) => {
    const totalShares = lots.reduce((s, l) => s + l.shares, 0)
    if (totalShares === 0) return
    const totalCost = lots.reduce((s, l) => s + l.shares * l.costPerShare, 0)
    const avgCost = totalCost / totalShares
    const currentPrice = currentPrices.get(stockCode) ?? null
    const marketValue = currentPrice !== null ? totalShares * currentPrice : null
    const unrealizedPnL = marketValue !== null ? marketValue - totalCost : null
    const returnRate = unrealizedPnL !== null && totalCost > 0 ? (unrealizedPnL / totalCost) * 100 : null
    holdings.push({ stockCode, totalShares, avgCost, currentPrice, marketValue, unrealizedPnL, returnRate })
  })

  return holdings.sort((a, b) => a.stockCode.localeCompare(b.stockCode))
}
