import { useCallback, useEffect, useState } from 'react'
import { useMaster } from '../lib/master'
import { useAuth, useRole } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Activity, Cost, Harvest, Planting } from '../lib/types'
import { DEST_TH, baht, downloadCsv, errText, num, thDate, today } from '../lib/util'

type Kind = 'activity' | 'harvest' | 'planting' | 'cost'
interface Row {
  kind: Kind; id: number; date: string; plot_id: number; what: string; detail: string; amount: number | null
  kg: number | null; by: string; created_at: string; photo: string | null
}
const KIND_TH: Record<Kind, string> = { activity: 'กิจกรรม', harvest: 'ตัด', planting: 'ปลูก', cost: 'ค่าใช้จ่าย' }
const TABLE: Record<Kind, string> = { activity: 'activities', harvest: 'harvests', planting: 'plantings', cost: 'costs' }

const monthAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10) }

export default function History() {
  const { plots, activityTypes, fertilizers, categories, people } = useMaster()
  const { session } = useAuth()
  const { isAdmin, canWrite } = useRole()
  const [from, setFrom] = useState(monthAgo())
  const [to, setTo] = useState(today())
  const [plotId, setPlotId] = useState('')
  const [kind, setKind] = useState<'' | Kind>('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, h, p, c] = await Promise.all([
      supabase.from('activities').select('*').gte('activity_date', from).lte('activity_date', to),
      supabase.from('harvests').select('*, plantings!inner(plot_id)').gte('cut_date', from).lte('cut_date', to),
      supabase.from('plantings').select('*').gte('plant_date', from).lte('plant_date', to),
      supabase.from('costs').select('*').gte('cost_date', from).lte('cost_date', to),
    ])
    const ft = (id: number | null) => fertilizers.find(f => f.id === id)
    const out: Row[] = [
      ...((a.data ?? []) as Activity[]).map(r => ({
        kind: 'activity' as const, id: r.id, date: r.activity_date, plot_id: r.plot_id,
        what: activityTypes.find(t => t.id === r.activity_type_id)?.name ?? '',
        detail: [r.fertilizer_id && `${ft(r.fertilizer_id)?.name} ${num(r.fertilizer_qty, 2)} ${ft(r.fertilizer_id)?.unit}`, r.workers && `แรงงาน ${r.workers} คน`, r.notes].filter(Boolean).join(' · '),
        amount: null, kg: null, by: r.created_by, created_at: r.created_at, photo: r.photo_path,
      })),
      ...((h.data ?? []) as (Harvest & { plantings: { plot_id: number } })[]).map(r => ({
        kind: 'harvest' as const, id: r.id, date: r.cut_date, plot_id: r.plantings.plot_id, what: `ตัดครั้งที่ ${r.cut_no}`,
        detail: [r.height_cm && `สูง ${num(r.height_cm)} ซม.`, r.destination && DEST_TH[r.destination], r.revenue_baht && `รายได้ ${baht(r.revenue_baht)}`, r.notes].filter(Boolean).join(' · '),
        amount: null, kg: Number(r.fresh_weight_kg), by: r.created_by, created_at: r.created_at, photo: null,
      })),
      ...((p.data ?? []) as Planting[]).map(r => ({
        kind: 'planting' as const, id: r.id, date: r.plant_date, plot_id: r.plot_id, what: `ปลูก ${r.variety ?? ''}`,
        detail: [r.method, r.spacing_cm && `ระยะ ${r.spacing_cm}`, r.cuttings_qty && `${num(r.cuttings_qty)} ท่อน`, r.notes].filter(Boolean).join(' · '),
        amount: null, kg: null, by: r.created_by, created_at: r.created_at, photo: null,
      })),
      ...((c.data ?? []) as Cost[]).map(r => ({
        kind: 'cost' as const, id: r.id, date: r.cost_date, plot_id: r.plot_id, what: categories.find(x => x.id === r.category_id)?.name ?? '',
        detail: r.notes ?? '', amount: Number(r.amount_baht), kg: null, by: r.created_by, created_at: r.created_at, photo: null,
      })),
    ].sort((x, y) => y.date.localeCompare(x.date) || y.created_at.localeCompare(x.created_at))
    setRows(out)
    setLoading(false)
  }, [from, to, activityTypes, fertilizers, categories])

  useEffect(() => { load() }, [load])

  const shown = rows.filter(r => (!plotId || String(r.plot_id) === plotId) && (!kind || r.kind === kind))
  const code = (id: number) => plots.find(p => p.id === id)?.code ?? ''
  const canDelete = (r: Row) => isAdmin || (canWrite && r.by === session?.user.id && Date.now() - Date.parse(r.created_at) < 7 * 864e5)

  const remove = async (r: Row) => {
    if (!confirm(`ลบรายการ ${KIND_TH[r.kind]} ${r.what} วันที่ ${thDate(r.date)}?`)) return
    const { error } = await supabase.from(TABLE[r.kind]).delete().eq('id', r.id)
    if (error) alert(errText(error)); else load()
  }

  const openPhoto = async (path: string) => {
    const { data, error } = await supabase.storage.from('photos').createSignedUrl(path, 300)
    if (error) alert(errText(error)); else window.open(data.signedUrl, '_blank')
  }

  const exportCsv = () => downloadCsv(`napier-history-${from}-${to}.csv`, shown.map(r => ({
    วันที่: r.date, แปลง: code(r.plot_id), ประเภท: KIND_TH[r.kind], รายการ: r.what, รายละเอียด: r.detail,
    'น้ำหนัก (กก.)': r.kg ?? '', 'จำนวนเงิน (บาท)': r.amount ?? '', ผู้บันทึก: people[r.by] ?? '',
  })))

  return (
    <div className="stack">
      <div className="title-row"><h1>ประวัติบันทึก</h1><button className="btn secondary small" onClick={exportCsv} disabled={!shown.length}>ส่งออก Excel (CSV)</button></div>
      <div className="card filters">
        <label>ตั้งแต่<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>ถึง<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <label>แปลง<select value={plotId} onChange={e => setPlotId(e.target.value)}><option value="">ทั้งหมด</option>{plots.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select></label>
        <label>ประเภท<select value={kind} onChange={e => setKind(e.target.value as Kind | '')}><option value="">ทั้งหมด</option>{Object.entries(KIND_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      {loading ? <p className="muted">กำลังโหลด…</p> : shown.length === 0 ? <p className="muted">ไม่มีรายการในช่วงนี้</p> : <>
        <ul className="card list mobile-only">
          {shown.map(r => (
            <li key={r.kind + r.id} className="hist-item">
              <div className="hist-top"><span className="muted">{thDate(r.date)}</span> <b>{code(r.plot_id)}</b> <span className={`tag ${r.kind}`}>{KIND_TH[r.kind]}</span> {r.what}
                {r.kg !== null && <b className="r">{num(r.kg)} กก.</b>}{r.amount !== null && <b className="r">{baht(r.amount)}</b>}</div>
              {r.detail && <div>{r.detail}</div>}
              <div className="muted small">{people[r.by] ?? ''}
                {r.photo && <> · <button className="link" onClick={() => openPhoto(r.photo!)}>📷 รูป</button></>}
                {canDelete(r) && <> · <button className="link danger" onClick={() => remove(r)}>ลบ</button></>}</div>
            </li>
          ))}
        </ul>
        <div className="table-wrap card desktop-only">
          <table>
            <thead><tr><th>วันที่</th><th>แปลง</th><th>รายการ</th><th>รายละเอียด</th><th className="r">กก.</th><th className="r">บาท</th><th>ผู้บันทึก</th><th></th></tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.kind + r.id}>
                  <td className="nowrap">{thDate(r.date)}</td>
                  <td><b>{code(r.plot_id)}</b></td>
                  <td><span className={`tag ${r.kind}`}>{KIND_TH[r.kind]}</span> {r.what}</td>
                  <td>{r.detail}{r.photo && <> <button className="link" onClick={() => openPhoto(r.photo!)}>📷 รูป</button></>}</td>
                  <td className="r">{r.kg !== null ? num(r.kg) : ''}</td>
                  <td className="r">{r.amount !== null ? num(r.amount, 2) : ''}</td>
                  <td className="muted small">{people[r.by] ?? ''}</td>
                  <td>{canDelete(r) && <button className="link danger" onClick={() => remove(r)}>ลบ</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  )
}
