export type TransactionType = 'buy' | 'sell' | 'dividend' | 'stockDividend'

// 'dividend'（現金股利）：shares = 配息基準股數、price = 每股現金股利，
// shares × price = 現金股利總額；不影響持股數，只計入已實現損益。
// 'stockDividend'（配股/股票股利）：shares = 新增股數，price 固定 0。
// 不計現金流，只增加持股數並攤薄均價成本（總成本不變）。
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

// 目前持股的單一批次（尚未賣出的買入/配股 lot）
export interface StockLot {
  date: string                 // 買入/配股日期
  shares: number                // 剩餘股數
  costPerShare: number          // 該批次每股成本（配股批次為 0）
  marketValue: number | null
  unrealizedPnL: number | null
  returnRate: number | null     // 成本為 0 時無意義，回傳 null
}

// 個股損益明細（含已出清的股票，realizedPnL 仍保留）
export interface StockDetail {
  stockCode: string
  totalShares: number          // 目前持股數
  avgCost: number              // 目前持股的均攤成本
  totalCost: number            // 目前持股的成本（剩餘 lots）
  currentPrice: number | null
  marketValue: number | null
  unrealizedPnL: number | null
  realizedTradePnL: number     // 已實現價差損益（賣出，含買賣費用/稅）
  dividendTotal: number        // 累計現金股利
  realizedPnL: number          // realizedTradePnL + dividendTotal
  totalPnL: number | null      // unrealizedPnL + realizedPnL
  totalBuyCost: number         // 歷來買進成本合計（含手續費），報酬率分母
  returnRate: number | null    // totalPnL / totalBuyCost
  annualizedReturn: number | null // 個股 XIRR
  firstDate: string
  transactions: Transaction[]  // 該股票的所有交易（已依日期排序）
  lots: StockLot[]             // 目前持股明細，依批次日期新到舊排序
}
