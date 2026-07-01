import { useRef, useState } from 'react'
import { generatePortfolioReport, chatWithPortfolio, PortfolioContext } from '../services/gemini'

interface Props {
  ctx: PortfolioContext
  apiKey: string
}

interface Message {
  role: 'user' | 'ai'
  text: string
}

function MarkdownText({ text }: { text: string }) {
  // Render **bold**, numbered lists, and bullet lists as simple HTML
  const lines = text.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-1" />
        // Bold: **text**
        const rendered = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        return <p key={i} className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: rendered }} />
      })}
    </div>
  )
}

export default function PortfolioAnalysis({ ctx, apiKey }: Props) {
  const [report, setReport] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasHoldings = ctx.holdings.length > 0

  async function handleReport() {
    if (!apiKey) return
    setReportLoading(true)
    setReportError(null)
    try {
      const text = await generatePortfolioReport(apiKey, ctx)
      setReport(text)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : '分析失敗，請再試一次')
    } finally {
      setReportLoading(false)
    }
  }

  async function handleChat() {
    const q = input.trim()
    if (!q || !apiKey || chatLoading) return
    setInput('')
    setChatError(null)
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setChatLoading(true)
    try {
      const answer = await chatWithPortfolio(apiKey, ctx, q)
      setMessages(prev => [...prev, { role: 'ai', text: answer }])
    } catch (err) {
      setChatError(err instanceof Error ? err.message : '問答失敗，請再試一次')
    } finally {
      setChatLoading(false)
      inputRef.current?.focus()
    }
  }

  if (!hasHoldings) return null

  return (
    <div className="space-y-4">
      {/* 一鍵報告 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800">持倉 AI 分析</p>
          <button
            onClick={handleReport}
            disabled={reportLoading || !apiKey}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {reportLoading ? '分析中…' : report ? '重新分析' : '一鍵分析持倉'}
          </button>
        </div>

        {!apiKey && (
          <p className="text-xs text-amber-600">請先點右上角 ⚙️ 設定 Gemini API Key</p>
        )}

        {reportError && (
          <p className="text-xs text-red-500 mt-1">⚠ {reportError}</p>
        )}

        {reportLoading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <span className="inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            AI 正在分析你的持倉…
          </div>
        )}

        {report && !reportLoading && (
          <div className="mt-3 bg-indigo-50 rounded-lg px-4 py-3">
            <MarkdownText text={report} />
          </div>
        )}
      </div>

      {/* 自由問答 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-800 mb-3">問 AI 關於你的持倉</p>

        {messages.length > 0 && (
          <div className="space-y-3 mb-3 max-h-80 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {m.role === 'ai' ? <MarkdownText text={m.text} /> : m.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-3 py-2 rounded-xl rounded-bl-sm flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-gray-400">思考中…</span>
                </div>
              </div>
            )}
          </div>
        )}

        {chatError && (
          <p className="text-xs text-red-500 mb-2">⚠ {chatError}</p>
        )}

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleChat()}
            disabled={!apiKey || chatLoading}
            placeholder={apiKey ? '例：哪檔股票風險最高？我該加碼還是減碼？' : '請先設定 API Key'}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
          />
          <button
            onClick={handleChat}
            disabled={!input.trim() || !apiKey || chatLoading}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            送出
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">AI 以你的實際持倉為背景回答，每次問答消耗 1 次配額（500 次/天）</p>
      </div>
    </div>
  )
}
