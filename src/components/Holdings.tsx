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

export default function Holdings({ holdings, isRealtime, names, priceAlerts, pricesByStock, transactions, onRename, onSetAlert }: Props) {
  const [editingAlert, setEditingAlert] = useState<string | null>(null)
  const [expandedChart, setExpandedChart] = useState<string | null>(null)

  if (holdings.length === 0) return null

  return (
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
                          className="font-bold text-gray-900 hover:text-teal-600 transition-colors"
                          title="點擊查看走勢圖"
                        >
                          {h.stockCode}
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
                      <button
                        onClick={() => setEditingAlert(editingAlert === h.stockCode ? null : h.stockCode)}
                        className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
                      >
                        {(alert.target || alert.stopLoss) ? '✏️' : '＋設定'}
                      </button>
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
                  {expandedChart === h.stockCode && pricesByStock.has(h.stockCode) && (
                    <tr key={`${h.stockCode}-chart`}>
                      <td colSpan={8} className="px-3">
                        <StockChart
                          stockCode={h.stockCode}
                          prices={pricesByStock.get(h.stockCode)!}
                          transactions={transactions}
                          avgCost={h.avgCost}
                          currentPrice={h.currentPrice}
                        />
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
                  className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
                >
                  {expandedChart === h.stockCode ? '▲ 收起圖表' : '📈 走勢圖'}
                </button>
                <button
                  onClick={() => setEditingAlert(editingAlert === h.stockCode ? null : h.stockCode)}
                  className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
                >
                  {(alert.target || alert.stopLoss) ? '✏️ 編輯警示' : '＋設定警示'}
                </button>
              </div>
              {expandedChart === h.stockCode && pricesByStock.has(h.stockCode) && (
                <StockChart
                  stockCode={h.stockCode}
                  prices={pricesByStock.get(h.stockCode)!}
                  transactions={transactions}
                  avgCost={h.avgCost}
                  currentPrice={h.currentPrice}
                />
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
  )
}
