import { useRef, useState } from 'react'
import * as Sentry from '@sentry/react'
import { Transaction } from '../types'
import {
  ParsedTx,
  parseScreenshots,
  loadGeminiKey,
} from '../services/gemini'
import { CsvAnalysis, CsvMapping, CsvParseResult, extractTxs, importCsv } from '../utils/csv'
import CsvMappingDialog from './CsvMappingDialog'

// 使用者手動設定的欄位對應，以表頭簽名為 key 記在本機
const MAPPINGS_KEY = 'csv_col_mappings'

function loadSavedMappings(): Record<string, CsvMapping> {
  try {
    return JSON.parse(localStorage.getItem(MAPPINGS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveMapping(signature: string, mapping: CsvMapping) {
  if (!signature) return
  try {
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify({ ...loadSavedMappings(), [signature]: mapping }))
  } catch { /* ignore quota */ }
}

interface Props {
  onAddMany: (txs: Omit<Transaction, 'id'>[]) => void
  onOpenSettings: () => void
  existingTransactions: Transaction[]
}

function txFingerprint(t: { stockCode: string; date: string; type: string; shares: number; price: number }) {
  return `${t.stockCode}|${t.date}|${t.type}|${t.shares}|${t.price}`
}

const MAX_IMAGES = 8

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
  // 4 digits = stocks, 5-6 digits = ETFs (00878) / warrants, optional letter suffix (00878B)
  return (
    /^\d{4,6}[A-Z]?$/.test(tx.stockCode) &&
    (tx.type === 'buy' || tx.type === 'sell' || tx.type === 'dividend' || tx.type === 'stockDividend') &&
    /^\d{4}-\d{2}-\d{2}$/.test(tx.date) &&
    tx.shares > 0 &&
    (tx.type === 'stockDividend' || tx.price > 0)
  )
}

export default function ImportTransactions({ onAddMany, onOpenSettings, existingTransactions }: Props) {
  const existingSet = new Set(existingTransactions.map(txFingerprint))
  const imageInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [apiKey] = useState(() => loadGeminiKey())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedTx[] | null>(null)
  const [mappingAnalysis, setMappingAnalysis] = useState<CsvAnalysis | null>(null)
  const [parsedSource, setParsedSource] = useState<'截圖匯入' | 'CSV 匯入'>('截圖匯入')
  const [bulkCode, setBulkCode] = useState('')

  async function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES)
    e.target.value = ''
    if (files.length === 0 || !apiKey) return

    setLoading(true)
    setError(null)
    setNotice(null)
    setParsed(null)
    try {
      const images = await Promise.all(
        files.map(async f => ({ base64: await fileToBase64Jpeg(f), mimeType: 'image/jpeg' })),
      )
      const txs = (await parseScreenshots(apiKey, images)).map(t => ({
        ...t,
        stockCode: String(t.stockCode).trim().toUpperCase(),
      }))
      const dupeCount = txs.filter(t => existingSet.has(txFingerprint(t))).length
      const fresh = txs.filter(t => !existingSet.has(txFingerprint(t)))
      if (fresh.length === 0 && dupeCount > 0) {
        setError(`辨識到 ${dupeCount} 筆交易，但全部都已存在，不需重複匯入`)
      } else {
        if (dupeCount > 0) setNotice(`已過濾 ${dupeCount} 筆重複紀錄`)
        setParsedSource('截圖匯入')
        setParsed(fresh.length > 0 ? fresh : txs)
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { feature: 'screenshot-import' } })
      setError(err instanceof Error ? err.message : '辨識失敗，請再試一次')
    } finally {
      setLoading(false)
    }
  }

  function presentCsvResult({ txs, skipped }: CsvParseResult, extraNotice?: string) {
    if (txs.length === 0) {
      setError('CSV 裡沒有可辨識的交易資料，請確認格式（代碼,類型,日期,股數,價格）')
      return
    }
    const dupeCount = txs.filter(t => existingSet.has(txFingerprint(t))).length
    const fresh = txs.filter(t => !existingSet.has(txFingerprint(t)))
    const notices = []
    if (extraNotice) notices.push(extraNotice)
    if (skipped > 0) notices.push(`略過 ${skipped} 列無法解析`)
    if (dupeCount > 0) notices.push(`過濾 ${dupeCount} 筆重複`)
    if (notices.length > 0) setNotice(notices.join('，'))
    setParsedSource('CSV 匯入')
    setParsed(fresh.length > 0 ? fresh : txs)
  }

  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setNotice(null)
    setParsed(null)
    setMappingAnalysis(null)
    try {
      const imported = importCsv(await file.text(), loadSavedMappings())
      if (imported.kind === 'needs-mapping') {
        setMappingAnalysis(imported.analysis)
        return
      }
      presentCsvResult(imported.result, imported.usedSavedMapping ? '已套用先前儲存的欄位對應' : undefined)
    } catch (err) {
      Sentry.captureException(err, { tags: { feature: 'csv-import' } })
      setError('CSV 讀取失敗，請確認檔案內容')
    }
  }

  function handleMappingConfirm(mapping: CsvMapping) {
    if (!mappingAnalysis) return
    saveMapping(mappingAnalysis.signature, mapping)
    const result = extractTxs(mappingAnalysis.rows, mapping)
    setMappingAnalysis(null)
    presentCsvResult(result)
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

  function applyBulkCode() {
    const code = bulkCode.trim().toUpperCase()
    if (!code || !parsed) return
    setParsed(parsed.map(t => (t.stockCode ? t : { ...t, stockCode: code })))
    setBulkCode('')
  }

  function confirmAll() {
    if (!parsed) return
    const valid = parsed.filter(isValidTx)
    if (valid.length === 0) {
      setError('沒有有效的交易資料，請檢查欄位')
      return
    }
    onAddMany(valid.map(t => ({ ...t, note: parsedSource })))
    setParsed(null)
    setError(null)
    setNotice(null)
  }

  const invalidCount = parsed ? parsed.length - parsed.filter(isValidTx).length : 0
  const missingCodeCount = parsed ? parsed.filter(t => !t.stockCode).length : 0

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">匯入交易（截圖 / CSV）</h2>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImages}
      />
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsv}
      />

      {!parsed && !mappingAnalysis && (
        <div className="space-y-2">
          {apiKey ? (
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={loading}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-teal-500 disabled:opacity-50 transition-colors"
            >
              {loading ? '辨識中…' : '📷 上傳券商截圖（可多選，同頁面捲動截圖請一起選）'}
            </button>
          ) : (
            <button
              onClick={onOpenSettings}
              className="w-full py-3 border-2 border-dashed border-amber-300 rounded-lg text-sm text-amber-600 hover:border-amber-400 hover:text-amber-700 transition-colors"
            >
              📷 截圖辨識需要 Gemini API Key，請點此前往 ⚙️ 設定
            </button>
          )}
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={loading}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-teal-500 disabled:opacity-50 transition-colors"
          >
            📄 匯入 CSV 檔
          </button>
          <p className="text-xs text-gray-400">
            CSV 支援大多數券商匯出格式，會自動偵測表頭與欄位；認不得的格式會請你手動對應一次，之後自動套用
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {notice && <p className="mt-2 text-xs text-amber-600">{notice}</p>}

      {mappingAnalysis && (
        <CsvMappingDialog
          analysis={mappingAnalysis}
          onConfirm={handleMappingConfirm}
          onCancel={() => { setMappingAnalysis(null); setError(null); setNotice(null) }}
        />
      )}

      {parsed && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            {parsedSource === '截圖匯入' ? '由 AI 辨識，請確認內容無誤後再加入' : '已讀取 CSV，請確認內容無誤後再加入'}
          </p>

          {missingCodeCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2">
              <span className="text-xs text-amber-700">
                {missingCodeCount} 筆缺少股票代碼，輸入後套用：
              </span>
              <input
                value={bulkCode}
                onChange={e => setBulkCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') applyBulkCode() }}
                placeholder="例 00850"
                className="w-20 px-2 py-1 text-xs border border-amber-200 rounded"
              />
              <button
                onClick={applyBulkCode}
                disabled={!bulkCode.trim()}
                className="px-2 py-1 text-xs font-semibold bg-amber-600 text-white rounded disabled:opacity-40"
              >
                套用
              </button>
            </div>
          )}

          {parsed.some(t => t.type === 'dividend') && (
            <div className="bg-teal-50 rounded-lg px-3 py-2 text-xs text-teal-700">
              股利（息）：價格欄＝「每股股利」，股數×價格＝實領金額。若只知道總配息金額，股數填 <strong>1</strong>、價格填 <strong>總金額</strong> 即可。
            </div>
          )}

          {parsed.some(t => t.type === 'stockDividend') && (
            <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
              配股（配）：股數填「新增股數」，價格固定為 0，不影響已實現損益，會攤薄均價成本。
            </div>
          )}

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
                          className="w-16 px-1 py-1 border border-gray-200 rounded"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          onClick={() => updateRow(i, {
                            type: tx.type === 'buy' ? 'sell'
                              : tx.type === 'sell' ? 'dividend'
                              : tx.type === 'dividend' ? 'stockDividend'
                              : 'buy',
                            ...(tx.type === 'dividend' ? { price: 0 } : {}),
                          })}
                          className={`px-2 py-1 rounded font-medium ${
                            tx.type === 'buy' ? 'bg-green-100 text-green-700'
                              : tx.type === 'sell' ? 'bg-red-100 text-red-700'
                              : tx.type === 'stockDividend' ? 'bg-blue-100 text-blue-700'
                              : 'bg-teal-100 text-teal-700'
                          }`}
                        >
                          {tx.type === 'buy' ? '買' : tx.type === 'sell' ? '賣' : tx.type === 'stockDividend' ? '配' : '息'}
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
                        {tx.type === 'stockDividend' ? (
                          <span className="text-gray-300 px-1">—</span>
                        ) : (
                          <input
                            type="number"
                            value={tx.price}
                            onChange={e => updateRow(i, { price: Number(e.target.value) })}
                            className="w-16 px-1 py-1 border border-gray-200 rounded"
                          />
                        )}
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
              className="flex-1 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors"
            >
              加入 {parsed.filter(isValidTx).length} 筆交易
            </button>
            <button
              onClick={() => { setParsed(null); setError(null); setNotice(null) }}
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
