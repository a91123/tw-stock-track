# 台股損益追蹤器 (TW Stock P&L Tracker)

追蹤台股投資損益的個人工具。輸入買賣紀錄後，自動抓取歷史收盤價，計算每日損益、報酬率，並以圖表與日曆呈現。支援 PWA，可加到手機主畫面當 App 使用。

## 功能

- **交易紀錄管理** — 手動新增買入/賣出紀錄，支援上市、上櫃股票與 ETF
- **截圖匯入** — 上傳券商 App 的交易紀錄截圖，由 Gemini AI 自動辨識成交易資料；辨識結果可逐筆編輯確認後再加入（民國年、張/股單位自動換算）
- **自動股價** — 從證交所（TWSE）與櫃買中心（TPEx）官方 API 抓取每日收盤價
- **損益視覺化** — 總覽卡片（總損益/未實現/已實現/報酬率）、每日損益走勢圖、報酬日曆、目前持股明細

## 技術架構

- React 18 + TypeScript + Vite + Tailwind CSS
- Recharts 圖表、vite-plugin-pwa
- 純前端，無後端 — 所有資料存在瀏覽器 localStorage
- 部署於 Vercel（靜態網站）

### 股價資料

`src/services/stockPrices.ts` 直接呼叫官方 API：

- 上市：`https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY`
- 上櫃：`https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock`

以「月」為單位快取並持久化到 localStorage —— 過去月份的歷史資料永久快取，當月資料 30 分鐘過期。所有請求經過全域節流（間隔 350ms）與失敗重試，避免被證交所限流。

### 截圖辨識

`src/services/gemini.ts` 從瀏覽器直接呼叫 Gemini 2.5 Flash（免費額度即可），使用結構化輸出（JSON schema）解析截圖。使用者的 Gemini API key 存在 localStorage，不經過任何伺服器。App 內附 API key 申請教學。

## 開發

```bash
npm install
npm run dev      # 本機開發
npm run build    # 產出 dist/
```

## Roadmap（功能規劃）

依實用度排序：

- [x] **手續費與證交稅** — 全域開關 + 券商折扣設定。手續費 0.1425%（最低 20 元）× 折扣；賣出加證交稅 0.3%（ETF 0.1%）。含費用的損益才是真實報酬
- [x] **盤中即時報價** — 證交所 MIS 行情站（經 Vercel 代理），開盤時間每 30 秒批次更新持股現價與總覽；分頁背景時暫停；圖表維持收盤價
- [ ] **資料匯出/匯入備份** — 交易紀錄只在 localStorage，清瀏覽器資料就沒了。匯出/匯入 JSON 是最重要的資料防護
- [ ] **股利紀錄** — 新增 `dividend` 交易類型，把配息納入總報酬（存股族必備）
- [ ] **個股損益明細頁** — 點持股展開該股票的成本、損益走勢與歷次交易
- [ ] **年化報酬率 (XIRR)** — 用現金流時間序列算年化報酬，可與定存、大盤 ETF 比較
- [ ] **截圖匯入防重複** — 「代碼+日期+股數+價格」相同時提醒，避免同截圖匯兩次
- [ ] **跨裝置同步** — 接 Google Drive 備份或加後端（匯出 JSON 的進階版）

## 注意事項

- 股價資料來源為證交所/櫃買中心，僅供參考，不構成投資建議
- 交易資料只存在瀏覽器本機，清除瀏覽器資料會遺失紀錄
