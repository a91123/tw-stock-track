import { useState } from 'react'

interface Props {
  onClose: () => void
}

const SECTIONS = ['快速開始', '各頁功能', '數字說明', '匯入方式', '常見問題'] as const
type Section = typeof SECTIONS[number]

export default function HelpModal({ onClose }: Props) {
  const [section, setSection] = useState<Section>('快速開始')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">使用說明</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab row */}
        <div className="flex border-b border-gray-100 px-2 overflow-x-auto shrink-0">
          {SECTIONS.map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                section === s
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 text-sm text-gray-700 space-y-4">

          {section === '快速開始' && (
            <>
              <Step n={1} title="新增你的買入紀錄">
                點上方「📝 紀錄」分頁 → 填入股票代碼（如 <code>2330</code>）、買入日期、股數、單價，按「新增」。
                也可以截圖券商 App 的對帳單，讓 AI 自動辨識。
              </Step>
              <Step n={2} title="更新股價">
                點右上角「<b>更新股價</b>」，系統會從台灣證交所抓取最新收盤價。
                交易時間內每 30 秒也會自動抓即時報價。
              </Step>
              <Step n={3} title="查看損益">
                切到「📊 資產」分頁，就能看到整體報酬率、損益走勢圖，以及跟大盤（0050）的比較。
              </Step>
              <p className="text-xs text-gray-400 pt-1">
                所有資料都存在你的 Google 帳號，換裝置登入一樣看得到。
              </p>
            </>
          )}

          {section === '各頁功能' && (
            <div className="space-y-4">
              <TabDesc icon="📊" name="資產">
                整體損益一覽：報酬率、走勢圖、報酬日曆、資產配置圓餅圖、績效 vs 大盤（可選 1月／3月／1年等區間）、定期定額試算、股利再投入試算、年度報告。
              </TabDesc>
              <TabDesc icon="📦" name="持倉">
                目前還持有的股票，顯示持股數、均攤成本、現價、未實現損益、個股報酬率。
                點股票代碼旁的 📈 可展開走勢圖。可設定「目標價」和「停損價」，達標時會出現提醒。
              </TabDesc>
              <TabDesc icon="📝" name="紀錄">
                手動新增買入／賣出／股利紀錄，或上傳截圖 / CSV 批次匯入。
                已入帳的紀錄可以刪除，刪除後損益即時更新。
              </TabDesc>
              <TabDesc icon="📰" name="新聞">
                輸入股票代碼搜尋相關新聞，AI 自動標記「利多 / 利空 / 中性」並分析潛在影響。
                持倉新聞可以一鍵全部更新（每日快取，不重複打 API）。
              </TabDesc>
            </div>
          )}

          {section === '數字說明' && (
            <div className="space-y-4">
              <Def term="報酬率">
                <b>（損益 ÷ 買入成本）× 100%</b>。<br />
                損益 = 目前市值 + 已實現賣出損益 + 累計股利 − 買入成本。<br />
                買入成本採先進先出（FIFO），含手續費。
              </Def>
              <Def term="年化報酬率（XIRR）">
                把「每次進出的時間點和金額」換算成<b>每年幾趴</b>的速度。
                比報酬率更公平——持有 3 個月賺 10% 跟持有 3 年賺 10% 是完全不一樣的事。
              </Def>
              <Def term="績效 vs 大盤（含股利）">
                比較你的組合 vs 0050（或自選股）<b>在同樣時間段</b>的含股利總報酬。
                「超越對手」= 你的報酬率 − 基準報酬率，正值代表跑贏。
              </Def>
              <Def term="未實現 / 已實現損益">
                <b>未實現</b>：還持有、尚未賣出的帳面損益。<br />
                <b>已實現</b>：已賣出的實際損益 + 收到的現金股利。
              </Def>
              <p className="text-xs text-gray-400">
                股價資料來源：台灣證券交易所（上市）、櫃買中心（上櫃）。
                配息資料來源：FinMind API。
              </p>
            </div>
          )}

          {section === '匯入方式' && (
            <div className="space-y-4">
              <Method icon="📸" title="截圖匯入（推薦）">
                <ol className="list-decimal list-inside space-y-1 text-gray-600">
                  <li>截取券商 App 的「對帳單」或「交易明細」畫面</li>
                  <li>在「📝 紀錄」頁點「上傳截圖」，可一次選多張</li>
                  <li>AI 自動辨識股票代碼、日期、股數、單價</li>
                  <li>確認資料無誤後點「確認匯入」</li>
                </ol>
                <p className="text-xs text-gray-400 mt-1">需要在設定中填入 Gemini API Key（免費方案即可）。</p>
              </Method>
              <Method icon="📄" title="CSV 匯入">
                <ol className="list-decimal list-inside space-y-1 text-gray-600">
                  <li>在券商網站下載「交易明細」或「對帳單」CSV</li>
                  <li>在「📝 紀錄」頁點「上傳 CSV」</li>
                  <li>系統自動對應欄位（支援多數券商格式，含國泰已實現損益）</li>
                </ol>
              </Method>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                ⚠ 重複匯入會自動去重，同一筆交易不會被計算兩次。
              </p>
            </div>
          )}

          {section === '常見問題' && (
            <div className="space-y-4">
              <QA q="股價一直沒更新怎麼辦？">
                點右上角「更新股價」按鈕。若顯示灰色，代表尚未有交易紀錄。
                台灣股市收盤（下午 1:30）後才能取得當日收盤價。
              </QA>
              <QA q="報酬率感覺不對？">
                確認是否有漏掉某筆買入／賣出紀錄。若有股票分割、除息等特殊情況，
                需手動補充對應的交易紀錄。
              </QA>
              <QA q="股利沒有算進去？">
                切到「📦 持倉」頁，點右上角「重新查詢」按鈕，系統會從 FinMind 抓最新配息資料，
                確認後點「一鍵匯入」即可將股利加入紀錄。
              </QA>
              <QA q="績效跟大盤比 數字怪怪的？">
                「3月」區間代表：0050 從 3 個月前算到今天；你的組合也從同一天算起。
                若你的持倉時間不到 3 個月，組合會從你<b>首筆買入日</b>算，旁邊會有提示。
              </QA>
              <QA q="換手機或電腦，資料還在嗎？">
                只要用同一個 Google 帳號登入，資料自動同步，不需要任何匯出匯入。
              </QA>
            </div>
          )}

        </div>

        <div className="px-5 py-3 border-t border-gray-100 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">
        {n}
      </div>
      <div>
        <p className="font-medium text-gray-800 mb-0.5">{title}</p>
        <p className="text-gray-600 text-sm">{children}</p>
      </div>
    </div>
  )
}

function TabDesc({ icon, name, children }: { icon: string; name: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-gray-800 mb-1">{icon} {name}</p>
      <p className="text-gray-600 text-sm">{children}</p>
    </div>
  )
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-gray-800 mb-0.5">{term}</p>
      <p className="text-gray-600 text-sm">{children}</p>
    </div>
  )
}

function Method({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-gray-800 mb-1">{icon} {title}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-gray-800 mb-0.5">Q：{q}</p>
      <p className="text-gray-600 text-sm">{children}</p>
    </div>
  )
}
