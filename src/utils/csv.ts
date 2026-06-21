import { ParsedTx } from '../services/gemini'

export interface CsvParseResult {
  txs: ParsedTx[]
  skipped: number // data rows that couldn't be parsed
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

export function parseCsv(text: string): CsvParseResult {
  const lines = text
    .replace(/^\uFEFF/, '') // strip BOM
    .split(/\r\n|\r|\n/)
    .filter(l => l.trim() !== '')

  if (lines.length === 0) return { txs: [], skipped: 0 }

  // Detect header row: map each known field to a column index
  const headerCells = splitLine(lines[0]).map(c => c.toLowerCase())
  const colIndex = {} as Record<keyof ParsedTx, number>
  let headerMatches = 0
  for (const field of DEFAULT_ORDER) {
    const idx = headerCells.findIndex(c => HEADER_ALIASES[field].includes(c))
    colIndex[field] = idx
    if (idx >= 0) headerMatches++
  }

  let dataLines: string[]
  if (headerMatches >= 3) {
    dataLines = lines.slice(1)
  } else {
    // No recognizable header — assume default column order
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
