interface Props {
  value: number | null // 年化報酬率（百分比），無法計算時 null
  incompletePrices: boolean // 有持股缺現價，數字偏低
}

export default function AnnualizedReturn({ value, incompletePrices }: Props) {
  const cls = value === null ? 'text-gray-400' : value >= 0 ? 'text-red-600' : 'text-green-600'

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-400 font-medium mb-1">年化報酬率（XIRR）</p>
        <p className="text-xs text-gray-400">以買賣、股利與目前市值的現金流時間序列計算，可與定存、大盤比較</p>
      </div>
      <div className="text-right">
        <span className={`text-2xl font-bold tabular-nums ${cls}`}>
          {value === null
            ? '—'
            : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`}
        </span>
        {incompletePrices && value !== null && (
          <p className="text-xs text-amber-500 mt-1">部分持股缺現價，數字偏低</p>
        )}
        {value === null && (
          <p className="text-xs text-gray-300 mt-1">資料不足以計算</p>
        )}
      </div>
    </div>
  )
}
