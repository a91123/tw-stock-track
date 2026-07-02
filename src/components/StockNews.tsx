import { useState } from 'react'
import { NewsItem } from '../services/gemini'

interface Props {
  apiKey: string
  autoNews: Record<string, NewsItem[]>
  stockNames: Record<string, string>
  newsDate: string | null
  newsLoading: boolean
  onSearch: (query: string) => Promise<NewsItem[]>
  onSearchingChange?: (v: boolean) => void
  onRefresh?: () => void
}

const SENTIMENT_STYLE: Record<string, string> = {
  利多: 'bg-green-100 text-green-700',
  利空: 'bg-red-100 text-red-700',
  中性: 'bg-gray-100 text-gray-500',
}

function NewsCard({ item }: { item: NewsItem }) {
  const fallbackUrl = `https://news.google.com/search?q=${encodeURIComponent(item.title + ' ' + item.source)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
  // Gemini grounding 有時回傳 Vertex AI 內部 redirect URL，外部無法存取
  const isUsableUrl = item.url && !item.url.includes('vertexaisearch') && !item.url.includes('grounding-api-redirect')
  const href = isUsableUrl ? item.url! : fallbackUrl

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-sm font-medium text-gray-900 leading-snug hover:text-teal-600 transition-colors"
        >
          {item.title}
          <span className="ml-1 text-gray-400 text-xs">↗</span>
        </a>
        {item.sentiment && (
          <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium mt-0.5 ${SENTIMENT_STYLE[item.sentiment] ?? 'bg-gray-100 text-gray-500'}`}>
            {item.sentiment}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.summary}</p>
      {item.impact && (
        <div className="mt-1.5 px-2.5 py-1.5 bg-teal-50 rounded-lg">
          <p className="text-xs text-teal-700 leading-relaxed">
            <span className="font-medium">潛在影響：</span>{item.impact}
          </p>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-1.5">{item.source}・{item.date}</p>
    </div>
  )
}

export default function StockNews({ apiKey, autoNews, stockNames, newsDate, newsLoading, onSearch, onSearchingChange, onRefresh }: Props) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<NewsItem[] | null>(null)
  const [searchedQuery, setSearchedQuery] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    onSearchingChange?.(true)
    setSearchResults(null)
    setSearchError(null)
    try {
      const results = await onSearch(query.trim())
      setSearchResults(results)
      setSearchedQuery(query.trim())
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '搜尋失敗，請再試一次')
    } finally {
      setSearching(false)
      onSearchingChange?.(false)
    }
  }

  const stockEntries = Object.entries(autoNews).filter(([, items]) => items.length > 0)

  return (
    <div className="space-y-4">
      {/* 搜尋列 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-500 mb-2">輸入股票代碼或名稱，搜尋最新財經新聞</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="例：2330 或 台積電"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim() || !apiKey}
            className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? '搜尋中…' : '搜尋'}
          </button>
        </div>
        {!apiKey && (
          <p className="text-xs text-amber-600 mt-1.5">請先點右上角 ⚙️ 設定 Gemini API Key</p>
        )}
      </div>

      {searchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          ⚠ {searchError}
        </div>
      )}

      {/* 搜尋結果 */}
      {searchResults !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            「{searchedQuery}」搜尋結果
          </p>
          {searchResults.length === 0 ? (
            <p className="text-sm text-gray-400">找不到相關新聞</p>
          ) : (
            searchResults.map((item, i) => <NewsCard key={i} item={item} />)
          )}
        </div>
      )}

      {/* 持股自動新聞 */}
      <div className="flex items-center justify-between min-h-[1.5rem]">
        {newsDate && !newsLoading && (
          <p className="text-xs text-gray-400">更新於 {newsDate}・每日早上 8 點自動重整</p>
        )}
        <button
          onClick={onRefresh}
          disabled={newsLoading}
          className="text-xs text-teal-500 hover:text-teal-700 disabled:opacity-40 transition-colors ml-auto"
        >
          {newsLoading ? '更新中…' : '重新整理'}
        </button>
      </div>

      {newsLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          正在抓取持股新聞…
        </div>
      ) : stockEntries.length > 0 ? (
        stockEntries.map(([code, items]) => (
          <div key={code} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">
              {stockNames[code] || code}
              {stockNames[code] && <span className="text-xs text-gray-400 ml-1.5 font-normal">{code}</span>}
            </p>
            {items.map((item, i) => <NewsCard key={i} item={item} />)}
          </div>
        ))
      ) : newsDate ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          今日無持股相關新聞
        </div>
      ) : null}
    </div>
  )
}
