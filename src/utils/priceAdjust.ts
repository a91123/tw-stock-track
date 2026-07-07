import { AppliedSplit } from '../services/firestore'

// 用使用者確認過的分割紀錄（精確比例，不是股價反推的估計值）回頭校正歷史股價。
// 分割套用時交易紀錄是「股數 ×ratio、單價 ÷ratio」，歷史股價要用同樣的除法，
// 分割日之前的股價基準才會跟分割後的股數基準對齊。
// 多筆分割由新到舊依序疊乘：越早的日期要疊乘越多次分割比例。
export function adjustPricesForSplits(
  prices: Map<string, number>,
  splits: AppliedSplit[],
): Map<string, number> {
  if (splits.length === 0) return prices
  const sorted = [...splits].sort((a, b) => b.splitDate.localeCompare(a.splitDate))
  const result = new Map<string, number>()
  prices.forEach((close, date) => {
    let adjusted = close
    for (const s of sorted) {
      if (date <= s.splitDate) adjusted = adjusted / s.ratio
    }
    result.set(date, adjusted)
  })
  return result
}
