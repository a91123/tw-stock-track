import { Transaction } from '../types'

const TYPE_LABEL: Record<string, string> = {
  buy: '買入',
  sell: '賣出',
  dividend: '股利',
}

function escape(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`
}

export function exportTransactionsCSV(
  transactions: Transaction[],
  stockNames: Record<string, string>,
) {
  const headers = ['日期', '股票代碼', '名稱', '類型', '股數', '單價', '金額', '備注']
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => [
      t.date,
      t.stockCode,
      stockNames[t.stockCode] ?? '',
      TYPE_LABEL[t.type] ?? t.type,
      t.shares,
      t.price,
      Math.round(t.shares * t.price),
      t.note ?? '',
    ])

  const csv = [headers, ...rows]
    .map(row => row.map(escape).join(','))
    .join('\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `維股利_交易紀錄_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
