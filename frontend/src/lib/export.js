/**
 * Exportación de reportes a CSV (Excel) y PDF — S4-5.
 *
 * Una "columna" es `{ key, header, format? }`. `format` recibe el valor crudo y
 * la fila completa, y devuelve lo que se escribe en la celda.
 *
 * El CSV se genera a mano (sin dependencias) y el PDF carga jsPDF con import
 * dinámico, para que ~300 KB no entren al bundle inicial de quien nunca exporta.
 */

// Excel interpreta como fórmula cualquier celda que arranque con estos
// caracteres. Un lead llamado "=cmd|..." se convertiría en ejecución al abrir
// el archivo, así que se neutraliza anteponiendo una comilla simple.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r']

export function sanitizeCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return FORMULA_TRIGGERS.includes(text[0]) ? `'${text}` : text
}

function escapeCsv(value) {
  const text = sanitizeCell(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const cellValue = (row, column) => {
  const raw = row?.[column.key]
  return column.format ? column.format(raw, row) : raw
}

export function buildRows(data, columns) {
  return data.map((row) => columns.map((column) => cellValue(row, column)))
}

export function toCsv(data, columns) {
  const header = columns.map((c) => escapeCsv(c.header)).join(',')
  const body = buildRows(data, columns).map((cells) => cells.map(escapeCsv).join(','))
  return [header, ...body].join('\r\n')
}

/** Fecha local en YYYY-MM-DD, para el nombre del archivo. */
export function fileStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function buildFilename(base, extension, date = new Date()) {
  return `${base}-${fileStamp(date)}.${extension}`
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function exportToCsv(data, columns, baseName) {
  // El BOM es lo que hace que Excel abra el archivo como UTF-8; sin él, las
  // tildes y la ñ salen rotas al hacer doble clic en Windows.
  const blob = new Blob(['﻿', toCsv(data, columns)], {
    type: 'text/csv;charset=utf-8;',
  })
  downloadBlob(blob, buildFilename(baseName, 'csv'))
}

export async function exportToPdf(data, columns, { baseName, title, subtitle }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })

  doc.setFontSize(14)
  doc.text(title, 40, 40)

  doc.setFontSize(9)
  doc.setTextColor(120)
  const stamp = new Date().toLocaleString('es-EC', { dateStyle: 'long', timeStyle: 'short' })
  doc.text(subtitle ? `${subtitle} · Generado el ${stamp}` : `Generado el ${stamp}`, 40, 56)

  autoTable(doc, {
    startY: 72,
    head: [columns.map((c) => c.header)],
    body: buildRows(data, columns).map((cells) => cells.map((v) => sanitizeCell(v))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [33, 58, 142], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 248, 250] },
    margin: { left: 40, right: 40 },
  })

  doc.save(buildFilename(baseName, 'pdf'))
}
