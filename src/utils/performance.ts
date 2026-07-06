// 個股表現：純看股價的漲跌幅（近1日/5日/20日以「交易日」為單位回推，不是日曆天），
// 跟損益/成本無關，只是價格動能一覽。

export interface StockPerformance {
  stockCode: string
  change1d: number | null
  change5d: number | null
  change20d: number | null
  changeYTD: number | null
}

function pctChange(from: number, to: number): number {
  return ((to - from) / from) * 100
}

// 今年以來的基準＝去年最後一個交易日收盤；若股價資料本身就從今年才開始（例如今年才買進），
// 用該股最早一筆價格當基準（等同「自建倉以來」）。
function findYtdBaseline(sorted: [string, number][], yearStart: string): number | null {
  let baseline: number | null = null
  for (const [date, price] of sorted) {
    if (date < yearStart) baseline = price
    else break
  }
  return baseline ?? (sorted.length > 0 ? sorted[0][1] : null)
}

export function getStockPerformance(
  codes: string[],
  pricesByStock: Map<string, Map<string, number>>,
): StockPerformance[] {
  const yearStart = `${new Date().getFullYear()}-01-01`

  return codes.map(stockCode => {
    const priceMap = pricesByStock.get(stockCode)
    if (!priceMap || priceMap.size === 0) {
      return { stockCode, change1d: null, change5d: null, change20d: null, changeYTD: null }
    }

    const sorted = [...priceMap.entries()].sort(([a], [b]) => a.localeCompare(b))
    const latest = sorted[sorted.length - 1][1]

    const lookback = (n: number): number | null => {
      const idx = sorted.length - 1 - n
      return idx >= 0 ? pctChange(sorted[idx][1], latest) : null
    }

    const ytdBaseline = findYtdBaseline(sorted, yearStart)

    return {
      stockCode,
      change1d: lookback(1),
      change5d: lookback(5),
      change20d: lookback(20),
      changeYTD: ytdBaseline !== null ? pctChange(ytdBaseline, latest) : null,
    }
  })
}
