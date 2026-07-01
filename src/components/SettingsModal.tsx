import { useState } from 'react'
import { loadGeminiKey, saveGeminiKey } from '../services/gemini'

interface Props {
  onClose: () => void
}

export default function SettingsModal({ onClose }: Props) {
  const [keyDraft, setKeyDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const hasKey = !!loadGeminiKey()

  function handleSave() {
    const k = keyDraft.trim()
    if (!k) return
    saveGeminiKey(k)
    setKeyDraft('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleClear() {
    saveGeminiKey('')
    setKeyDraft('')
    setSaved(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Gemini API Key */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Gemini API Key</p>
            {hasKey && (
              <span className="text-xs text-green-600 font-medium">✓ 已設定</span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            用於截圖辨識與新聞功能。Key 只儲存在你的瀏覽器，不會上傳。
          </p>

          <details className="bg-blue-50 rounded-lg px-3 py-2">
            <summary className="text-xs font-semibold text-blue-700 cursor-pointer select-none">
              📖 如何免費申請 API Key？
            </summary>
            <ol className="mt-2 space-y-2 text-xs text-gray-600 list-none">
              {[
                <>開啟 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium underline">Google AI Studio</a></>,
                <>用 <strong>Google 帳號</strong>登入</>,
                <>同意服務條款</>,
                <>點右上角「<strong>建立 API 金鑰</strong>」</>,
                <>複製 <strong>AIza</strong> 開頭的金鑰</>,
                <>貼到下方儲存，完成！</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-gray-400">💡 完全免費，不需綁信用卡。</p>
          </details>

          <div className="flex gap-2">
            <input
              type="password"
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder={hasKey ? '輸入新 Key 以更換' : '貼上 API Key（AIza 開頭）'}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSave}
              disabled={!keyDraft.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {saved ? '已儲存 ✓' : '儲存'}
            </button>
          </div>

          {hasKey && (
            <button onClick={handleClear} className="text-xs text-red-400 hover:text-red-600 transition-colors">
              清除 API Key
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
