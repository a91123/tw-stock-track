export interface DividendRecord {
  stockCode: string
  exDate: string       // YYYY-MM-DD
  cashPerShare: number // 每股現金股利
}

interface FinMindDividend {
  stock_id: string
  CashExDividendTradingDate: string
  CashEarningsDistribution: number
  CashStatutorySurplus: number
}

export async function fetchDividends(stockCode: string): Promise<DividendRecord[]> {
  try {
    const res = await fetch(
      `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividend&data_id=${encodeURIComponent(stockCode)}&start_date=2015-01-01`,
    )
    if (!res.ok) return []
    const json = (await res.json()) as { status: number; data: FinMindDividend[] }
    if (json.status !== 200) return []

    return json.data
      .filter(d => d.CashExDividendTradingDate && d.CashExDividendTradingDate !== '0000-00-00')
      .map(d => ({
        stockCode,
        exDate: d.CashExDividendTradingDate,
        cashPerShare: (d.CashEarningsDistribution ?? 0) + (d.CashStatutorySurplus ?? 0),
      }))
      .filter(d => d.cashPerShare > 0)
  } catch {
    return []
  }
}
