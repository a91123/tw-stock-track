// 台股交易成本：
// - 手續費：成交金額 × 0.1425% × 券商折扣，最低 20 元（買賣都收）
// - 證交稅：賣出時收，股票 0.3%、ETF 0.1%
// 金額皆無條件捨去到整數元（券商慣例）

export interface FeeSettings {
  enabled: boolean
  discount: number // 1 = 無折扣, 0.6 = 6折, 0.28 = 2.8折
}

const STORAGE_KEY = 'tw-stock-fee-settings'

export const DEFAULT_FEE_SETTINGS: FeeSettings = { enabled: true, discount: 1 }

export function loadFeeSettings(): FeeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<FeeSettings>
      if (typeof p.enabled === 'boolean' && typeof p.discount === 'number' && p.discount > 0 && p.discount <= 1) {
        return { enabled: p.enabled, discount: p.discount }
      }
    }
  } catch { /* fall through to default */ }
  return DEFAULT_FEE_SETTINGS
}

export function saveFeeSettings(s: FeeSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

const FEE_RATE = 0.001425
const MIN_FEE = 20
const TAX_RATE_STOCK = 0.003
const TAX_RATE_ETF = 0.001

export function isETF(stockCode: string): boolean {
  return stockCode.startsWith('00')
}

// 買入或賣出的券商手續費
export function tradeFee(amount: number, discount: number): number {
  return Math.max(MIN_FEE, Math.floor(amount * FEE_RATE * discount))
}

// 賣出證交稅
export function sellTax(amount: number, stockCode: string): number {
  return Math.floor(amount * (isETF(stockCode) ? TAX_RATE_ETF : TAX_RATE_STOCK))
}
