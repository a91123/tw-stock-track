import { Transaction } from '../types'

interface Props {
  transactions: Transaction[]
  onDelete: (id: string) => void
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${y}/${m}/${d}`
}

export default function TransactionList({ transactions, onDelete }: Props) {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">
        交易紀錄
        <span className="ml-2 text-xs text-gray-400 font-normal">（共 {transactions.length} 筆）</span>
      </h2>

      {sorted.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">尚無交易紀錄</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-auto max-h-72">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">代碼</th>
                  <th className="pb-2 font-medium">類型</th>
                  <th className="pb-2 font-medium">日期</th>
                  <th className="pb-2 font-medium text-right">股數</th>
                  <th className="pb-2 font-medium text-right">價格</th>
                  <th className="pb-2 font-medium text-right">金額</th>
                  <th className="pb-2 w-6"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(tx => (
                  <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50 group">
                    <td className="py-2 font-semibold text-gray-900">{tx.stockCode}</td>
                    <td className="py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        tx.type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {tx.type === 'buy' ? '買入' : '賣出'}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{fmtDate(tx.date)}</td>
                    <td className="py-2 text-right text-gray-700">{tx.shares.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-700">{tx.price.toFixed(2)}</td>
                    <td className="py-2 text-right text-gray-700">
                      {Math.round(tx.shares * tx.price).toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => onDelete(tx.id)}
                        className="text-gray-200 group-hover:text-red-400 hover:!text-red-600 transition-colors text-lg leading-none"
                        title="刪除"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-2 max-h-72 overflow-auto">
            {sorted.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                  tx.type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {tx.type === 'buy' ? '買入' : '賣出'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{tx.stockCode}</span>
                    <span className="text-gray-400 text-xs">{fmtDate(tx.date)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {tx.shares.toLocaleString()} 股 × {tx.price.toFixed(2)} ＝ {Math.round(tx.shares * tx.price).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(tx.id)}
                  className="shrink-0 text-gray-300 active:text-red-500 text-xl leading-none px-1"
                  title="刪除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
