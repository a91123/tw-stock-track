import { TransactionType } from '../types'

export interface NewsItem {
  title: string
  summary: string
  source: string
  date: string
}

export interface ParsedTx {
  stockCode: string
  type: TransactionType
  date: string
  shares: number
  price: number
}

const GEMINI_KEY_STORAGE = 'tw-stock-gemini-key'

export function loadGeminiKey(): string {
  return localStorage.getItem(GEMINI_KEY_STORAGE) ?? ''
}

export function saveGeminiKey(key: string): void {
  if (key) localStorage.setItem(GEMINI_KEY_STORAGE, key)
  else localStorage.removeItem(GEMINI_KEY_STORAGE)
}

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const PROMPT = `你是台股交易紀錄解析器。請從這些券商 App 的截圖中，擷取所有「成交」的交易紀錄。

規則：
- 可能一次提供多張截圖，且通常是「同一個頁面捲動後分段截圖」。股票代碼、股票名稱或年份標題可能只出現在第一張，請把這些上下文套用到後面截圖的紀錄。
- 捲動截圖會有重疊：同一筆紀錄（日期、股數、價格都相同）若出現在多張截圖中，只輸出一次。
- date 一律輸出 YYYY-MM-DD。若截圖使用民國年（例如 114/06/10），請加 1911 轉成西元年（2025-06-10）。若紀錄只顯示月/日（例如 08/05），年份請參考畫面上的年份區段標題（例如「2024年」）。
- shares 是「股數」。若截圖顯示的是張數（1 張 = 1000 股），請換算成股數。
- price 是每股成交價格（元）。
- type：買進/現買/融資買進 → buy；賣出/現賣/融券賣出 → sell。若截圖是「庫存明細」這類持股頁面，每筆持股明細視為一筆買進（buy）。
- 股利／股息／現金股利／配息紀錄 → type 填 dividend。dividend 的 shares 填「配息基準股數（持有股數）」、price 填「每股現金股利（元）」；若截圖只顯示「總配息金額」而沒有每股金額，shares 填 1、price 填該筆總配息金額（讓 shares × price = 實領金額）。股票股利（配股）暫不支援，請略過。
- stockCode 只輸出代碼（例如 2330），不含股票名稱。若所有截圖中都找不到代碼，stockCode 輸出空字串，不要用名稱猜測。
- 只擷取已成交的紀錄，忽略委託中、已取消的單。若無法辨識任何交易，回傳空陣列。`

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      stockCode: { type: 'STRING' },
      type: { type: 'STRING', enum: ['buy', 'sell', 'dividend'] },
      date: { type: 'STRING' },
      shares: { type: 'NUMBER' },
      price: { type: 'NUMBER' },
    },
    required: ['stockCode', 'type', 'date', 'shares', 'price'],
  },
}

const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [2000, 5000]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface ScreenshotImage {
  base64: string
  mimeType: string
}

export async function fetchStockNews(
  apiKey: string,
  stockCode: string,
  stockName?: string,
): Promise<NewsItem[]> {
  const label = stockName ? `${stockName}(${stockCode})` : stockCode
  const prompt =
    `請用 Google 搜尋「${label}」最近 7 天的台灣股市財經新聞，列出最多 5 則最重要的。` +
    `只回傳 JSON 陣列，不要其他文字：` +
    `[{"title":"...","summary":"一句話重點","source":"媒體名稱","date":"YYYY-MM-DD"}]`

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  })

  if (!res.ok) return []

  const data = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    return JSON.parse(match[0]) as NewsItem[]
  } catch {
    return []
  }
}

export async function parseScreenshots(
  apiKey: string,
  images: ScreenshotImage[],
): Promise<ParsedTx[]> {
  let res: Response
  for (let attempt = 0; ; attempt++) {
    res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              ...images.map(img => ({
                inline_data: { mime_type: img.mimeType, data: img.base64 },
              })),
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    })

    // 503（過載）與 500 是 Gemini 端的暫時性錯誤，重試通常就會成功
    if ((res.status === 503 || res.status === 500) && attempt < MAX_ATTEMPTS - 1) {
      await sleep(RETRY_DELAYS_MS[attempt])
      continue
    }
    break
  }

  if (!res.ok) {
    if (res.status === 400 || res.status === 403) {
      throw new Error('API key 無效，請檢查後重新輸入')
    }
    if (res.status === 429) {
      throw new Error('Gemini 免費額度已用完，請稍後再試')
    }
    if (res.status === 503 || res.status === 500) {
      throw new Error('Gemini 伺服器目前過載，已自動重試仍失敗，請過幾分鐘再試一次')
    }
    throw new Error(`Gemini API 錯誤 (${res.status})`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini 未回傳辨識結果')

  return JSON.parse(text) as ParsedTx[]
}
