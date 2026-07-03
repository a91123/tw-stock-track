import { useState } from 'react'
import { HoldingData } from '../utils/pnl'
import { PriceAlert } from '../services/firestore'
import { Transaction } from '../types'
import EditableName from './EditableName'
import StockChart from './StockChart'

interface Props {
  holdings: HoldingData[]
  isRealtime?: boolean
  names: Record<string, string>
  priceAlerts: Record<string, PriceAlert>
  pricesByStock: Map<string, Map<string, number>>
  transactions: Transaction[]
  onRename: (code: string, name: string) => void
  onSetAlert: (code: string, alert: PriceAlert) => void
  onSplitAdjust: (code: string, splitDate: string, ratio: number) => void
}

interface SplitEvent {
  date: string   // last day at old price (transactions on/before this date get adjusted)
  ratio: number  // transaction ratio: shares × ratio, price ÷ ratio
}

function detectSplitsFromPriceMap(priceMap: Map<string, number>): SplitEvent[] {
  const sorted = [...priceMap.entries()].sort(([a], [b]) => a.localeCompare(b))
  const splits: SplitEvent[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prevPrice = sorted[i - 1][1]
    if (prevPrice === 0) continue
    const priceRatio = sorted[i][1] / prevPrice
    if (priceRatio < 0.6 || priceRatio > 1.65) {
      // priceRatio ≈ 0.5 means price halved → shares doubled → tx ratio = 2
      const txRatio = Math.round((1 / priceRatio) * 1000) / 1000
      splits.push({ date: sorted[i - 1][0], ratio: txRatio })
    }
  }
  return splits
}

function SplitDialog({
  code, transactions, priceMap, onConfirm, onClose,
}: {
  code: string
  transactions: Transaction[]
  priceMap: Map<string, number> | undefined
  onConfirm: (splitDate: string, ratio: number) => void
  onClose: () => void
}) {
  const splits = priceMap && priceMap.size > 0 ? detectSplitsFromPriceMap(priceMap) : []
  const [selected, setSelected] = useState<string | null>(splits[0]?.date ?? null)

  // Fallback manual state (used when auto-detect finds nothing)
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [manualRatio, setManualRatio] = useState('2')

  const noData = !priceMap || priceMap.size === 0

  const activeDate = splits.length > 0 ? selected : manualDate
  const activeRatio = splits.length > 0
    ? (splits.find(s => s.date === selected)?.ratio ?? 1)
    : parseFloat(manualRatio)

  const affected = transactions.filter(
    t => t.stockCode === code && !!activeDate && t.date <= activeDate && (t.type === 'buy' || t.type === 'sell'),
  )

  function handleConfirm() {
    if (!activeDate || isNaN(activeRatio) || activeRatio <= 0 || activeRatio === 1) return
    onConfirm(activeDate, activeRatio)
    onClose()
  }

  const canConfirm = affected.length > 0 && !isNaN(activeRatio) && activeRatio > 0 && activeRatio !== 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">股票分割調整 — {code}</h3>

        {noData ? (
          <div className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            尚無歷史股價資料。請先點「更新股價」再回來操作。
          </div>
        ) : splits.length === 0 ? (
          <div className="space-y-3">
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              未從歷史資料偵測到分割事件。若確認有分割，可手動輸入：
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">分割日期（該日及之前的交易將被調整）</label>
              <input
                type="date"
                value={manualDate}
                onChange={e => setManualDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">分割比例（2:1 填 2，反向合股 1:2 填 0.5）</label>
              <input
                type="number"
                value={manualRatio}
                onChange={e => setManualRatio(e.target.value)}
                step="0.5"
                min="0.1"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">從歷史股價偵測到以下分割事件，請選擇要套用的項目：</p>
            {splits.map(s => {
              const label = s.ratio > 1
                ? `${Math.round(s.ratio * 10) / 10}:1 分割`
                : `1:${Math.round((1 / s.ratio) * 10) / 10} 合股`
              return (
                <label
                  key={s.date}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer border transition-colors ${selected === s.date ? 'border-amber-400 bg-amber-50' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <input
                    type="radio"
                    name="split-event"
                    checked={selected === s.date}
                    onChange={() => setSelected(s.date)}
                    className="accent-amber-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">{s.date}</span>
                    <span className="ml-2 text-xs text-gray-500">{label}</span>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {!noData && (
          <div className={`text-xs rounded-lg px-3 py-2 ${affected.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-400'}`}>
            {affected.length > 0 ? (
              <>
                ⚠ 將修改 {affected.length} 筆買賣交易：股數 ×{activeRatio}、單價 ÷{activeRatio}。
                操作後若填錯，以相反比例（{activeRatio === 0 ? '—' : (1 / activeRatio).toFixed(4)}）再執行一次可還原。
              </>
            ) : (
              '所選日期前無買賣交易，不會有任何變更。'
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            取消
          </button>
          {!noData && (
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-4 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors"
            >
              確認調整
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function fmtNum(v: number, decimals = 0) {
  return v.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function PnLText({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-gray-300">—</span>
  const cls = value >= 0 ? 'text-red-600' : 'text-green-600'
  return (
    <span className={`${cls} font-semibold tabular-nums`}>
      {value >= 0 ? '+' : ''}{fmtNum(value)}{suffix}
    </span>
  )
}

function AlertBadges({ price, alert }: { price: number | null; alert: PriceAlert }) {
  if (!alert.target && !alert.stopLoss) return null
  return (
    <div className="flex gap-1 mt-0.5">
      {alert.target && (
        <span className={`text-[10px] px-1 rounded font-medium ${price !== null && price >= alert.target ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
          🎯 {alert.target}
        </span>
      )}
      {alert.stopLoss && (
        <span className={`text-[10px] px-1 rounded font-medium ${price !== null && price <= alert.stopLoss ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
          🛑 {alert.stopLoss}
        </span>
      )}
    </div>
  )
}

function AlertEditor({ code, alert, onSave, onClose }: {
  code: string
  alert: PriceAlert
  onSave: (a: PriceAlert) => void
  onClose: () => void
}) {
  const [target, setTarget] = useState(alert.target?.toString() ?? '')
  const [stopLoss, setStopLoss] = useState(alert.stopLoss?.toString() ?? '')

  function save() {
    onSave({
      target: target ? parseFloat(target) : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
    })
    onClose()
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
      <span className="text-gray-400">🎯 目標價</span>
      <input type="number" value={target} onChange={e => setTarget(e.target.value)}
        placeholder="未設定"
        className="w-20 border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-teal-400 text-xs" />
      <span className="text-gray-400">🛑 停損價</span>
      <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)}
        placeholder="未設定"
        className="w-20 border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-teal-400 text-xs" />
      <button onClick={save} className="px-2 py-0.5 bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors text-xs">儲存</button>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">取消</button>
    </div>
  )
}

export default function Holdings({ holdings, isRealtime, names, priceAlerts, pricesByStock, transactions, onRename, onSetAlert, onSplitAdjust }: Props) {
  const [editingAlert, setEditingAlert] = useState<string | null>(null)
  const [expandedChart, setExpandedChart] = useState<string | null>(null)
  const [splitTarget, setSplitTarget] = useState<string | null>(null)

  if (holdings.length === 0) return null

  return (
    <>
    {splitTarget && (
      <SplitDialog
        code={splitTarget}
        transactions={transactions}
        priceMap={pricesByStock.get(splitTarget)}
        onConfirm={(splitDate, ratio) => onSplitAdjust(splitTarget, splitDate, ratio)}
        onClose={() => setSplitTarget(null)}
      />
    )}
    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-gray-700">目前持倉</h2>
        {isRealtime && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            盤中即時
          </span>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 font-medium">股票代碼</th>
              <th className="pb-2 font-medium text-right">持股數</th>
              <th className="pb-2 font-medium text-right">均攤成本</th>
              <th className="pb-2 font-medium text-right">現價</th>
              <th className="pb-2 font-medium text-right">市值（元）</th>
              <th className="pb-2 font-medium text-right">未實現損益</th>
              <th className="pb-2 font-medium text-right">報酬率</th>
              <th className="pb-2 font-medium text-right">警示</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => {
              const alert = priceAlerts[h.stockCode] ?? {}
              return (
                <>
                  <tr key={h.stockCode} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedChart(expandedChart === h.stockCode ? null : h.stockCode)}
                          className="flex items-center gap-1 font-bold text-gray-900 hover:text-teal-600 transition-colors"
                        >
                          {h.stockCode}
                          <span className="text-xs font-normal text-gray-400">
                            {expandedChart === h.stockCode ? '▲' : '📈'}
                          </span>
                        </button>
                        <EditableName code={h.stockCode} name={names[h.stockCode]} onRename={onRename} />
                      </div>
                      <AlertBadges price={h.currentPrice} alert={alert} />
                    </td>
                    <td className="py-3 text-right tabular-nums">{h.totalShares.toLocaleString()}</td>
                    <td className="py-3 text-right text-gray-600 tabular-nums">{fmtNum(h.avgCost, 2)}</td>
                    <td className="py-3 text-right text-gray-600 tabular-nums">
                      {h.currentPrice !== null ? fmtNum(h.currentPrice, 2) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 text-right text-gray-700 tabular-nums">
                      {h.marketValue !== null ? fmtNum(h.marketValue) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 text-right"><PnLText value={h.unrealizedPnL} /></td>
                    <td className="py-3 text-right">
                      <PnLText value={h.returnRate !== null ? Math.round(h.returnRate * 100) / 100 : null} suffix="%" />
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => setEditingAlert(editingAlert === h.stockCode ? null : h.stockCode)}
                          className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
                        >
                          {(alert.target || alert.stopLoss) ? '✏️' : '＋設定'}
                        </button>
                        <button
                          onClick={() => setSplitTarget(h.stockCode)}
                          className="text-xs text-gray-300 hover:text-amber-500 transition-colors"
                          title="調整股票分割"
                        >
                          分割
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingAlert === h.stockCode && (
                    <tr key={`${h.stockCode}-editor`} className="bg-slate-50">
                      <td colSpan={8} className="px-3 pb-3">
                        <AlertEditor
                          code={h.stockCode}
                          alert={alert}
                          onSave={a => onSetAlert(h.stockCode, a)}
                          onClose={() => setEditingAlert(null)}
                        />
                      </td>
                    </tr>
                  )}
                  {expandedChart === h.stockCode && (
                    <tr key={`${h.stockCode}-chart`}>
                      <td colSpan={8} className="px-3">
                        {pricesByStock.has(h.stockCode) ? (
                          <StockChart
                            stockCode={h.stockCode}
                            prices={pricesByStock.get(h.stockCode)!}
                            transactions={transactions}
                            avgCost={h.avgCost}
                            currentPrice={h.currentPrice}
                          />
                        ) : (
                          <p className="text-xs text-gray-400 py-3">請先點「更新股價」</p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {holdings.map(h => {
          const alert = priceAlerts[h.stockCode] ?? {}
          return (
            <div key={h.stockCode} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-base text-gray-900">{h.stockCode}</span>
                    <EditableName code={h.stockCode} name={names[h.stockCode]} onRename={onRename} />
                  </span>
                  <AlertBadges price={h.currentPrice} alert={alert} />
                </div>
                <PnLText value={h.returnRate !== null ? Math.round(h.returnRate * 100) / 100 : null} suffix="%" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">持股數</span>
                  <span className="text-gray-700 tabular-nums">{h.totalShares.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">市值</span>
                  <span className="text-gray-700 tabular-nums">
                    {h.marketValue !== null ? fmtNum(h.marketValue) : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">均攤成本</span>
                  <span className="text-gray-700 tabular-nums">{fmtNum(h.avgCost, 2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">現價</span>
                  <span className="text-gray-700 tabular-nums">
                    {h.currentPrice !== null ? fmtNum(h.currentPrice, 2) : '—'}
                  </span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-gray-400">未實現損益</span>
                  <PnLText value={h.unrealizedPnL} />
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setExpandedChart(expandedChart === h.stockCode ? null : h.stockCode)}
                  className="text-xs text-teal-600 hover:text-teal-800 transition-colors font-medium"
                >
                  {expandedChart === h.stockCode ? '▲ 收起走勢圖' : '📈 走勢圖'}
                </button>
                <button
                  onClick={() => setEditingAlert(editingAlert === h.stockCode ? null : h.stockCode)}
                  className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
                >
                  {(alert.target || alert.stopLoss) ? '✏️ 編輯警示' : '＋設定警示'}
                </button>
                <button
                  onClick={() => setSplitTarget(h.stockCode)}
                  className="text-xs text-gray-300 hover:text-amber-500 transition-colors"
                >
                  分割
                </button>
              </div>
              {expandedChart === h.stockCode && (
                pricesByStock.has(h.stockCode) ? (
                  <StockChart
                    stockCode={h.stockCode}
                    prices={pricesByStock.get(h.stockCode)!}
                    transactions={transactions}
                    avgCost={h.avgCost}
                    currentPrice={h.currentPrice}
                  />
                ) : (
                  <p className="text-xs text-gray-400 pt-3">請先點上方「更新股價」</p>
                )
              )}
              {editingAlert === h.stockCode && (
                <AlertEditor
                  code={h.stockCode}
                  alert={alert}
                  onSave={a => onSetAlert(h.stockCode, a)}
                  onClose={() => setEditingAlert(null)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
    </>
  )
}
