# 維股利 — 開發進度

## 專案概況

- **名稱**：維股利（諧音：維骨力）
- **技術**：React 18 + TypeScript + Vite + Tailwind + Vercel
- **後端**：Firebase Auth（Google 登入）+ Firestore（雲端儲存）
- **AI**：Gemini API（截圖辨識 / 新聞 / 持倉分析）

---

## 已完成功能

### 核心功能
- [x] 交易紀錄（買/賣/股利）手動新增、刪除
- [x] 截圖匯入（Gemini 2.5 Flash，支援多張、捲動截圖）
- [x] CSV 匯入（自動解析欄位、民國年、張→股換算）
- [x] **重複匯入防護**（fingerprint 去重：代碼|日期|類型|股數|價格，截圖與 CSV 皆支援）
- [x] 歷史股價自動抓取（TWSE / TPEx，月快取）
- [x] 盤中即時報價（MIS，每 30 秒，背景暫停）
- [x] 損益計算（含手續費、證交稅、XIRR 年化）
- [x] 損益走勢圖、報酬日曆、個股明細、持股總覽
- [x] **CSV 匯出**（UTF-8 BOM，欄位：日期/代碼/名稱/類型/股數/單價/金額/備注）

### 帳號與同步
- [x] Google 登入（Firebase Auth）
- [x] Firestore 雲端同步（多裝置共用）
- [x] Firestore 寫入失敗顯示「⚠ 同步失敗」提示
- [x] `undefined` 欄位 JSON 序列化修正（Firestore 不接受 undefined）

### 配息功能
- [x] 股利交易類型（dividend）
- [x] 配息查詢改用 **FinMind API**（取代失效的 TWSE TWT49U，支援 TSE/OTC/ETF）
- [x] **7 天 localStorage 快取**（避免重複打 FinMind API）
- [x] 手動「重新抓取」按鈕（強制更新快取）
- [x] 個股損益明細顯示股利欄

### 持倉（目前持倉）
- [x] 持股代碼、名稱（可直接點擊編輯）、股數、均攤成本、現價、市值、未實現損益、報酬率
- [x] **個股走勢圖**（點代碼旁 📈 展開；預設展開第一筆；recharts LineChart）
  - 買入日標記圓點、均攤成本虛線（amber）、現價虛線（teal）
- [x] **價格警示**（目標價 🎯 / 停損價 🛑，存 Firestore，達標高亮顯示）
- [x] 觸發警示 amber banner（在 App 層顯示）

### 資產配置
- [x] **資產配置圓餅圖**（Donut Pie，自訂 legend：顏色點＋名稱＋%＋市值）
- [x] **績效 vs 大盤**（BenchmarkComparison，預設比 0050 含股利）
  - 以首筆買入日為基準，計算 Total Return（股價報酬＋累計股利）
  - 可輸入任意股票代碼「對比」（如 2330、00919）
  - 「回到大盤」一鍵切回 0050
- [x] **定期定額試算**（DCA Calculator，可折疊）
  - 輸入：股票代碼、每月投入金額、起始月份
  - 每月以當月第一個交易日收盤價買入，無零股（地板除法）
  - 顯示：總投入、目前市值、損益、報酬率、月份數、累積股數
- [x] **股利再投入試算（DRIP）**（可折疊）
  - 輸入：股票代碼、初始投入金額、起始日期
  - 模擬「股利全再買進」vs「拿現金」的最終財富差距
  - 公平比較：不再投入 = 股票市值 + 累計現金股利；再投入 = DRIP股票市值
- [x] **年度損益報告**（AnnualReport，可折疊）
  - 按年分組，每年：買入金額、賣出金額、股利、手續費＋稅、淨現金流

### 新聞功能（📰 新聞分頁）
- [x] 手動搜尋（任意股票代碼/名稱）
- [x] 持股自動新聞（批次一次打 API，不管幾隻都 1 次）
- [x] 每日快取（UTC 午夜 = 台灣早上 8 點重置）
- [x] 空快取不視為有效（上次失敗不影響今天）
- [x] 重新整理按鈕（永遠顯示，不因無新聞而消失）
- [x] 新聞卡片：可點連結、情緒標籤（利多/利空/中性）、潛在影響分析
- [x] Vertex AI 內部 URL 過濾（改用 Google News fallback）
- [x] Prompt 加今天日期，只查今天+昨天，前端過濾 3 天以上
- [x] 503 自動重試（3 次，2s/5s 間隔）

### ⚙️ 設定
- [x] Settings Modal（右上角 ⚙️）
- [x] Gemini API Key 設定、教學、清除
- [x] 手續費費率設定

### 🤖 持倉 AI 分析（📊 資產分頁）
- [x] 一鍵報告（產業集中度、損益評估、風險提示、投資風格）
- [x] 自由問答 Chat UI（以實際持倉為背景）
- [x] 使用 `gemini-3.1-flash-lite`（500 RPD，無需 grounding）

### UI / 體驗
- [x] **桌機側邊欄**（w-52，sticky，含 logo/nav/更新/設定/深色/登出）
- [x] **手機 Tab 列**（頂部，4 個分頁，保留原有行為）
- [x] 深藍色 header（維股利 ＋ 副標題「台股損益 × AI 分析」）
- [x] Teal accent 色系
- [x] **深色模式**（🌙/☀️ 切換，localStorage 記憶，三層色階 CSS override）
- [x] 響應式設計（桌機表格 / 手機卡片）

---

## Gemini API 配額策略

| 功能 | Model | 配額 | 說明 |
|------|-------|------|------|
| 截圖辨識 | gemini-2.5-flash | 20 RPD | 結構化 JSON 輸出 |
| 新聞搜尋 | gemini-2.5-flash-lite | 20 RPD | Google Search Grounding |
| 持倉分析 | gemini-3.1-flash-lite | 500 RPD | 純文字，不需搜尋 |

- 持股新聞批次：N 隻股票 = 1 次 API call
- 每日快取：一天最多自動打 1 次新聞 API

---

## 待處理 / 已知問題

- [ ] 新聞 503 偶發（gemini-2.5-flash-lite 伺服器過載，重試邏輯已加但仍會失敗）
- [ ] 配息查詢無 rate limit 保護（FinMind 免費版限制，>10 隻股票可能踩到）
- [ ] 深色模式覆蓋不完整（部分第三方元件顏色尚未處理）

---

## 重要檔案

| 檔案 | 說明 |
|------|------|
| `src/services/gemini.ts` | 所有 Gemini API 呼叫（新聞/截圖/分析） |
| `src/services/firestore.ts` | Firestore 讀寫（含 PriceAlert 型別） |
| `src/services/dividends.ts` | FinMind 配息查詢（7 天 localStorage 快取） |
| `src/services/stockPrices.ts` | TWSE/TPEx 歷史股價、即時報價 |
| `src/utils/exportCsv.ts` | CSV 匯出（UTF-8 BOM） |
| `src/utils/pnl.ts` | 損益計算邏輯（含 XIRR） |
| `src/components/Holdings.tsx` | 持倉表格（走勢圖、警示） |
| `src/components/StockChart.tsx` | 個股走勢圖（recharts） |
| `src/components/BenchmarkComparison.tsx` | 績效對比（0050 or 任意股） |
| `src/components/AllocationChart.tsx` | 資產配置圓餅圖 |
| `src/components/DCACalculator.tsx` | 定期定額試算 |
| `src/components/AnnualReport.tsx` | 年度損益報告 |
| `src/components/ImportTransactions.tsx` | 截圖/CSV 匯入（含去重） |
| `src/components/PortfolioAnalysis.tsx` | 持倉 AI 分析 |
| `src/components/StockNews.tsx` | 新聞分頁 |
| `src/components/SettingsModal.tsx` | API Key＋手續費設定 |
| `src/App.tsx` | 主元件（tab、深色模式、警示 banner） |
