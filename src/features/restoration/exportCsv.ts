const escape = (value: string | number) => {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const linesToCsv = (lines: (string | number)[][]) => lines.map((line) => line.map(escape).join(',')).join('\r\n')

export function saveCsv(csv: string, fileName: string): void {
  // the BOM makes a spreadsheet read the Arabic text as UTF-8
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
