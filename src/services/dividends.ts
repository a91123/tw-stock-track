export interface DividendRecord {
  stockCode: string
  exDate: string       // YYYY-MM-DD
  cashPerShare: number // 每股現金股利
}

function rocToISO(rocDate: string): string | null {
  const parts = rocDate.trim().split('/')
  if (parts.length !== 3) return null
  const year = parseInt(parts[0], 10) + 1911
  if (isNaN(year)) return null
  return `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
}

function parseRecords(
  fields: string[] | undefined,
  data: string[][] | undefined,
  stockCode: string,
): DividendRecord[] {
  if (!fields || !data || data.length === 0) return []

  const exDateIdx = fields.findIndex(f => f.includes('除息') && (f.includes('日') || f.includes('交易')))
  const cashIdx = fields.findIndex(f => f.includes('現金股利') || (f.includes('現金') && f.includes('配息')))

  if (exDateIdx === -1 || cashIdx === -1) return []

  const records: DividendRecord[] = []
  for (const row of data) {
    const rawDate = row[exDateIdx]?.trim()
    const rawCash = row[cashIdx]?.replace(/,/g, '').trim()

    if (!rawDate || rawDate === '--' || rawDate === '') continue
    if (!rawCash || rawCash === '--' || rawCash === '') continue

    const cash = parseFloat(rawCash)
    if (isNaN(cash) || cash <= 0) continue

    const exDate = rocToISO(rawDate)
    if (!exDate) continue

    records.push({ stockCode, exDate, cashPerShare: cash })
  }
  return records
}

export async function fetchTWSEDividends(stockCode: string): Promise<DividendRecord[]> {
  try {
    const res = await fetch(
      `https://www.twse.com.tw/rwd/zh/exRight/TWT49U?stockNo=${encodeURIComponent(stockCode)}&response=json`,
    )
    if (!res.ok) return []
    const json = (await res.json()) as Record<string, unknown>
    if (json.stat !== 'OK') return []

    for (const [fk, dk] of [['fields9', 'data9'], ['fields', 'data'], ['fields0', 'data0']]) {
      const records = parseRecords(
        json[fk] as string[] | undefined,
        json[dk] as string[][] | undefined,
        stockCode,
      )
      if (records.length > 0) return records
    }
    return []
  } catch {
    return []
  }
}

export async function fetchTPExDividends(stockCode: string): Promise<DividendRecord[]> {
  try {
    const res = await fetch(`/api/tpex-dividend?code=${encodeURIComponent(stockCode)}`)
    if (!res.ok) return []
    const json = (await res.json()) as Record<string, unknown>

    for (const [fk, dk] of [['fields', 'data'], ['fields9', 'data9']]) {
      const records = parseRecords(
        json[fk] as string[] | undefined,
        json[dk] as string[][] | undefined,
        stockCode,
      )
      if (records.length > 0) return records
    }
    return []
  } catch {
    return []
  }
}

export async function fetchDividends(
  stockCode: string,
  market: 'tse' | 'otc',
): Promise<DividendRecord[]> {
  return market === 'tse'
    ? fetchTWSEDividends(stockCode)
    : fetchTPExDividends(stockCode)
}
