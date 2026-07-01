import { useState } from 'react'
import { NewsItem } from '../services/gemini'

interface Props {
  apiKey: string
  autoNews: Record<string, NewsItem[]>   // stockCode → 持股新聞（每日自動）
  stockNames: Record<string, string>
  newsDate: string | null                // 自動新聞抓取日期
  newsLoading: boolean
  onSearch: (query: string) => Promise<NewsItem[]>
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <p className="text-sm font-medium text-gray-900 leading-snug">{item.title}</p>
      <p className="text-xs text-gray-500 mt-0.5">{item.summary}</p>
      <p className="text-xs text-gray-400 mt-1">
        {item.source}・{item.date}
      </p>
    </div>
  )
}

export default function StockNews({ apiKey, autoNews, stockNames, newsDate, newsLoading, onSearch }: Props) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<NewsItem[] | null>(null)
  const [searchedQuery, setSearchedQuery] = useState('')

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setSearchResults(null)
    const results = await onSearch(query.trim())
    setSearchResults(results)
    setSearchedQuery(query.trim())
    setSearching(false)
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
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim() || !apiKey}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? '搜尋中…' : '搜尋'}
          </button>
        </div>
        {!apiKey && (
          <p className="text-xs text-amber-600 mt-1.5">請先在「紀錄」分頁設定 Gemini API Key</p>
        )}
      </div>

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
      {newsLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          正在抓取持股新聞…
        </div>
      ) : stockEntries.length > 0 ? (
        <>
          {newsDate && (
            <p className="text-xs text-gray-400 text-right">持股新聞更新：{newsDate}</p>
          )}
          {stockEntries.map(([code, items]) => (
            <div key={code} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">
                {stockNames[code] || code}
                {stockNames[code] && <span className="text-xs text-gray-400 ml-1.5 font-normal">{code}</span>}
              </p>
              {items.map((item, i) => <NewsCard key={i} item={item} />)}
            </div>
          ))}
        </>
      ) : !newsLoading && stockEntries.length === 0 && newsDate ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
          今日無持股相關新聞
        </div>
      ) : null}
    </div>
  )
}
