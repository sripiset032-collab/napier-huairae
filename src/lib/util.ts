export const today = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export const thDate = (iso: string | null | undefined) =>
  iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'

export const num = (v: number | string | null | undefined, digits = 0) =>
  v === null || v === undefined || v === '' ? '-' : Number(v).toLocaleString('th-TH', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

export const baht = (v: number | string | null | undefined) => (v === null || v === undefined ? '-' : num(v, 2) + ' ฿')

export const daysBetween = (fromIso: string, toIso = today()) =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000)

export const STATUS_TH: Record<string, string> = { active: 'กำลังปลูก', idle: 'ว่าง', fallow: 'พักแปลง' }
export const DEST_TH: Record<string, string> = { sale: 'ขาย', feed: 'เลี้ยงสัตว์', silage: 'หมัก', other: 'อื่นๆ' }
export const ROLE_TH: Record<string, string> = { admin: 'Admin', staff: 'ผู้บันทึก', viewer: 'ผู้ดู', pending: 'รออนุมัติ' }

/** Days after a cut when the plot is due again (Napier is commonly cut every 45–60 days). */
export const CUT_DUE_DAYS = 45

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
  // BOM so Excel opens Thai text correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export const errText = (e: unknown) => {
  const m = (e as { message?: string })?.message || String(e)
  if (/row-level security/i.test(m)) return 'คุณไม่มีสิทธิ์ทำรายการนี้'
  if (/duplicate key/i.test(m)) return 'ข้อมูลนี้มีอยู่แล้ว'
  return m
}
