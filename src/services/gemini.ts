import { TransactionType } from '../types'

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

const PROMPT = `你是台股交易紀錄解析器。請從這張券商 App 的交易紀錄截圖中，擷取所有「成交」的交易紀錄。

規則：
- date 一律輸出 YYYY-MM-DD。若截圖使用民國年（例如 114/06/10），請加 1911 轉成西元年（2025-06-10）。
- shares 是「股數」。若截圖顯示的是張數（1 張 = 1000 股），請換算成股數。
- price 是每股成交價格（元）。
- type：買進/現買/融資買進 → buy；賣出/現賣/融券賣出 → sell。
- stockCode 只輸出代碼（例如 2330），不含股票名稱。
- 只擷取已成交的紀錄，忽略委託中、已取消的單。若無法辨識任何交易，回傳空陣列。`

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      stockCode: { type: 'STRING' },
      type: { type: 'STRING', enum: ['buy', 'sell'] },
      date: { type: 'STRING' },
      shares: { type: 'NUMBER' },
      price: { type: 'NUMBER' },
    },
    required: ['stockCode', 'type', 'date', 'shares', 'price'],
  },
}

export async function parseScreenshot(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
): Promise<ParsedTx[]> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
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

  if (!res.ok) {
    if (res.status === 400 || res.status === 403) {
      throw new Error('API key 無效，請檢查後重新輸入')
    }
    if (res.status === 429) {
      throw new Error('Gemini 免費額度已用完，請稍後再試')
    }
    throw new Error(`Gemini API 錯誤 (${res.status})`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini 未回傳辨識結果')

  return JSON.parse(text) as ParsedTx[]
}
