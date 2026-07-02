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
- [x] 歷史股價自動抓取（TWSE / TPEx，月快取）
- [x] 盤中即時報價（MIS，每 30 秒，背景暫停）
- [x] 損益計算（含手續費、證交稅、XIRR 年化）
- [x] 損益走勢圖、報酬日曆、個股明細、持股總覽

### 帳號與同步
- [x] Google 登入（Firebase Auth）
- [x] Firestore 雲端同步（多裝置共用）
- [x] Firestore 寫入失敗顯示「⚠ 同步失敗」提示
- [x] `undefined` 欄位 JSON 序列化修正（Firestore 不接受 undefined）

### 配息功能
- [x] 股利交易類型（dividend）
- [x] 配息查詢改用 **FinMind API**（取代失效的 TWSE TWT49U，支援 TSE/OTC/ETF）
- [x] 個股損益明細顯示股利欄

### 新聞功能（📰 新聞分頁）
- [x] 手動搜尋（任意股票代碼/名稱）
- [x] 持股自動新聞（批次一次打 API，不管幾隻都 1 次）
- [x] 每日快取（UTC 午夜 = 台灣早上 8 點重置）
- [x] 空快取不視為有效（上次失敗不影響今天）
- [x] 重新整理按鈕（永遠顯示，不因無新聞而消失）
- [x] 新聞卡片：可點連結、情緒標籤（利多/利空/中性）、潛在影響分析
- [x] Vertex AI 內部 URL 過濾（改用 Google News fallback）
- [x] **Prompt 加今天日期**，只查今天+昨天，前端過濾 3 天以上
- [x] 503 自動重試（3 次，2s/5s 間隔）

### ⚙️ 設定
- [x] Settings Modal（右上角 ⚙️）
- [x] Gemini API Key 設定、教學、清除

### 🤖 持倉 AI 分析（📊 資產分頁）
- [x] 一鍵報告（產業集中度、損益評估、風險提示、投資風格）
- [x] 自由問答 Chat UI（以實際持倉為背景）
- [x] 使用 `gemini-3.1-flash-lite`（500 RPD，無需 grounding）

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
- [ ] 截圖匯入未防重複（同截圖上傳兩次會重複）
- [ ] 無資料匯出/備份功能

---

## 重要檔案

| 檔案 | 說明 |
|------|------|
| `src/services/gemini.ts` | 所有 Gemini API 呼叫（新聞/截圖/分析） |
| `src/services/firestore.ts` | Firestore 讀寫（含 JSON 序列化防 undefined） |
| `src/services/dividends.ts` | FinMind 配息查詢 |
| `src/components/PortfolioAnalysis.tsx` | 持倉 AI 分析元件 |
| `src/components/StockNews.tsx` | 新聞分頁元件 |
| `src/components/SettingsModal.tsx` | API Key 設定 Modal |
| `src/App.tsx` | 主元件，tab 切換、新聞快取邏輯 |
