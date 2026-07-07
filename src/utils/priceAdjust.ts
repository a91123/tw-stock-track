import { AppliedSplit } from '../services/firestore'

// 用使用者確認過的分割紀錄（精確比例，不是股價反推的估計值）回頭校正歷史股價。
// 分割套用時交易紀錄是「股數 ×ratio、單價 ÷ratio」，歷史股價要用同樣的除法，
// 分割日之前的股價基準才會跟分割後的股數基準對齊。
// 多筆「不同日期」的分割由新到舊依序疊乘：越早的日期要疊乘越多次分割比例。
export function adjustPricesForSplits(
  prices: Map<string, number>,
  splits: AppliedSplit[],
): Map<string, number> {
  if (splits.length === 0) return prices

  // 同一個日期可能被記錄了不只一筆（例如誤觸重複確認、或刪除重建交易後又套用一次卻沒清掉
  // 舊紀錄），這些代表的是同一個真實分割事件，只能算一次 —— 只取每個日期最後套用的那筆，
  // 不要把重複紀錄也疊乘進去，否則股價會被除好幾次
  const latestByDate = new Map<string, AppliedSplit>()
  for (const s of splits) {
    const existing = latestByDate.get(s.splitDate)
    if (!existing || s.appliedAt > existing.appliedAt) latestByDate.set(s.splitDate, s)
  }
  const deduped = [...latestByDate.values()]
  if (deduped.length === 0) return prices

  const sorted = deduped.sort((a, b) => b.splitDate.localeCompare(a.splitDate))
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
