import { useState } from 'react'
import { Transaction, TransactionType } from '../types'

interface Props {
  onAdd: (tx: Omit<Transaction, 'id'>) => void
}

export default function TransactionForm({ onAdd }: Props) {
  const [stockCode, setStockCode] = useState('')
  const [type, setType] = useState<TransactionType>('buy')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const sharesNum = parseFloat(shares)
    const priceNum = parseFloat(price)
    if (!stockCode || !date || isNaN(sharesNum) || isNaN(priceNum) || sharesNum <= 0 || priceNum <= 0) return
    onAdd({
      stockCode: stockCode.trim().toUpperCase(),
      type,
      date,
      shares: sharesNum,
      price: priceNum,
      note: note.trim() || undefined,
    })
    setStockCode('')
    setShares('')
    setPrice('')
    setNote('')
  }

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">新增交易紀錄</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">股票代碼</label>
            <input
              type="text"
              value={stockCode}
              onChange={e => setStockCode(e.target.value)}
              placeholder="例如: 2330"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">交易類型</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden h-[38px]">
              <button
                type="button"
                onClick={() => setType('buy')}
                className={`flex-1 text-sm font-medium transition-colors ${
                  type === 'buy' ? 'bg-green-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                買入
              </button>
              <button
                type="button"
                onClick={() => setType('sell')}
                className={`flex-1 text-sm font-medium transition-colors ${
                  type === 'sell' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                賣出
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">交易日期</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">股數</label>
            <input
              type="number"
              value={shares}
              onChange={e => setShares(e.target.value)}
              placeholder="例如: 1000"
              min="1"
              step="1"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">每股價格（元）</label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="例如: 550.00"
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">備註（選填）</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="備註"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          新增
        </button>
      </form>
    </div>
  )
}
