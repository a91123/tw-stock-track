interface Props {
  value: number | null      // 年化報酬率（百分比），無法計算時 null
  periodReturn: number      // 區間（持有期）報酬率（百分比）= 總損益 ÷ 成本
  holdingDays: number       // 第一筆交易至今的天數
  incompletePrices: boolean // 有持股缺現價，年化偏低
}

function pct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function colorOf(v: number) {
  return v >= 0 ? 'text-red-600' : 'text-green-600'
}

export default function AnnualizedReturn({ value, periodReturn, holdingDays, incompletePrices }: Props) {
  // 持有期短時年化會被放大到失真：< 30 天不顯示數字，< 180 天標註僅供參考
  const tooShort = holdingDays < 30
  const shortish = holdingDays < 180

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="grid grid-cols-2 gap-4">
        {/* 總報酬率 — 整個持有期實際賺的，最有參考價值 */}
        <div>
          <p className="text-xs text-gray-400 font-medium mb-1">總報酬率</p>
          <span className={`text-2xl font-bold tabular-nums ${colorOf(periodReturn)}`}>
            {pct(periodReturn)}
          </span>
          <p className="text-xs text-gray-400 mt-1">
            持有約 {holdingDays} 天的實際報酬（未年化）
          </p>
        </div>

        {/* 年化報酬率 (XIRR) */}
        <div className="border-l border-gray-100 pl-4">
          <p className="text-xs text-gray-400 font-medium mb-1">年化報酬率（XIRR）</p>
          {tooShort || value === null ? (
            <span className="text-2xl font-bold tabular-nums text-gray-300">—</span>
          ) : (
            <span className={`text-2xl font-bold tabular-nums ${colorOf(value)}`}>
              {pct(value)}
            </span>
          )}
          <p className="text-xs mt-1">
            {tooShort ? (
              <span className="text-gray-400">持有未滿 30 天，年化失真不顯示</span>
            ) : value === null ? (
              <span className="text-gray-300">資料不足以計算</span>
            ) : shortish ? (
              <span className="text-amber-500">持有期短，年化會放大，僅供參考</span>
            ) : incompletePrices ? (
              <span className="text-amber-500">部分持股缺現價，數字偏低</span>
            ) : (
              <span className="text-gray-400">換算成一整年，可與定存/大盤比較</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
