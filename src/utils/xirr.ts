// 年化報酬率（XIRR）：用不規則時間的現金流計算內部報酬率。
//
// 現金流符號約定（以投資人立場）：
//   - 買入：流出（負），金額 = 成交金額 + 手續費
//   - 賣出：流入（正），金額 = 成交金額 − 手續費 − 證交稅
//   - 現金股利：流入（正）
//   - 期末：把「目前持股市值」當成一筆今日的流入（正）
//
// 解出 r 使 Σ amount_i / (1+r)^(years_i) = 0，years 以 365 天為一年。

import { Transaction } from '../types'
import { FeeSettings, tradeFee, sellTax } from './fees'

export interface CashFlow {
  date: string // YYYY-MM-DD
  amount: number // 流入為正、流出為負
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

function yearsBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_YEAR
}

// 由交易紀錄 + 目前股價組出投資人的現金流。
// finalDate 預設今天；期末市值由 currentPrices 計算（缺價的持股會被忽略，
// 此時 incompletePrices=true，年化報酬會偏低，呼叫端可據此提示）。
export function buildCashFlows(
  transactions: Transaction[],
  currentPrices: Map<string, number>,
  fees: FeeSettings,
  finalDate?: string,
): { flows: CashFlow[]; incompletePrices: boolean } {
  const flows: CashFlow[] = []

  // FIFO 計算期末仍持有的股數（沿用與 pnl.ts 相同的配對規則）
  const lots = new Map<string, number>() // code -> 持股數

  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.type === 'buy' ? -1 : 1
  })

  for (const tx of sorted) {
    const amount = tx.shares * tx.price
    if (tx.type === 'buy') {
      const fee = fees.enabled ? tradeFee(amount, fees.discount) : 0
      flows.push({ date: tx.date, amount: -(amount + fee) })
      lots.set(tx.stockCode, (lots.get(tx.stockCode) ?? 0) + tx.shares)
    } else if (tx.type === 'sell') {
      const cost = fees.enabled ? tradeFee(amount, fees.discount) + sellTax(amount, tx.stockCode) : 0
      flows.push({ date: tx.date, amount: amount - cost })
      lots.set(tx.stockCode, (lots.get(tx.stockCode) ?? 0) - tx.shares)
    } else {
      // 現金股利
      flows.push({ date: tx.date, amount })
    }
  }

  const today = finalDate ?? new Date().toISOString().slice(0, 10)
  let finalValue = 0
  let incompletePrices = false
  lots.forEach((shares, code) => {
    if (shares <= 0) return
    const price = currentPrices.get(code)
    if (price === undefined) { incompletePrices = true; return }
    finalValue += shares * price
  })
  if (finalValue > 0) flows.push({ date: today, amount: finalValue })

  return { flows, incompletePrices }
}

function npv(flows: CashFlow[], rate: number, base: string): number {
  let sum = 0
  for (const f of flows) sum += f.amount / Math.pow(1 + rate, yearsBetween(base, f.date))
  return sum
}

function dNpv(flows: CashFlow[], rate: number, base: string): number {
  let sum = 0
  for (const f of flows) {
    const t = yearsBetween(base, f.date)
    sum += (-t * f.amount) / Math.pow(1 + rate, t + 1)
  }
  return sum
}

// 回傳年化報酬率（小數，0.12 = 12%）；無法計算時回 null。
export function xirr(flows: CashFlow[]): number | null {
  // 至少要有一筆流出與一筆流入，否則 IRR 無意義
  if (flows.length < 2) return null
  const hasPos = flows.some(f => f.amount > 0)
  const hasNeg = flows.some(f => f.amount < 0)
  if (!hasPos || !hasNeg) return null

  const base = flows.reduce((min, f) => (f.date < min ? f.date : min), flows[0].date)

  // Newton-Raphson
  let rate = 0.1
  for (let i = 0; i < 100; i++) {
    const value = npv(flows, rate, base)
    if (Math.abs(value) < 1e-6) return rate
    const deriv = dNpv(flows, rate, base)
    if (deriv === 0 || !isFinite(deriv)) break
    const next = rate - value / deriv
    if (!isFinite(next)) break
    if (Math.abs(next - rate) < 1e-7) { rate = next; break }
    rate = next
  }
  if (isFinite(rate) && rate > -0.999999 && Math.abs(npv(flows, rate, base)) < 1e-3) return rate

  // 二分法 fallback：在 [-0.9999, 10]（即 -99.99% ~ 1000%）找變號區間
  let lo = -0.9999
  let hi = 10
  let fLo = npv(flows, lo, base)
  let fHi = npv(flows, hi, base)
  if (fLo * fHi > 0) return null // 區間內無解（極端現金流）
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(flows, mid, base)
    if (Math.abs(fMid) < 1e-6) return mid
    if (fLo * fMid < 0) { hi = mid; fHi = fMid }
    else { lo = mid; fLo = fMid }
  }
  return (lo + hi) / 2
}

// 便利函式：直接算一組交易的年化報酬率（百分比），無法算回 null。
export function annualizedReturn(
  transactions: Transaction[],
  currentPrices: Map<string, number>,
  fees: FeeSettings,
): number | null {
  const { flows } = buildCashFlows(transactions, currentPrices, fees)
  const r = xirr(flows)
  return r === null ? null : r * 100
}
