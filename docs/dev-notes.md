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
- [x] **國泰證券「已實現損益」CSV 格式**（無代號欄，自動查名稱→代碼對照表，解析為賣出交易）
- [x] **重複匯入防護**（fingerprint 去重：代碼|日期|類型|股數|價格）
- [x] 歷史股價自動抓取（TWSE / TPEx，月快取）
- [x] 盤中即時報價（MIS，每 30 秒，背景暫停）
- [x] 損益計算（含手續費、證交稅、XIRR 年化）
- [x] 損益走勢圖、報酬日曆、個股明細、持股總覽
- [x] **CSV 匯出**（UTF-8 BOM，欄位：日期/代碼/名稱/類型/股數/單價/金額/備注）

### 帳號與同步
- [x] Google 登入（Firebase Auth）
- [x] Firestore 雲端同步（多裝置共用）
- [x] Firestore 寫入失敗顯示「⚠ 同步失敗」提示

### 配息功能
- [x] 股利交易類型（dividend）
- [x] 配息查詢改用 **FinMind API**（TaiwanStockDividend dataset，支援 TSE/OTC/ETF）
- [x] **7 天 localStorage 快取**（避免重複打 FinMind API）
- [x] 手動「重新抓取」按鈕（強制更新快取）

### 持倉（目前持倉）
- [x] 持股代碼、名稱、股數、均攤成本、現價、市值、未實現損益、報酬率
- [x] **個股走勢圖**（點 📈 展開，預設展開第一筆；recharts LineChart）
  - 買入日標記圓點、均攤成本虛線（amber）、現價虛線（teal）
- [x] **價格警示**（目標價 🎯 / 停損價 🛑，存 Firestore，達標高亮顯示）

### 資產配置
- [x] **資產配置圓餅圖**（Donut Pie，顯示顏色點＋名稱＋%＋市值）
- [x] **績效 vs 大盤**（BenchmarkComparison）
  - 預設比 0050 含股利，可輸入任意代碼「對比」
  - **區間選擇**：1月 / 3月 / 6月 / 1年 / 3年 / 全期 膠囊按鈕
  - 「回到大盤」一鍵切回 0050
  - **股價來源改用 FinMind `TaiwanStockPriceAdj`**（已還原股票分割，解決 0050 等 ETF 3年報酬率偏差）
  - 切換期間從記憶體算（`useMemo`），不重新呼叫 API
  - 重新整理按鈕含防抖，清除還原股價快取（12h）＋股利快取（7d）
- [x] **定期定額試算**（DCACalculator，可折疊）
  - 輸入：股票代碼、每月投入、起始月、**投資年限**、**假設年化報酬率**（預設 8%）
  - 過去月份用真實 TWSE 股價；未來月份從最後已知股價複利推算
  - 顯示：總投入、預估市值、損益、報酬率、幾個月實際 / 幾個月預測
- [x] **股利再投入試算（DRIP）**（可折疊）
  - 比較「拿現金 vs 全再投入」最終財富差距
- [x] **年度損益報告**（AnnualReport，可折疊）
  - 按年分組：買入金額、賣出金額、股利、手續費＋稅、淨現金流

### 新聞功能（📰 新聞分頁）
- [x] 手動搜尋 + 持股自動新聞（批次一次打 API）
- [x] 每日快取（UTC 午夜重置）
- [x] 新聞卡片：情緒標籤（利多/利空/中性）、潛在影響分析
- [x] 503 自動重試（3 次）

### ⚙️ 設定
- [x] Gemini API Key 設定、教學、清除
- [x] 手續費費率設定

### 🤖 持倉 AI 分析
- [x] 一鍵報告（產業集中度、損益評估、風險提示、投資風格）
- [x] 自由問答 Chat UI（以實際持倉為背景）

### UI / 體驗
- [x] **桌機側邊欄**（w-52，sticky，含 logo/nav/更新/設定/深色/登出）
- [x] **桌機頂部 Header**（hidden sm:flex sticky，含：更新股價、深色模式、用戶名稱、登出）
- [x] **手機 Tab 列**（頂部，4 個分頁）
- [x] **深色模式**（🌙/☀️ 切換，三層色階：頁面底色 → 卡片 → 卡片內格）
- [x] 響應式設計（桌機表格 / 手機卡片）
- [x] **❓ 使用說明 Modal**（5 分頁：快速開始 / 各頁功能 / 數字說明 / 匯入方式 / 常見問題）
- [x] **版號顯示**（左下角 v1.1.1，方便用戶回報問題時定位版本）

---

## 核心公式說明

### 1. 損益計算

| 名稱 | 公式 |
|------|------|
| 手續費 | `成交金額 × 費率（預設 0.1425%）`，最低 20 元 |
| 證交稅 | `賣出金額 × 0.3%`（ETF 0.1%） |
| 已實現損益（賣出） | `賣出金額 - 買入成本（FIFO）- 買賣手續費 - 證交稅` |
| 已實現損益（股利） | `股數 × 每股現金股利` |
| 未實現損益 | `現價 × 持股數 - 持股成本` |
| 總損益 | `未實現 + 已實現（賣出）+ 已實現（股利）` |
| 報酬率 | `總損益 / 歷來買進成本合計` |

> 成本採 FIFO（先進先出），賣出時從最早的買單扣起。

### 2. XIRR 年化報酬

以現金流折現法計算年化報酬率（IRR 的非定期版本）。  
現金流定義：
- 買進 → 負（流出）
- 賣出 / 收到股利 → 正（流入）
- 今日的持倉市值 → 正（假設此刻清算）

找到使 NPV = 0 的折現率 r，即為年化報酬率。

### 3. 績效 vs 大盤（BenchmarkComparison）

**資料來源：FinMind `TaiwanStockPriceAdj`**（還原股票分割後的收盤價），12 小時本地快取。

**基準（0050 或自選股）含股利總報酬：**
```
startPrice = fromDate 後第一筆還原收盤價
endPrice   = 最新還原收盤價
cumDiv     = sum(exDate >= fromDate 的現金股利)
基準報酬率 = (endPrice + cumDiv - startPrice) / startPrice × 100%
```

**我的投資組合區間報酬（非全期）：**
```
對每檔「現持股」：
  startPrice  = pricesByStock[代碼][fromDate 後最近有資料日]  ← TWSE 月快取
  startValue += 現持股數 × startPrice
  endValue   += 現持股數 × 現價

期間報酬率 = (endValue - startValue) / startValue × 100%
```
> 全期改用 `totalPnL / 成本` 以含入所有已實現損益（含股利）。  
> 兩個 fromDate 獨立：基準不設下限；組合 fromDate 不早於 firstBuyDate（買之前沒持倉）。  
> 超出持倉期間的區間，旁邊顯示「組合持倉未滿 N，以 firstBuyDate 起計」提示。

### 4. 定期定額試算（DCA）

**過去月份（有真實股價）：**
```
每月第一個交易日收盤價 = p
買進股數 = floor(每月投入 / p)      ← 無零股，整數除
totalInvested += 買進股數 × p       ← 記實際花掉的錢
```

**未來月份（預測）：**
```
月複利率 = (1 + 年化報酬率)^(1/12) - 1
第 N 個未來月份的模擬股價 = 最後真實收盤價 × (1 + 月複利率)^N
買進股數 / totalInvested 邏輯同上
```

**最終市值：**
```
finalPrice = 最後真實收盤價 × (1 + 月複利率)^(未來月份總數)
預估市值 = 累計股數 × finalPrice
```

### 5. 股利再投入試算（DRIP）

```
模擬每個除息日：
  DRIP 模式：dripShares × 每股現金股利 / 當日股價（floor）= 新買股數
  普通模式：累計現金股利 += dripShares × 每股現金股利

最終比較：
  普通模式總財富 = 股票市值 + 累計現金股利
  DRIP 模式總財富 = DRIP 股票市值（已含複利再買進）
  多賺/少賺 = DRIP - 普通
```

---

## Gemini API 配額策略

| 功能 | Model | 配額 | 說明 |
|------|-------|------|------|
| 截圖辨識 | gemini-2.5-flash | 20 RPD | 結構化 JSON 輸出 |
| 新聞搜尋 | gemini-2.5-flash-lite | 20 RPD | Google Search Grounding |
| 持倉分析 | gemini-3.1-flash-lite | 500 RPD | 純文字，不需搜尋 |

---

## 待處理 / 已知問題

- [ ] 新聞 503 偶發（gemini-2.5-flash-lite 伺服器過載，重試邏輯已加但仍會失敗）
- [ ] FinMind 免費版無 rate limit 保護（持股 >10 檔同時查配息可能觸限）
- [ ] 深色模式覆蓋不完整（部分第三方元件顏色尚未處理）
- [ ] DCA 試算：零頭不累計到下個月（每月剩餘現金消失，非最真實的 DCA 行為）
- [ ] 定期定額未來預測假設股價線性複利，實際股價有波動，數字僅供參考
- [ ] 組合期間報酬（pricesByStock）仍用 TWSE 月快取，若持股有分割仍可能偏差（BenchmarkComparison 的基準已換 FinMind，但持倉端尚未換）

---

## 重要檔案

| 檔案 | 說明 |
|------|------|
| `src/services/gemini.ts` | 所有 Gemini API 呼叫 |
| `src/services/firestore.ts` | Firestore 讀寫 |
| `src/services/dividends.ts` | FinMind 配息查詢（7 天快取） |
| `src/services/adjustedPrices.ts` | FinMind 還原股價 TaiwanStockPriceAdj（12h 快取，benchmark 用） |
| `src/services/stockPrices.ts` | TWSE/TPEx 歷史股價（月快取）、即時報價 |
| `src/utils/pnl.ts` | 損益計算（FIFO、XIRR） |
| `src/utils/csv.ts` | CSV 解析（含國泰已實現格式） |
| `src/utils/exportCsv.ts` | CSV 匯出 |
| `src/components/Holdings.tsx` | 持倉表格（走勢圖、警示） |
| `src/components/BenchmarkComparison.tsx` | 績效對比（含區間選擇） |
| `src/components/DCACalculator.tsx` | 定期定額試算（含未來預測） |
| `src/components/DRIPCalculator.tsx` | 股利再投入試算 |
| `src/components/AllocationChart.tsx` | 資產配置圓餅圖 |
| `src/components/AnnualReport.tsx` | 年度損益報告 |
| `src/components/ImportTransactions.tsx` | 截圖/CSV 匯入（含去重） |
| `src/components/PortfolioAnalysis.tsx` | 持倉 AI 分析 |
| `src/components/StockNews.tsx` | 新聞分頁 |
| `src/App.tsx` | 主元件（tab、深色模式、警示 banner） |
