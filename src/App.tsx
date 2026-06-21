import { useState, useEffect, useMemo } from 'react'
import * as Sentry from '@sentry/react'
import { Transaction } from './types'
import { fetchStockPrices, getStockMarket } from './services/stockPrices'
import { fetchRealtimeQuotes, fetchStockNames, StockSymbol } from './services/realtimeQuotes'
import { isTradingHours } from './utils/market'
import { calculateDailyPnL, computeSummary, getCurrentHoldings, getStockDetails } from './utils/pnl'
import { buildCashFlows, xirr } from './utils/xirr'
import { useLocalStorage } from './hooks/useLocalStorage'
import TransactionForm from './components/TransactionForm'
import TransactionList from './components/TransactionList'
import PnLChart from './components/PnLChart'
import PortfolioSummary from './components/PortfolioSummary'
import AnnualizedReturn from './components/AnnualizedReturn'
import Holdings from './components/Holdings'
import StockDetails from './components/StockDetails'
import ReturnCalendar from './components/ReturnCalendar'
import ImportTransactions from './components/ImportTransactions'
import FeeSettingsBar from './components/FeeSettingsBar'
import { FeeSettings, loadFeeSettings, saveFeeSettings } from './utils/fees'

type TabKey = 'assets' | 'holdings' | 'records'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'assets', label: '資產', icon: '📊' },
  { key: 'holdings', label: '庫存', icon: '📦' },
  { key: 'records', label: '紀錄', icon: '📝' },
]

export default function App() {
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>('tw-stock-transactions', [])
  const [stockNames, setStockNames] = useLocalStorage<Record<string, string>>('tw-stock-names', {})
  const [tab, setTab] = useState<TabKey>(() => (transactions.length > 0 ? 'assets' : 'records'))
  const [pricesByStock, setPricesByStock] = useState<Map<string, Map<string, number>>>(new Map())
  const [feeSettings, setFeeSettings] = useState<FeeSettings>(() => loadFeeSettings())
  const [realtimePrices, setRealtimePrices] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Stable primitive key — changes only when stock list or any per-stock earliest date changes.
  // 每檔股票記錄「自己的」第一筆交易日 — 用整體最早日期會讓晚掛牌的股票
  // 去查一堆掛牌前的空月份，白白消耗證交所的請求額度甚至被限流
  const fetchKey = useMemo(() => {
    if (transactions.length === 0) return ''
    const minByCode = new Map<string, string>()
    for (const t of transactions) {
      const cur = minByCode.get(t.stockCode)
      if (!cur || t.date < cur) minByCode.set(t.stockCode, t.date)
    }
    return [...minByCode.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, date]) => `${code}:${date}`)
      .join(',')
  }, [transactions])

  function parseFetchKey(key: string): { code: string; minDate: string }[] {
    return key.split(',').map(pair => {
      const [code, minDate] = pair.split(':')
      return { code, minDate }
    })
  }

  useEffect(() => {
    if (!fetchKey) {
      setPricesByStock(new Map())
      return
    }
    void loadPrices(parseFetchKey(fetchKey), false)
  }, [fetchKey])

  async function loadPrices(stocks: { code: string; minDate: string }[], force: boolean) {
    setLoading(true)
    setError(null)
    const errors: string[] = []
    const newMap = new Map<string, Map<string, number>>()

    await Promise.allSettled(
      stocks.map(async ({ code, minDate }) => {
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
    void loadPrices(parseFetchKey(fetchKey), true)
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

  // 自動帶入股票中文名稱：股價就緒後（此時已知上市/上櫃）批次抓 MIS 名稱，
  // 只填「目前還沒有名稱」的代碼，不覆蓋使用者手動命名。
  useEffect(() => {
    if (pricesByStock.size === 0) return
    const symbols: StockSymbol[] = []
    pricesByStock.forEach((_, code) => {
      if (stockNames[code]) return // 已有名稱（手動或先前自動）就跳過
      const market = getStockMarket(code)
      if (market) symbols.push({ code, market })
    })
    if (symbols.length === 0) return
    fetchStockNames(symbols)
      .then(fetched => {
        if (fetched.size === 0) return
        const next = { ...stockNames }
        let changed = false
        fetched.forEach((name, code) => {
          if (!next[code] && name) { next[code] = name; changed = true }
        })
        if (changed) setStockNames(next)
      })
      .catch(() => { /* 抓不到名稱無妨，仍可手動命名 */ })
    // 只在持股清單（pricesByStock）變動時嘗試，避免依賴 stockNames 造成迴圈
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const stockDetails = useMemo(
    () => getStockDetails(transactions, currentPrices, feeSettings),
    [transactions, currentPrices, feeSettings],
  )

  // 整體年化報酬率（XIRR）+ 持有天數（用來判斷年化是否僅供參考）
  const annualized = useMemo(() => {
    const { flows, incompletePrices } = buildCashFlows(transactions, currentPrices, feeSettings)
    const r = xirr(flows)
    let holdingDays = 0
    if (transactions.length > 0) {
      const firstDate = transactions.reduce((min, t) => (t.date < min ? t.date : min), transactions[0].date)
      holdingDays = Math.max(0, Math.round((Date.now() - Date.parse(firstDate)) / 86_400_000))
    }
    return { value: r === null ? null : r * 100, incompletePrices, holdingDays }
  }, [transactions, currentPrices, feeSettings])

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

  function setStockName(code: string, name: string) {
    const next = { ...stockNames }
    if (name.trim()) next[code] = name.trim()
    else delete next[code]
    setStockNames(next)
  }

  const hasData = transactions.length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header + Tab bar 一起 sticky，避免寫死偏移量 */}
      <div className="sticky top-0 z-20">
      <header className="bg-white border-b border-gray-200">
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

      {/* Tab bar（手機與電腦共用） */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 flex">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 sm:flex-none sm:px-6 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>
      </div>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* 共用空狀態 */}
        {!hasData && tab !== 'records' && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">📈</p>
            <p className="text-sm font-medium text-gray-600 mb-1">還沒有資料</p>
            <p className="text-xs">到「📝 紀錄」分頁新增第一筆交易，這裡就會顯示損益分析</p>
          </div>
        )}

        {/* 資產 */}
        {tab === 'assets' && hasData && (
          <>
            <PortfolioSummary summary={summary} loading={loading} />
            <AnnualizedReturn
              value={annualized.value}
              periodReturn={summary.returnRate}
              holdingDays={annualized.holdingDays}
              incompletePrices={annualized.incompletePrices}
            />
            {dailyPnL.length > 0 && <PnLChart data={dailyPnL} />}
            {dailyPnL.length > 0 && <ReturnCalendar data={dailyPnL} />}
          </>
        )}

        {/* 庫存 */}
        {tab === 'holdings' && hasData && (
          <>
            {holdings.length > 0 && <Holdings holdings={holdings} isRealtime={realtimePrices.size > 0} names={stockNames} onRename={setStockName} />}
            {stockDetails.length > 0 && <StockDetails details={stockDetails} names={stockNames} onRename={setStockName} />}
            {holdings.length === 0 && stockDetails.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center text-gray-400 text-sm">
                目前沒有持倉資料
              </div>
            )}
          </>
        )}

        {/* 紀錄 */}
        {tab === 'records' && (
          <>
            {!hasData && (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 py-10 text-center text-gray-400">
                <p className="text-4xl mb-3">📈</p>
                <p className="text-sm font-medium text-gray-600 mb-1">開始追蹤你的台股損益</p>
                <p className="text-xs">新增第一筆買入紀錄，系統會自動抓取歷史股價</p>
              </div>
            )}
            {hasData && <FeeSettingsBar settings={feeSettings} onChange={updateFeeSettings} />}
            <ImportTransactions onAddMany={addTransactions} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              <TransactionForm onAdd={addTransaction} />
              <TransactionList transactions={transactions} onDelete={deleteTransaction} />
            </div>
          </>
        )}
      </main>

      <footer className="text-center py-6 text-xs text-gray-300">
        股價資料來源：台灣證券交易所、櫃買中心｜資料僅供參考，不構成投資建議
      </footer>
    </div>
  )
}
