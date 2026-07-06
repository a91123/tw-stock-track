import { Transaction } from '../types'
import { exportTransactionsCSV } from '../utils/exportCsv'

interface Props {
  transactions: Transaction[]
  stockNames: Record<string, string>
  onDelete: (id: string) => void
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${y}/${m}/${d}`
}

const TYPE_META: Record<string, { label: string; cls: string }> = {
  buy: { label: '買入', cls: 'bg-green-100 text-green-700' },
  sell: { label: '賣出', cls: 'bg-red-100 text-red-700' },
  dividend: { label: '股利', cls: 'bg-teal-100 text-teal-700' },
  stockDividend: { label: '配股', cls: 'bg-blue-100 text-blue-700' },
}

export default function TransactionList({ transactions, stockNames, onDelete }: Props) {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">
          交易紀錄
          <span className="ml-2 text-xs text-gray-400 font-normal">（共 {transactions.length} 筆）</span>
        </h2>
        {transactions.length > 0 && (
          <button
            onClick={() => exportTransactionsCSV(transactions, stockNames)}
            className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
          >
            ↓ 匯出 CSV
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">尚無交易紀錄</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-y-auto max-h-72 scrollbar-thin">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium w-[15%]">代碼</th>
                  <th className="pb-2 font-medium w-[13%]">類型</th>
                  <th className="pb-2 font-medium w-[17%]">日期</th>
                  <th className="pb-2 font-medium text-right w-[16%]">股數</th>
                  <th className="pb-2 font-medium text-right w-[16%]">價格</th>
                  <th className="pb-2 font-medium text-right w-[18%]">金額</th>
                  <th className="pb-2 w-[5%]"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(tx => (
                  <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50 group">
                    <td className="py-2 font-semibold text-gray-900 truncate" title={tx.stockCode}>{tx.stockCode}</td>
                    <td className="py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${TYPE_META[tx.type].cls}`}>
                        {TYPE_META[tx.type].label}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDate(tx.date)}</td>
                    <td className="py-2 text-right text-gray-700">{tx.shares.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-700">
                      {tx.type === 'stockDividend' ? '—' : tx.price.toFixed(2)}
                    </td>
                    <td className="py-2 text-right text-gray-700">
                      {tx.type === 'stockDividend' ? '—' : Math.round(tx.shares * tx.price).toLocaleString()}
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
          <div className="sm:hidden space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
            {sorted.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${TYPE_META[tx.type].cls}`}>
                  {TYPE_META[tx.type].label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{tx.stockCode}</span>
                    <span className="text-gray-400 text-xs">{fmtDate(tx.date)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {tx.type === 'stockDividend'
                      ? `${tx.shares.toLocaleString()} 股（配股）`
                      : `${tx.shares.toLocaleString()} 股 × ${tx.price.toFixed(2)} ＝ ${Math.round(tx.shares * tx.price).toLocaleString()}`}
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
