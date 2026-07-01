import { useState, useEffect, useMemo, useRef } from 'react'
import * as Sentry from '@sentry/react'
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider } from './services/firebase'
import { loadUserData, saveUserData, loadNewsCache, saveNewsCache, NewsCache } from './services/firestore'
import { fetchStockNews, fetchHoldingsNews, loadGeminiKey, NewsItem } from './services/gemini'
import { Transaction } from './types'
import { fetchStockPrices, getStockMarket } from './services/stockPrices'
import { fetchRealtimeQuotes, fetchStockNames, StockSymbol } from './services/realtimeQuotes'
import { isTradingHours } from './utils/market'
import { calculateDailyPnL, computeSummary, getCurrentHoldings, getStockDetails, getSharesOnDate } from './utils/pnl'
import { buildCashFlows, xirr } from './utils/xirr'
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
import DividendSuggestions, { SuggestedDividend } from './components/DividendSuggestions'
import StockNews from './components/StockNews'
import SettingsModal from './components/SettingsModal'
import { fetchDividends } from './services/dividends'
import { FeeSettings, loadFeeSettings, saveFeeSettings } from './utils/fees'

type TabKey = 'assets' | 'holdings' | 'records' | 'news'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'assets', label: '資產', icon: '📊' },
  { key: 'holdings', label: '庫存', icon: '📦' },
  { key: 'records', label: '紀錄', icon: '📝' },
  { key: 'news', label: '新聞', icon: '📰' },
]

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stockNames, setStockNames] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<TabKey>('records')
  const [pricesByStock, setPricesByStock] = useState<Map<string, Map<string, number>>>(new Map())
  const [feeSettings, setFeeSettings] = useState<FeeSettings>(() => loadFeeSettings())
  const [realtimePrices, setRealtimePrices] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const loadingFromFirestore = useRef(false)
  const [dividendSuggestions, setDividendSuggestions] = useState<SuggestedDividend[] | null>(null)
  const [checkingDividends, setCheckingDividends] = useState(false)
  const [autoNews, setAutoNews] = useState<Record<string, NewsItem[]>>({})
  const [newsDate, setNewsDate] = useState<string | null>(null)
  const [newsLoading, setNewsLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [newsSearchLoading, setNewsSearchLoading] = useState(false)

  // Firebase auth 狀態監聽
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null)
        setTransactions([])
        setStockNames({})
        setAuthLoading(false)
        return
      }

      setSyncing(true)
      loadingFromFirestore.current = true
      try {
        const data = await loadUserData(u.uid)
        setTransactions(data?.transactions ?? [])
        setStockNames(data?.stockNames ?? {})
        setTab(data && data.transactions.length > 0 ? 'assets' : 'records')
      } catch (err) {
        Sentry.captureException(err, { tags: { feature: 'firestore-sync' } })
      } finally {
        loadingFromFirestore.current = false
        setSyncing(false)
        setUser(u)
        setAuthLoading(false)
      }
    })
  }, [])

  // 切到新聞 tab 時抓取持股新聞，30 分鐘內不重複
  const NEWS_TTL = 30 * 60 * 1000
  useEffect(() => {
    if (tab !== 'news' || !user || newsLoading) return
    const apiKey = loadGeminiKey()
    if (!apiKey) return

    const sharesMap: Record<string, number> = {}
    for (const t of transactions) {
      if (t.type === 'buy') sharesMap[t.stockCode] = (sharesMap[t.stockCode] ?? 0) + t.shares
      else if (t.type === 'sell') sharesMap[t.stockCode] = (sharesMap[t.stockCode] ?? 0) - t.shares
    }
    const heldCodes = Object.entries(sharesMap).filter(([, s]) => s > 0).map(([c]) => c)
    if (heldCodes.length === 0) return

    void (async () => {
      const cache = await loadNewsCache(user.uid).catch(() => null)
      if (cache && Date.now() - cache.fetchedAt < NEWS_TTL) {
        setAutoNews(cache.items)
        setNewsDate(new Date(cache.fetchedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }))
        return
      }

      setNewsLoading(true)
      const items: Record<string, NewsItem[]> = {}
      let firstErrorMsg: string | null = null
      // 循序發送，避免同時打 N 個 API 觸發速率限制
      for (const code of heldCodes.slice(0, 5)) {
        try {
          const news = await fetchHoldingsNews(apiKey, code, stockNames[code])
          if (news.length > 0) items[code] = news
        } catch (err) {
          if (!firstErrorMsg) firstErrorMsg = err instanceof Error ? err.message : '新聞抓取失敗'
          break  // 遇到 429/403 就停，不繼續消耗配額
        }
      }
      if (firstErrorMsg) setError(firstErrorMsg)
      const fetchedAt = Date.now()
      setAutoNews(items)
      setNewsDate(new Date(fetchedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }))
      setNewsLoading(false)
      await saveNewsCache(user.uid, { fetchedAt, items }).catch(() => {})
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user])

  // 資料變動時同步到 Firestore
  useEffect(() => {
    if (!user || loadingFromFirestore.current) return
    void saveUserData(user.uid, { transactions, stockNames }).catch(err => {
      Sentry.captureException(err, { tags: { feature: 'firestore-save' } })
    })
  }, [transactions, stockNames, user])

  // 每檔股票記錄「自己的」第一筆交易日
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

  useEffect(() => {
    if (pricesByStock.size === 0) return
    const symbols: StockSymbol[] = []
    pricesByStock.forEach((_, code) => {
      if (stockNames[code]) return
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
      .catch(() => { /* 抓不到名稱無妨 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricesByStock])

  const currentPrices = useMemo(() => {
    const m = new Map<string, number>()
    pricesByStock.forEach((prices, code) => {
      const sorted = [...prices.entries()].sort(([a], [b]) => b.localeCompare(a))
      if (sorted.length > 0) m.set(code, sorted[0][1])
    })
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

  async function handleLogin() {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      Sentry.captureException(err, { tags: { feature: 'google-login' } })
    }
  }

  async function handleLogout() {
    await signOut(auth)
  }

  async function handleNewsSearch(query: string): Promise<NewsItem[]> {
    const apiKey = loadGeminiKey()
    if (!apiKey) throw new Error('尚未設定 API Key，請點右上角 ⚙️')
    return fetchStockNews(apiKey, query, stockNames[query])
  }

  async function handleCheckDividends() {
    setCheckingDividends(true)
    const codes = [...new Set(transactions.map(t => t.stockCode))]
    const recordedKeys = new Set(
      transactions.filter(t => t.type === 'dividend').map(t => `${t.stockCode}:${t.date}`),
    )
    const suggestions: SuggestedDividend[] = []

    await Promise.allSettled(
      codes.map(async code => {
        const market = getStockMarket(code)
        if (!market) return
        const records = await fetchDividends(code, market)
        for (const d of records) {
          if (recordedKeys.has(`${d.stockCode}:${d.exDate}`)) continue
          const sharesHeld = getSharesOnDate(transactions, code, d.exDate)
          if (sharesHeld <= 0) continue
          suggestions.push({
            stockCode: code,
            stockName: stockNames[code],
            exDate: d.exDate,
            cashPerShare: d.cashPerShare,
            sharesHeld,
            totalAmount: sharesHeld * d.cashPerShare,
          })
        }
      }),
    )

    suggestions.sort((a, b) => b.exDate.localeCompare(a.exDate))
    setDividendSuggestions(suggestions)
    setCheckingDividends(false)
  }

  // 檢查 auth 狀態中
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">載入中…</div>
      </div>
    )
  }

  // 未登入 → 登入頁
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-3xl font-bold text-gray-900 mb-1">台股損益追蹤器</p>
          <p className="text-sm text-gray-400">Taiwan Stock P&amp;L Tracker</p>
        </div>
        <button
          onClick={handleLogin}
          className="flex items-center gap-2.5 px-6 py-3 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          使用 Google 帳號登入
        </button>
        <p className="text-xs text-gray-300">股價資料來源：台灣證券交易所、櫃買中心</p>
      </div>
    )
  }

  const hasData = transactions.length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-gray-900">台股損益追蹤器</span>
              <span className="text-xs text-gray-400 hidden sm:inline">Taiwan Stock P&amp;L Tracker</span>
            </div>
            <div className="flex items-center gap-3">
              {syncing && <span className="text-xs text-blue-500">同步中…</span>}
              {newsSearchLoading && <span className="text-xs text-purple-500">新聞搜尋中…</span>}
              {lastUpdated && !syncing && (
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
              <button
                onClick={() => setShowSettings(true)}
                className="text-lg leading-none text-gray-400 hover:text-gray-600 transition-colors"
                title="設定"
              >
                ⚙️
              </button>
              <div className="flex items-center gap-2">
                {user.photoURL && (
                  <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" />
                )}
                <button
                  onClick={handleLogout}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  登出
                </button>
              </div>
            </div>
          </div>
        </header>

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
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {!hasData && tab !== 'records' && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">📈</p>
            <p className="text-sm font-medium text-gray-600 mb-1">還沒有資料</p>
            <p className="text-xs">到「📝 紀錄」分頁新增第一筆交易，這裡就會顯示損益分析</p>
          </div>
        )}

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

        {tab === 'holdings' && hasData && (
          <>
            {dividendSuggestions === null ? (
              <div className="flex justify-end">
                <button
                  onClick={handleCheckDividends}
                  disabled={checkingDividends || pricesByStock.size === 0}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {checkingDividends ? '查詢中…' : '查詢未入帳配息'}
                </button>
              </div>
            ) : dividendSuggestions.length > 0 ? (
              <DividendSuggestions
                suggestions={dividendSuggestions}
                onAdd={txs => { addTransactions(txs); setDividendSuggestions(null) }}
                onDismiss={() => setDividendSuggestions(null)}
              />
            ) : (
              <div className="text-xs text-gray-400 text-right">✓ 配息紀錄都已入帳</div>
            )}
            {holdings.length > 0 && <Holdings holdings={holdings} isRealtime={realtimePrices.size > 0} names={stockNames} onRename={setStockName} />}
            {stockDetails.length > 0 && <StockDetails details={stockDetails} names={stockNames} onRename={setStockName} />}
            {holdings.length === 0 && stockDetails.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center text-gray-400 text-sm">
                目前沒有持倉資料
              </div>
            )}
          </>
        )}

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
            <ImportTransactions onAddMany={addTransactions} onOpenSettings={() => setShowSettings(true)} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              <TransactionForm onAdd={addTransaction} />
              <TransactionList transactions={transactions} onDelete={deleteTransaction} />
            </div>
          </>
        )}
        {/* 新聞：保持 mounted 避免切 tab 中斷搜尋 */}
        <div className={tab !== 'news' ? 'hidden' : ''}>
          <StockNews
            apiKey={loadGeminiKey()}
            autoNews={autoNews}
            stockNames={stockNames}
            newsDate={newsDate}
            newsLoading={newsLoading}
            onSearch={handleNewsSearch}
            onSearchingChange={setNewsSearchLoading}
          />
        </div>
      </main>

      <footer className="text-center py-6 text-xs text-gray-300">
        股價資料來源：台灣證券交易所、櫃買中心｜資料僅供參考，不構成投資建議
      </footer>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
