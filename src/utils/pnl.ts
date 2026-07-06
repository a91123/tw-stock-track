import { Transaction, DailyPortfolioData, PortfolioSummaryData, StockDetail, StockLot } from '../types'

// 除息日「前」的持股數（不含 date 當天的交易）。
// 台股規則：除息日前一日收盤持有才配息；除息日當天買進不配、當天賣出仍配。
export function getSharesOnDate(transactions: Transaction[], stockCode: string, date: string): number {
  let shares = 0
  for (const tx of transactions) {
    if (tx.stockCode !== stockCode || tx.date >= date) continue
    if (tx.type === 'buy' || tx.type === 'stockDividend') shares += tx.shares
    else if (tx.type === 'sell') shares -= tx.shares
  }
  return Math.max(0, Math.round(shares))
}
import { FeeSettings, tradeFee, sellTax } from './fees'
import { annualizedReturn } from './xirr'

interface Lot {
  shares: number
  costPerShare: number
  date?: string // 僅 getStockDetails 用於呈現目前持股明細，其餘用途不設定
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
      return a.type === 'sell' ? 1 : -1 // 賣出以外（含配股）都先處理，確保同日股數已到位
    })

  for (const tx of relevant) {
    if (!positions.has(tx.stockCode)) positions.set(tx.stockCode, [])
    const lots = positions.get(tx.stockCode)!

    const amount = tx.shares * tx.price

    if (tx.type === 'dividend') {
      // 現金股利：直接計入已實現損益，不影響持股
      realizedPnL += amount
    } else if (tx.type === 'stockDividend') {
      // 配股：新增股數、成本 0，等同攤薄均價（總成本不變、總股數增加）
      if (tx.shares > 0) lots.push({ shares: tx.shares, costPerShare: 0 })
    } else if (tx.type === 'buy') {
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

// 個股損益明細：每檔股票的已實現/未實現/股利/年化報酬，含已出清的股票。
export function getStockDetails(
  transactions: Transaction[],
  currentPrices: Map<string, number>,
  fees: FeeSettings,
): StockDetail[] {
  // 依股票分組
  const byCode = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (!byCode.has(tx.stockCode)) byCode.set(tx.stockCode, [])
    byCode.get(tx.stockCode)!.push(tx)
  }

  const details: StockDetail[] = []

  byCode.forEach((txs, stockCode) => {
    const sorted = [...txs].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.type === 'sell' ? 1 : -1
    })

    const lots: Lot[] = []
    let realizedTradePnL = 0
    let dividendTotal = 0
    let totalBuyCost = 0

    for (const tx of sorted) {
      const amount = tx.shares * tx.price
      if (tx.type === 'dividend') {
        dividendTotal += amount
      } else if (tx.type === 'stockDividend') {
        if (tx.shares > 0) lots.push({ shares: tx.shares, costPerShare: 0, date: tx.date })
      } else if (tx.type === 'buy') {
        const fee = fees.enabled ? tradeFee(amount, fees.discount) : 0
        lots.push({ shares: tx.shares, costPerShare: (amount + fee) / tx.shares, date: tx.date })
        totalBuyCost += amount + fee
      } else {
        let remaining = tx.shares
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0]
          const toSell = Math.min(remaining, lot.shares)
          realizedTradePnL += toSell * (tx.price - lot.costPerShare)
          lot.shares -= toSell
          remaining -= toSell
          if (lot.shares === 0) lots.shift()
        }
        if (fees.enabled) {
          realizedTradePnL -= tradeFee(amount, fees.discount) + sellTax(amount, tx.stockCode)
        }
      }
    }

    const totalShares = lots.reduce((s, l) => s + l.shares, 0)
    const totalCost = lots.reduce((s, l) => s + l.shares * l.costPerShare, 0)
    const avgCost = totalShares > 0 ? totalCost / totalShares : 0
    const currentPrice = currentPrices.get(stockCode) ?? null
    const marketValue = totalShares > 0 && currentPrice !== null ? totalShares * currentPrice : (totalShares === 0 ? 0 : null)
    const unrealizedPnL = marketValue !== null ? marketValue - totalCost : null
    const realizedPnL = realizedTradePnL + dividendTotal
    const totalPnL = unrealizedPnL !== null ? unrealizedPnL + realizedPnL : null
    const returnRate = totalPnL !== null && totalBuyCost > 0 ? (totalPnL / totalBuyCost) * 100 : null

    // 目前持股明細：尚未賣出的每一批次（依買入/配股日期），新到舊排序
    const stockLots: StockLot[] = lots
      .filter(l => l.shares > 0)
      .map(l => {
        const cost = l.shares * l.costPerShare
        const lotMarketValue = currentPrice !== null ? l.shares * currentPrice : null
        const lotUnrealizedPnL = lotMarketValue !== null ? lotMarketValue - cost : null
        // 配股批次成本為 0，報酬率無意義，顯示「—」而非誤導性的 0%
        const lotReturnRate = lotUnrealizedPnL !== null && cost > 0 ? (lotUnrealizedPnL / cost) * 100 : null
        return {
          date: l.date ?? '',
          shares: l.shares,
          costPerShare: l.costPerShare,
          marketValue: lotMarketValue,
          unrealizedPnL: lotUnrealizedPnL,
          returnRate: lotReturnRate,
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date))

    details.push({
      stockCode,
      totalShares,
      avgCost,
      totalCost,
      currentPrice,
      marketValue,
      unrealizedPnL,
      realizedTradePnL,
      dividendTotal,
      realizedPnL,
      totalPnL,
      totalBuyCost,
      returnRate,
      annualizedReturn: annualizedReturn(txs, currentPrices, fees),
      firstDate: sorted[0]?.date ?? '',
      transactions: sorted,
      lots: stockLots,
    })
  })

  // 持有中的排前面，其餘依代碼排序
  return details.sort((a, b) => {
    const aHeld = a.totalShares > 0 ? 0 : 1
    const bHeld = b.totalShares > 0 ? 0 : 1
    if (aHeld !== bHeld) return aHeld - bHeld
    return a.stockCode.localeCompare(b.stockCode)
  })
}
