import { useState, useEffect, useMemo } from 'react'
import * as Sentry from '@sentry/react'
import { Transaction } from './types'
import { fetchStockPrices, getStockMarket } from './services/stockPrices'
import { fetchRealtimeQuotes, StockSymbol } from './services/realtimeQuotes'
import { isTradingHours } from './utils/market'
import { calculateDailyPnL, computeSummary, getCurrentHoldings } from './utils/pnl'
import { useLocalStorage } from './hooks/useLocalStorage'
import TransactionForm from './components/TransactionForm'
import TransactionList from './components/TransactionList'
import PnLChart from './components/PnLChart'
import PortfolioSummary from './components/PortfolioSummary'
import Holdings from './components/Holdings'
import ReturnCalendar from './components/ReturnCalendar'
import ImportTransactions from './components/ImportTransactions'
import FeeSettingsBar from './components/FeeSettingsBar'
import { FeeSettings, loadFeeSettings, saveFeeSettings } from './utils/fees'

export default function App() {
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>('tw-stock-transactions', [])
  const [pricesByStock, setPricesByStock] = useState<Map<string, Map<string, number>>>(new Map())
  const [feeSettings, setFeeSettings] = useState<FeeSettings>(() => loadFeeSettings())
  const [realtimePrices, setRealtimePrices] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Stable primitive key — changes only when actual stock list or earliest date changes
  const fetchKey = useMemo(() => {
    if (transactions.length === 0) return ''
    const codes = [...new Set(transactions.map(t => t.stockCode))].sort().join(',')
    const minDate = transactions.reduce((m, t) => (t.date < m ? t.date : m), transactions[0].date)
    return `${codes}|${minDate}`
  }, [transactions])

  useEffect(() => {
    if (!fetchKey) {
      setPricesByStock(new Map())
      return
    }
    const [codesStr, minDate] = fetchKey.split('|')
    const codes = codesStr.split(',')
    void loadPrices(codes, minDate, false)
  }, [fetchKey])

  async function loadPrices(codes: string[], minDate: string, force: boolean) {
    setLoading(true)
    setError(null)
    const errors: string[] = []
    const newMap = new Map<string, Map<string, number>>()

    await Promise.allSettled(
      codes.map(async code => {
        try {
          const prices = await fetchStockPrices(code, minDate, force)
          const m = new Map<string, number>()
          prices.forEach(p => m.set(p.date, p.close))
          newMap.set(code, m)
        } catch (err) {
          Sentry.captureException(err, { tags: { feature: 'stock-prices' }, extra: { code } })
          errors.push(`${code}: ${err instanceof Error ? err.message : '未知錯誤'}`)
        }
      }),
    )

    if (errors.length > 0) setError(`無法取得股價：${errors.join('；')}`)
    setPricesByStock(new Map(newMap))
    setLastUpdated(new Date())
    setLoading(false)
  }

  function handleRefresh() {
    if (!fetchKey) return
    const [codesStr, minDate] = fetchKey.split('|')
    void loadPrices(codesStr.split(','), minDate, true)
  }

  function updateFeeSettings(s: FeeSettings) {
    setFeeSettings(s)
    saveFeeSettings(s)
  }

  const dailyPnL = useMemo(
    () => calculateDailyPnL(transactions, pricesByStock, feeSettings),
    [transactions, pricesByStock, feeSettings],
  )

  // 盤中即時報價：開盤時間每 30 秒輪詢一次（MIS 批次查詢），分頁不在前景時暫停。
  // 失敗靜默跳過，畫面維持上一次的價格。
  useEffect(() => {
    if (pricesByStock.size === 0) return

    async function tick() {
      if (!isTradingHours() || document.hidden) return
      const symbols: StockSymbol[] = []
      pricesByStock.forEach((_, code) => {
        const market = getStockMarket(code)
        if (market) symbols.push({ code, market })
      })
      if (symbols.length === 0) return
      try {
        const quotes = await fetchRealtimeQuotes(symbols)
        if (quotes.size > 0) {
          setRealtimePrices(quotes)
          setLastUpdated(new Date())
        }
      } catch { /* 即時價丟一拍無感，下一輪再試 */ }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 30_000)
    const onVisible = () => { if (!document.hidden) void tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pricesByStock])

  const currentPrices = useMemo(() => {
    const m = new Map<string, number>()
    pricesByStock.forEach((prices, code) => {
      const sorted = [...prices.entries()].sort(([a], [b]) => b.localeCompare(a))
      if (sorted.length > 0) m.set(code, sorted[0][1])
    })
    // 盤中即時價覆蓋最近收盤價
    realtimePrices.forEach((price, code) => m.set(code, price))
    return m
  }, [pricesByStock, realtimePrices])

  const holdings = useMemo(
    () => getCurrentHoldings(transactions, currentPrices, feeSettings),
    [transactions, currentPrices, feeSettings],
  )

  // 總覽：收盤後以每日損益的最新一筆為準；盤中有即時價時改用持股現值計算
  const summary = useMemo(() => {
    const base = computeSummary(dailyPnL)
    if (realtimePrices.size === 0 || holdings.length === 0) return base
    const portfolioValue = holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0)
    const costBasis = holdings.reduce((s, h) => s + h.totalShares * h.avgCost, 0)
    const unrealizedPnL = portfolioValue - costBasis
    const totalPnL = unrealizedPnL + base.realizedPnL
    return {
      ...base,
      portfolioValue,
      costBasis,
      unrealizedPnL,
      totalPnL,
      returnRate: costBasis > 0 ? (totalPnL / costBasis) * 100 : 0,
    }
  }, [dailyPnL, holdings, realtimePrices])

  function addTransaction(tx: Omit<Transaction, 'id'>) {
    setTransactions([...transactions, { ...tx, id: crypto.randomUUID() }])
  }

  function addTransactions(txs: Omit<Transaction, 'id'>[]) {
    setTransactions([...transactions, ...txs.map(tx => ({ ...tx, id: crypto.randomUUID() }))])
  }

  function deleteTransaction(id: string) {
    setTransactions(transactions.filter(t => t.id !== id))
  }

  const hasData = transactions.length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">台股損益追蹤器</span>
            <span className="text-xs text-gray-400 hidden sm:inline">Taiwan Stock P&amp;L Tracker</span>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                更新：{lastUpdated.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={loading || !hasData}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '更新中…' : '更新股價'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Summary + chart (visible once data exists) */}
        {hasData && (
          <>
            <PortfolioSummary summary={summary} loading={loading} />
            {dailyPnL.length > 0 && <PnLChart data={dailyPnL} />}
            {dailyPnL.length > 0 && <ReturnCalendar data={dailyPnL} />}
            {holdings.length > 0 && <Holdings holdings={holdings} isRealtime={realtimePrices.size > 0} />}
          </>
        )}

        {/* Empty state */}
        {!hasData && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">📈</p>
            <p className="text-sm font-medium text-gray-600 mb-1">開始追蹤你的台股損益</p>
            <p className="text-xs">在下方新增第一筆買入紀錄，系統將自動從 Yahoo Finance 抓取歷史股價</p>
          </div>
        )}

        {/* Fee settings */}
        {hasData && <FeeSettingsBar settings={feeSettings} onChange={updateFeeSettings} />}

        {/* Input + list */}
        <ImportTransactions onAddMany={addTransactions} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          <TransactionForm onAdd={addTransaction} />
          <TransactionList transactions={transactions} onDelete={deleteTransaction} />
        </div>
      </main>

      <footer className="text-center py-6 text-xs text-gray-300">
        股價資料來源：台灣證券交易所、櫃買中心｜資料僅供參考，不構成投資建議
      </footer>
    </div>
  )
}
