import { useState, useEffect, useMemo } from 'react'
import { Transaction } from './types'
import { fetchStockPrices, clearPriceCache } from './services/yahooFinance'
import { calculateDailyPnL, computeSummary, getCurrentHoldings } from './utils/pnl'
import { useLocalStorage } from './hooks/useLocalStorage'
import TransactionForm from './components/TransactionForm'
import TransactionList from './components/TransactionList'
import PnLChart from './components/PnLChart'
import PortfolioSummary from './components/PortfolioSummary'
import Holdings from './components/Holdings'
import ReturnCalendar from './components/ReturnCalendar'
import ImportScreenshot from './components/ImportScreenshot'

export default function App() {
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>('tw-stock-transactions', [])
  const [pricesByStock, setPricesByStock] = useState<Map<string, Map<string, number>>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Clear cache on every app load → always fetch fresh prices on open
  useEffect(() => {
    clearPriceCache()
  }, [])

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
    clearPriceCache()
    const [codesStr, minDate] = fetchKey.split('|')
    void loadPrices(codesStr.split(','), minDate, true)
  }

  const dailyPnL = useMemo(() => calculateDailyPnL(transactions, pricesByStock), [transactions, pricesByStock])
  const summary = useMemo(() => computeSummary(dailyPnL), [dailyPnL])

  const currentPrices = useMemo(() => {
    const m = new Map<string, number>()
    pricesByStock.forEach((prices, code) => {
      const sorted = [...prices.entries()].sort(([a], [b]) => b.localeCompare(a))
      if (sorted.length > 0) m.set(code, sorted[0][1])
    })
    return m
  }, [pricesByStock])

  const holdings = useMemo(() => getCurrentHoldings(transactions, currentPrices), [transactions, currentPrices])

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
            {holdings.length > 0 && <Holdings holdings={holdings} />}
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

        {/* Input + list */}
        <ImportScreenshot onAddMany={addTransactions} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          <TransactionForm onAdd={addTransaction} />
          <TransactionList transactions={transactions} onDelete={deleteTransaction} />
        </div>
      </main>

      <footer className="text-center py-6 text-xs text-gray-300">
        股價資料來源：Yahoo Finance｜資料僅供參考，不構成投資建議
      </footer>
    </div>
  )
}
