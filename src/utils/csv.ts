import { ParsedTx } from '../services/gemini'

export interface CsvParseResult {
  txs: ParsedTx[]
  skipped: number
}

// Column aliases, lowercased. Header row is matched against these.
const HEADER_ALIASES: Record<keyof ParsedTx, string[]> = {
  stockCode: ['代碼', '股票代碼', '股票代號', '代號', 'stockcode', 'code', 'symbol'],
  type: ['類型', '買賣', '買賣別', '交易別', '交易種類', 'type'],
  date: ['日期', '成交日期', '交易日期', 'date'],
  shares: ['股數', '數量', '成交股數', '成交數量', 'shares', 'quantity', 'qty'],
  price: ['價格', '成交價', '成交價格', '成交均價', '均價', '單價', 'price'],
}

const DEFAULT_ORDER: (keyof ParsedTx)[] = ['stockCode', 'type', 'date', 'shares', 'price']

// 常見台股名稱 → 代碼（用於無代號的券商匯出格式）
const NAME_TO_CODE: Record<string, string> = {
  '台積電': '2330', '聯發科': '2454', '鴻海': '2317', '台達電': '2308',
  '廣達': '2382', '仁寶': '2324', '緯創': '3231', '英業達': '2356',
  '和碩': '4938', '技嘉': '2376', '微星': '2377', '華碩': '2357',
  '友達': '2409', '群創': '3481', '日月光投控': '3711', '南電': '8046',
  '中華電': '2412', '台灣大': '3045', '遠傳': '4904',
  '台塑': '1301', '南亞': '1303', '台化': '1326', '台塑化': '6505',
  '中鋼': '2002', '中油': '5347', '大亞': '1609', '台橡': '2103',
  '統一': '1216', '統一超': '2912', '全家': '5903', '全聯': '9937',
  '國泰金': '2882', '富邦金': '2881', '合庫金': '5880', '華南金': '2880',
  '台新金': '2887', '玉山金': '2884', '元大金': '2885', '永豐金': '2890',
  '第一金': '2892', '兆豐金': '2886', '開發金': '2883', '中信金': '2891',
  '新保': '9925', '中保科': '9917', '大同': '2371',
  '台灣50': '0050', '台灣高股息': '0056', '元大台灣50': '0050', '元大高股息': '0056',
  '國泰台灣5G+': '00881', '永豐台灣ESG': '00888', '統一台灣動能': '00757',
  '富邦台50': '006208', '中信關鍵半導體': '00891', '元大台灣價值高息': '00940',
}

// Minimal CSV line splitter with double-quote support
function splitLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { cells.push(cur); cur = '' }
    else cur += ch
  }
  cells.push(cur)
  return cells.map(c => c.trim())
}

function parseType(raw: string): ParsedTx['type'] | null {
  const v = raw.toLowerCase()
  if (v === 'buy' || /買/.test(raw)) return 'buy'
  if (v === 'sell' || /賣|融券/.test(raw)) return 'sell'
  if (v === 'dividend' || /股利|配息|股息|現金股利/.test(raw)) return 'dividend'
  // 券商「未實現/庫存明細」匯出：現股、融資都是持有中的買進部位
  if (/現股|融資/.test(raw)) return 'buy'
  return null
}

// Accepts YYYY-MM-DD, YYYY/M/D, and ROC dates like 114/06/10 (year < 1000 → +1911)
function parseDate(raw: string): string | null {
  const m = raw.match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!m) return null
  let year = Number(m[1])
  if (year < 1000) year += 1911
  const month = m[2].padStart(2, '0')
  const day = m[3].padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''))
}

// ── 國泰證券「已實現損益」格式偵測 ──────────────────────────────
// 特徵：有「股票名稱」、「賣出單價」、「賣出日期」欄（但無「代碼」欄）
function isCathayRealizedFormat(headers: string[]): boolean {
  return headers.includes('股票名稱') &&
    headers.includes('賣出單價') &&
    headers.includes('賣出日期')
}

function parseCathayRealized(lines: string[]): CsvParseResult {
  const headers = splitLine(lines[0]).map(h => h.trim())
  const col = (name: string) => headers.indexOf(name)

  const nameIdx = col('股票名稱')
  const dateIdx = col('賣出日期')
  const sharesIdx = col('股數')
  const priceIdx = col('賣出單價')

  const txs: ParsedTx[] = []
  let skipped = 0

  for (const line of lines.slice(1)) {
    const cells = splitLine(line)
    const get = (idx: number) => (idx >= 0 ? cells[idx] ?? '' : '')

    const name = get(nameIdx).trim()
    const date = parseDate(get(dateIdx))
    const shares = parseNumber(get(sharesIdx))
    const price = parseNumber(get(priceIdx))

    // 賣出單價 = 0 代表除股票股利等特殊情況，跳過
    if (!name || !date || !(shares > 0) || !(price > 0)) {
      skipped++
      continue
    }

    // 名稱 → 代碼：查得到直接填，查不到填空讓使用者手動輸入
    const stockCode = NAME_TO_CODE[name] ?? ''

    txs.push({ stockCode, type: 'sell', date, shares, price })
  }

  return { txs, skipped }
}

// ── 通用 CSV 解析 ────────────────────────────────────────────────
export function parseCsv(text: string): CsvParseResult {
  const lines = text
    .replace(/^﻿/, '') // strip BOM
    .split(/\r\n|\r|\n/)
    .filter(l => l.trim() !== '')

  if (lines.length === 0) return { txs: [], skipped: 0 }

  const headerCells = splitLine(lines[0]).map(c => c.trim())

  // 國泰已實現損益格式 → 獨立解析路徑
  if (isCathayRealizedFormat(headerCells)) {
    return parseCathayRealized(lines)
  }

  // 通用格式：偵測欄位對應
  const headerCellsLower = headerCells.map(c => c.toLowerCase())
  const colIndex = {} as Record<keyof ParsedTx, number>
  let headerMatches = 0
  for (const field of DEFAULT_ORDER) {
    const idx = headerCellsLower.findIndex(c => HEADER_ALIASES[field].includes(c))
    colIndex[field] = idx
    if (idx >= 0) headerMatches++
  }

  let dataLines: string[]
  if (headerMatches >= 3) {
    dataLines = lines.slice(1)
  } else {
    dataLines = lines
    DEFAULT_ORDER.forEach((field, i) => { colIndex[field] = i })
  }

  const txs: ParsedTx[] = []
  let skipped = 0
  for (const line of dataLines) {
    const cells = splitLine(line)
    const get = (field: keyof ParsedTx) =>
      colIndex[field] >= 0 ? (cells[colIndex[field]] ?? '') : ''

    const type = parseType(get('type'))
    const date = parseDate(get('date'))
    const shares = parseNumber(get('shares'))
    const price = parseNumber(get('price'))
    const stockCode = get('stockCode').toUpperCase()

    if (!type || !date || !(shares > 0) || !(price > 0)) {
      skipped++
      continue
    }
    txs.push({ stockCode, type, date, shares, price })
  }

  return { txs, skipped }
}
