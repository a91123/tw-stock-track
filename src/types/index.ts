export type TransactionType = 'buy' | 'sell'

export interface Transaction {
  id: string
  stockCode: string
  type: TransactionType
  date: string // YYYY-MM-DD
  shares: number
  price: number
  note?: string
}

export interface StockPrice {
  date: string // YYYY-MM-DD
  close: number
}

export interface DailyPortfolioData {
  date: string
  portfolioValue: number
  costBasis: number
  unrealizedPnL: number
  realizedPnL: number
  totalPnL: number
  dailyChange: number // today's totalPnL minus previous day's totalPnL
  dailyChangePercent: number | null // dailyChange ÷ previous day's portfolioValue; null when no base
}

export interface PortfolioSummaryData {
  totalPnL: number
  unrealizedPnL: number
  realizedPnL: number
  portfolioValue: number
  costBasis: number
  returnRate: number
}
