import { useRef, useState } from 'react'
import { Transaction } from '../types'
import { ParsedTx, parseScreenshot, loadGeminiKey, saveGeminiKey } from '../services/gemini'

interface Props {
  onAddMany: (txs: Omit<Transaction, 'id'>[]) => void
}

// Downscale + JPEG compress to keep the request small
async function fileToBase64Jpeg(file: File, maxDim = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return dataUrl.split(',')[1]
}

function isValidTx(tx: ParsedTx): boolean {
  return (
    /^\d{4}[A-Z]?$/.test(tx.stockCode) &&
    (tx.type === 'buy' || tx.type === 'sell') &&
    /^\d{4}-\d{2}-\d{2}$/.test(tx.date) &&
    tx.shares > 0 &&
    tx.price > 0
  )
}

export default function ImportScreenshot({ onAddMany }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [apiKey, setApiKey] = useState(() => loadGeminiKey())
  const [keyDraft, setKeyDraft] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedTx[] | null>(null)

  const needKey = !apiKey || editingKey

  function handleSaveKey() {
    const k = keyDraft.trim()
    if (!k) return
    saveGeminiKey(k)
    setApiKey(k)
    setKeyDraft('')
    setEditingKey(false)
    setError(null)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !apiKey) return

    setLoading(true)
    setError(null)
    setParsed(null)
    try {
      const image = await fileToBase64Jpeg(file)
      const txs = (await parseScreenshot(apiKey, image, 'image/jpeg')).map(t => ({
        ...t,
        stockCode: String(t.stockCode).trim().toUpperCase(),
      }))
      if (txs.length === 0) {
        setError('沒有辨識到任何交易紀錄，請換一張更清楚的截圖')
      } else {
        setParsed(txs)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '辨識失敗，請再試一次')
    } finally {
      setLoading(false)
    }
  }

  function updateRow(i: number, patch: Partial<ParsedTx>) {
    setParsed(prev => prev!.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }

  function removeRow(i: number) {
    setParsed(prev => {
      const next = prev!.filter((_, idx) => idx !== i)
      return next.length > 0 ? next : null
    })
  }

  function confirmAll() {
    if (!parsed) return
    const valid = parsed.filter(isValidTx)
    if (valid.length === 0) {
      setError('沒有有效的交易資料，請檢查欄位')
      return
    }
    onAddMany(valid.map(t => ({ ...t, note: '截圖匯入' })))
    setParsed(null)
    setError(null)
  }

  const invalidCount = parsed ? parsed.length - parsed.filter(isValidTx).length : 0

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">截圖匯入交易</h2>
        {apiKey && !editingKey && (
          <button
            onClick={() => setEditingKey(true)}
            className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
          >
            更換 API key
          </button>
        )}
      </div>

      {needKey ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            需要 Gemini API key 才能辨識（免費）。Key 只會儲存在你的瀏覽器裡，不會上傳到任何伺服器。
          </p>

          <details className="bg-blue-50 rounded-lg px-3 py-2">
            <summary className="text-xs font-semibold text-blue-700 cursor-pointer select-none">
              📖 如何免費申請 API key？（點我看教學）
            </summary>
            <ol className="mt-2 space-y-2 text-xs text-gray-600 list-none">
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</span>
                <span>
                  開啟{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 font-medium underline"
                  >
                    Google AI Studio
                  </a>
                  （點此連結，會開新分頁）
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</span>
                <span>用你的 <strong>Google 帳號</strong> 登入（就是 Gmail 帳號）</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</span>
                <span>第一次使用會跳出服務條款，勾選同意後繼續</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">4</span>
                <span>點右上角的「<strong>建立 API 金鑰</strong>」（Create API key）按鈕</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">5</span>
                <span>複製產生的金鑰（一串 <strong>AIza</strong> 開頭的英數字）</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">6</span>
                <span>回到這裡，貼到下方輸入框按「儲存」，完成！</span>
              </li>
            </ol>
            <p className="mt-2 text-xs text-gray-400">
              💡 完全免費，不需要綁信用卡。免費額度每天可辨識約 250 次，個人使用綽綽有餘。
            </p>
          </details>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveKey() }}
              placeholder="貼上 Gemini API key（AIza 開頭）"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSaveKey}
              disabled={!keyDraft.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              儲存
            </button>
            {editingKey && (
              <button
                onClick={() => { setEditingKey(false); setKeyDraft('') }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                取消
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

          {!parsed && (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-50 transition-colors"
            >
              {loading ? '辨識中…' : '📷 上傳券商交易紀錄截圖'}
            </button>
          )}
        </>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {parsed && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">由 AI 辨識，請確認內容無誤後再加入</p>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="px-1 py-1 font-medium">代碼</th>
                  <th className="px-1 py-1 font-medium">類型</th>
                  <th className="px-1 py-1 font-medium">日期</th>
                  <th className="px-1 py-1 font-medium">股數</th>
                  <th className="px-1 py-1 font-medium">價格</th>
                  <th className="px-1 py-1" />
                </tr>
              </thead>
              <tbody>
                {parsed.map((tx, i) => {
                  const valid = isValidTx(tx)
                  return (
                    <tr key={i} className={valid ? '' : 'bg-red-50'}>
                      <td className="px-1 py-1">
                        <input
                          value={tx.stockCode}
                          onChange={e => updateRow(i, { stockCode: e.target.value.toUpperCase() })}
                          className="w-14 px-1 py-1 border border-gray-200 rounded"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          onClick={() => updateRow(i, { type: tx.type === 'buy' ? 'sell' : 'buy' })}
                          className={`px-2 py-1 rounded font-medium ${
                            tx.type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {tx.type === 'buy' ? '買' : '賣'}
                        </button>
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="date"
                          value={tx.date}
                          onChange={e => updateRow(i, { date: e.target.value })}
                          className="px-1 py-1 border border-gray-200 rounded"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          value={tx.shares}
                          onChange={e => updateRow(i, { shares: Number(e.target.value) })}
                          className="w-16 px-1 py-1 border border-gray-200 rounded"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          value={tx.price}
                          onChange={e => updateRow(i, { price: Number(e.target.value) })}
                          className="w-16 px-1 py-1 border border-gray-200 rounded"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-500">✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {invalidCount > 0 && (
            <p className="text-xs text-red-500">{invalidCount} 筆資料有誤（紅底），請修正或刪除</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={confirmAll}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              加入 {parsed.filter(isValidTx).length} 筆交易
            </button>
            <button
              onClick={() => { setParsed(null); setError(null) }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
