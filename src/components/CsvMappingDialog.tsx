import { useMemo, useState } from 'react'
import { CsvAnalysis, CsvField, CsvMapping, extractTxs, mappingComplete } from '../utils/csv'

interface Props {
  analysis: CsvAnalysis
  onConfirm: (mapping: CsvMapping) => void
  onCancel: () => void
}

const PREVIEW_ROWS = 4

// 對應目標欄位與顯示名稱。stockCode / stockName 擇一即可。
const FIELD_LABELS: { field: CsvField; label: string; hint?: string }[] = [
  { field: 'stockCode', label: '股票代碼' },
  { field: 'stockName', label: '股名', hint: '常見股票自動轉代碼' },
  { field: 'type', label: '類型（買/賣/息）' },
  { field: 'date', label: '日期' },
  { field: 'shares', label: '股數' },
  { field: 'price', label: '價格' },
]

const FIXED_TYPES = [
  { value: 'buy', label: '整檔皆為買入' },
  { value: 'sell', label: '整檔皆為賣出' },
  { value: 'dividend', label: '整檔皆為股利' },
] as const

export default function CsvMappingDialog({ analysis, onConfirm, onCancel }: Props) {
  const [cols, setCols] = useState<Partial<Record<CsvField, number>>>(analysis.suggested.cols)
  const [fixedType, setFixedType] = useState<CsvMapping['fixedType']>(analysis.suggested.fixedType)

  const colCount = Math.max(
    analysis.headers.length,
    ...analysis.rows.slice(0, PREVIEW_ROWS).map(r => r.length),
  )
  const colName = (i: number) => analysis.headers[i] || `第 ${i + 1} 欄`

  const mapping: CsvMapping = { cols, fixedType }
  const complete = mappingComplete(mapping)
  const parsedCount = useMemo(
    () => (complete ? extractTxs(analysis.rows, mapping).txs.length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analysis, cols, fixedType, complete],
  )

  function setField(field: CsvField, value: string) {
    setCols(prev => {
      const next = { ...prev }
      if (value === '') delete next[field]
      else next[field] = Number(value)
      return next
    })
    if (field === 'type' && value !== '') setFixedType(undefined)
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-700">無法自動辨識這個 CSV 的欄位</p>
        <p className="text-xs text-gray-400 mt-0.5">
          請指定每個欄位對應檔案的哪一欄，設定會被記住，下次同格式的檔案自動套用。
        </p>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="text-xs min-w-full">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              {Array.from({ length: colCount }, (_, i) => (
                <th key={i} className="px-2 py-1 text-left font-medium whitespace-nowrap">{colName(i)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.rows.slice(0, PREVIEW_ROWS).map((row, ri) => (
              <tr key={ri} className="border-b border-gray-50 text-gray-600">
                {Array.from({ length: colCount }, (_, i) => (
                  <td key={i} className="px-2 py-1 whitespace-nowrap">{row[i] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {FIELD_LABELS.map(({ field, label, hint }) => (
          <label key={field} className="text-xs text-gray-500">
            <span className="block mb-0.5">
              {label}
              {hint && <span className="text-gray-300 ml-1">（{hint}）</span>}
            </span>
            <select
              value={field === 'type' && fixedType ? `fixed:${fixedType}` : cols[field] ?? ''}
              onChange={e => {
                const v = e.target.value
                if (field === 'type' && v.startsWith('fixed:')) {
                  setFixedType(v.slice(6) as CsvMapping['fixedType'])
                  setCols(prev => { const next = { ...prev }; delete next.type; return next })
                } else {
                  setField(field, v)
                }
              }}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-gray-700 bg-white"
            >
              <option value="">—</option>
              {Array.from({ length: colCount }, (_, i) => (
                <option key={i} value={i}>{colName(i)}</option>
              ))}
              {field === 'type' && FIXED_TYPES.map(t => (
                <option key={t.value} value={`fixed:${t.value}`}>{t.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {complete && parsedCount === 0 && (
        <p className="text-xs text-red-500">用這個對應解析不出任何交易，請檢查日期／股數／價格欄是否選對</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(mapping)}
          disabled={!complete || parsedCount === 0}
          className="flex-1 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {complete && parsedCount > 0 ? `套用對應（可匯入 ${parsedCount} 筆）` : '請完成欄位對應'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  )
}
