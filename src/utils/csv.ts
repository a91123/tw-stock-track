import { ParsedTx } from '../services/gemini'

export interface CsvParseResult {
  txs: ParsedTx[]
  skipped: number
}

// 可對應的欄位。stockName 是「股名欄」：中文名稱經 NAME_TO_CODE 轉代碼，查不到留空手填。
export type CsvField = 'stockCode' | 'stockName' | 'type' | 'date' | 'shares' | 'price'

export interface CsvMapping {
  cols: Partial<Record<CsvField, number>>
  fixedType?: ParsedTx['type'] // 檔案沒有類型欄時，整檔套用同一類型
}

export interface CsvAnalysis {
  headers: string[]      // 表頭列；無表頭時為空陣列
  hasHeader: boolean
  rows: string[][]       // 資料列（表頭之後）
  suggested: CsvMapping  // 自動偵測到的欄位對應
  confident: boolean     // true = 對應完整，可直接解析
  signature: string      // 表頭簽名，用來記住使用者的手動對應（無表頭時為空字串）
}

export type CsvImport =
  | { kind: 'parsed'; result: CsvParseResult; usedSavedMapping: boolean }
  | { kind: 'needs-mapping'; analysis: CsvAnalysis }

// Column aliases, lowercased. Header row is matched against these.
const HEADER_ALIASES: Record<CsvField, string[]> = {
  stockCode: ['代碼', '股票代碼', '股票代號', '代號', '證券代號', 'stockcode', 'code', 'symbol'],
  stockName: ['股名', '股票名稱', '名稱', '商品名稱', '證券名稱'],
  type: ['類型', '買賣', '買賣別', '交易別', '交易種類', 'type'],
  date: ['日期', '成交日期', '交易日期', 'date'],
  shares: ['股數', '數量', '成交股數', '成交數量', 'shares', 'quantity', 'qty'],
  price: ['價格', '成交價', '成交價格', '成交均價', '均價', '單價', 'price'],
}

const FIELDS: CsvField[] = ['stockCode', 'stockName', 'type', 'date', 'shares', 'price']
// 無表頭檔案的預設欄位順序（沿用文件說明的格式：代碼,類型,日期,股數,價格）
const HEADERLESS_ORDER: CsvField[] = ['stockCode', 'type', 'date', 'shares', 'price']
const HEADER_SCAN_LINES = 8 // 表頭可能不在第一行（券商常塞說明文字），掃前幾行找

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
  '國泰永續高股息': '00878', '中信綠能及電動車': '00896',
  '統一台灣高息動能': '00939', '群益台灣精選高息': '00919',
  '復華台灣科技優息': '00929', '元大台灣高息低波': '00713',
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
// 語意特殊（一列是一組買賣配對、交易別「現股」不代表買進），不走通用對應。
function isCathayRealizedFormat(headers: string[]): boolean {
  return headers.includes('股票名稱') &&
    headers.includes('賣出單價') &&
    headers.includes('賣出日期')
}

function parseCathayRealized(headers: string[], rows: string[][]): CsvParseResult {
  const col = (name: string) => headers.indexOf(name)

  const nameIdx = col('股票名稱')
  const dateIdx = col('賣出日期')
  const sharesIdx = col('股數')
  const priceIdx = col('賣出單價')

  const txs: ParsedTx[] = []
  let skipped = 0

  for (const cells of rows) {
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

// ── 通用 CSV 分析 ────────────────────────────────────────────────

// 掃前幾行，找出「欄位別名命中最多」的一行當表頭；命中太少視為無表頭。
function findHeader(lines: string[]): { index: number; cols: Partial<Record<CsvField, number>>; hits: number } {
  let best = { index: -1, cols: {} as Partial<Record<CsvField, number>>, hits: 0 }
  for (let i = 0; i < Math.min(lines.length, HEADER_SCAN_LINES); i++) {
    const cells = splitLine(lines[i]).map(c => c.toLowerCase())
    const cols: Partial<Record<CsvField, number>> = {}
    let hits = 0
    for (const field of FIELDS) {
      const idx = cells.findIndex(c => HEADER_ALIASES[field].includes(c))
      if (idx >= 0) { cols[field] = idx; hits++ }
    }
    if (hits > best.hits) best = { index: i, cols, hits }
  }
  return best
}

export function mappingComplete(m: CsvMapping): boolean {
  return m.cols.date !== undefined &&
    m.cols.shares !== undefined &&
    m.cols.price !== undefined &&
    (m.cols.type !== undefined || m.fixedType !== undefined) &&
    (m.cols.stockCode !== undefined || m.cols.stockName !== undefined)
}

export function analyzeCsv(text: string): CsvAnalysis {
  const lines = text
    .replace(/^﻿/, '') // strip BOM
    .split(/\r\n|\r|\n/)
    .filter(l => l.trim() !== '')

  const header = findHeader(lines)

  if (header.hits >= 3) {
    const headers = splitLine(lines[header.index])
    const suggested: CsvMapping = { cols: header.cols }
    return {
      headers,
      hasHeader: true,
      rows: lines.slice(header.index + 1).map(splitLine),
      suggested,
      confident: mappingComplete(suggested),
      signature: headers.join('|'),
    }
  }

  // 無表頭：沿用預設欄位順序（代碼,類型,日期,股數,價格）
  const cols: Partial<Record<CsvField, number>> = {}
  HEADERLESS_ORDER.forEach((field, i) => { cols[field] = i })
  return {
    headers: [],
    hasHeader: false,
    rows: lines.map(splitLine),
    suggested: { cols },
    confident: true, // 先樂觀解析，全數失敗時由 importCsv 轉入手動對應
    signature: '',
  }
}

export function extractTxs(rows: string[][], mapping: CsvMapping): CsvParseResult {
  const get = (cells: string[], field: CsvField) => {
    const idx = mapping.cols[field]
    return idx !== undefined ? (cells[idx] ?? '') : ''
  }

  const txs: ParsedTx[] = []
  let skipped = 0
  for (const cells of rows) {
    const type = mapping.cols.type !== undefined
      ? parseType(get(cells, 'type'))
      : mapping.fixedType ?? null
    const date = parseDate(get(cells, 'date'))
    const shares = parseNumber(get(cells, 'shares'))
    const price = parseNumber(get(cells, 'price'))

    let stockCode = get(cells, 'stockCode').toUpperCase()
    if (!stockCode && mapping.cols.stockName !== undefined) {
      stockCode = NAME_TO_CODE[get(cells, 'stockName')] ?? ''
    }

    if (!type || !date || !(shares > 0) || !(price > 0)) {
      skipped++
      continue
    }
    txs.push({ stockCode, type, date, shares, price })
  }

  return { txs, skipped }
}

// 匯入進入點：專屬格式 → 已存對應 → 自動偵測 → 手動對應
export function importCsv(text: string, savedMappings: Record<string, CsvMapping>): CsvImport {
  const analysis = analyzeCsv(text)

  if (analysis.hasHeader && isCathayRealizedFormat(analysis.headers)) {
    return { kind: 'parsed', result: parseCathayRealized(analysis.headers, analysis.rows), usedSavedMapping: false }
  }

  const saved = analysis.signature ? savedMappings[analysis.signature] : undefined
  if (saved && mappingComplete(saved)) {
    const result = extractTxs(analysis.rows, saved)
    if (result.txs.length > 0) return { kind: 'parsed', result, usedSavedMapping: true }
  }

  if (analysis.confident) {
    const result = extractTxs(analysis.rows, analysis.suggested)
    if (result.txs.length > 0) return { kind: 'parsed', result, usedSavedMapping: false }
  }

  return { kind: 'needs-mapping', analysis }
}
