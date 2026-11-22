import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMaster } from '../lib/master'
import { useRole } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Activity, Cost, Harvest, Planting } from '../lib/types'
import { DEST_TH, STATUS_TH, baht, daysBetween, errText, num, thDate, today } from '../lib/util'

export default function PlotDetail() {
  const { id } = useParams()
  const plotId = Number(id)
  const { plots, activityTypes, fertilizers, categories, people } = useMaster()
  const { canWrite } = useRole()
  const plot = plots.find(p => p.id === plotId)
  const [plantings, setPlantings] = useState<Planting[]>([])
  const [harvests, setHarvests] = useState<Harvest[]>([])
  const [acts, setActs] = useState<Activity[]>([])
  const [costs, setCosts] = useState<Cost[]>([])

  const load = useCallback(async () => {
    const pl = await supabase.from('plantings').select('*').eq('plot_id', plotId).order('plant_date', { ascending: false })
    const ps = (pl.data ?? []) as Planting[]
    setPlantings(ps)
    const [h, a, c] = await Promise.all([
      ps.length ? supabase.from('harvests').select('*').in('planting_id', ps.map(p => p.id)).order('cut_date') : Promise.resolve({ data: [] }),
      supabase.from('activities').select('*').eq('plot_id', plotId).order('activity_date', { ascending: false }),
      supabase.from('costs').select('*').eq('plot_id', plotId).order('cost_date', { ascending: false }),
    ])
    setHarvests((h.data ?? []) as Harvest[]); setActs((a.data ?? []) as Activity[]); setCosts((c.data ?? []) as Cost[])
  }, [plotId])

  useEffect(() => { load() }, [load])

  const current = plantings.find(p => !p.end_date)
  const curHarvests = harvests.filter(h => h.planting_id === current?.id)
  const lastCut = curHarvests.at(-1)?.cut_date
  const totalCost = costs.reduce((t, c) => t + Number(c.amount_baht), 0)
  const totalKg = harvests.reduce((t, h) => t + Number(h.fresh_weight_kg), 0)
  const maxKg = Math.max(1, ...harvests.map(h => Number(h.fresh_weight_kg) / Number(h.area_rai || plot?.area_rai || 1)))

  const costByCat = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of costs) m.set(c.category_id, (m.get(c.category_id) ?? 0) + Number(c.amount_baht))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [costs])

  const endPlanting = async () => {
    if (!current || !confirm('ปิดรอบปลูกนี้ (เช่น รื้อแปลงเพื่อปลูกใหม่)?')) return
    const { error } = await supabase.from('plantings').update({ end_date: today() }).eq('id', current.id)
    if (error) alert(errText(error)); else load()
  }

  if (!plot) return <p className="muted">ไม่พบแปลง</p>

  const timeline = [
    ...acts.map(a => ({ d: a.activity_date, k: `a${a.id}`, icon: '🛠', by: a.created_by, text:
      `${activityTypes.find(t => t.id === a.activity_type_id)?.name ?? ''}` +
      (a.fertilizer_id ? ` · ${fertilizers.find(f => f.id === a.fertilizer_id)?.name} ${num(a.fertilizer_qty, 2)} ${fertilizers.find(f => f.id === a.fertilizer_id)?.unit}` : '') +
      (a.workers ? ` · แรงงาน ${a.workers} คน` : '') + (a.notes ? ` · ${a.notes}` : '') })),
    ...harvests.map(h => ({ d: h.cut_date, k: `h${h.id}`, icon: '✂️', by: h.created_by, text:
      `ตัดครั้งที่ ${h.cut_no} · ${num(h.fresh_weight_kg)} กก.` + (h.height_cm ? ` · สูง ${num(h.height_cm)} ซม.` : '') +
      (h.destination ? ` · ${DEST_TH[h.destination]}` : '') })),
    ...plantings.map(p => ({ d: p.plant_date, k: `p${p.id}`, icon: '🌱', by: p.created_by, text:
      `ปลูก ${p.variety ?? ''}` + (p.cuttings_qty ? ` · ${num(p.cuttings_qty)} ท่อน` : '') + (p.spacing_cm ? ` · ระยะ ${p.spacing_cm}` : '') })),
    ...costs.filter(c => !c.activity_id).map(c => ({ d: c.cost_date, k: `c${c.id}`, icon: '💸', by: c.created_by, text:
      `${categories.find(x => x.id === c.category_id)?.name} ${baht(c.amount_baht)}` + (c.notes ? ` · ${c.notes}` : '') })),
  ].sort((a, b) => b.d.localeCompare(a.d))

  return (
    <div className="stack">
      <div className="title-row">
        <h1>{plot.code} {plot.name}</h1>
        <span className={`pill ${plot.status}`}>{STATUS_TH[plot.status]}</span>
      </div>
      <p className="muted">{num(plot.area_rai, 2)} ไร่ · {plot.variety || 'ไม่ระบุพันธุ์'}
        {plot.latitude && plot.longitude && <> · <a href={`https://maps.google.com/?q=${plot.latitude},${plot.longitude}`} target="_blank" rel="noreferrer">แผนที่</a></>}
      </p>

      {canWrite && (
        <div className="actions">
          <Link className="btn" to={`/record?type=activity&plot=${plotId}`}>+ กิจกรรม</Link>
          <Link className="btn" to={`/record?type=harvest&plot=${plotId}`}>+ ตัด</Link>
          <Link className="btn secondary" to={`/record?type=cost&plot=${plotId}`}>+ ค่าใช้จ่าย</Link>
          {!current && <Link className="btn secondary" to={`/record?type=planting&plot=${plotId}`}>+ ปลูกรอบใหม่</Link>}
        </div>
      )}

      <div className="tiles">
        <div className="tile"><div className="tile-n">{current ? daysBetween(current.plant_date) : '-'}</div><div>อายุรอบปลูก (วัน)</div></div>
        <div className="tile"><div className="tile-n">{current ? daysBetween(lastCut ?? current.plant_date) : '-'}</div><div>วันจากตัดล่าสุด</div></div>
        <div className="tile"><div className="tile-n">{num(totalKg / Number(plot.area_rai))}</div><div>ผลผลิตสะสม กก./ไร่</div></div>
        <div className="tile"><div className="tile-n">{totalKg ? num(totalCost / totalKg, 2) : '-'}</div><div>ต้นทุน บาท/กก.</div></div>
      </div>

      {current && (
        <section className="card">
          <h2>รอบปลูกปัจจุบัน</h2>
          <p>ปลูก {thDate(current.plant_date)} · {current.method || 'ท่อนพันธุ์'} {current.spacing_cm && `· ระยะ ${current.spacing_cm}`}</p>
          {canWrite && <button className="link" onClick={endPlanting}>ปิดรอบปลูกนี้</button>}
        </section>
      )}

      <section className="card">
        <h2>ผลผลิตแต่ละครั้งที่ตัด (กก./ไร่)</h2>
        {harvests.length === 0 ? <p className="muted">ยังไม่มีการตัด</p> : (
          <div className="bars">
            {harvests.map(h => {
              const v = Number(h.fresh_weight_kg) / Number(h.area_rai || plot.area_rai)
              return (
                <div key={h.id} className="bar-row">
                  <span className="bar-label">ครั้งที่ {h.cut_no} · {thDate(h.cut_date)}</span>
                  <span className="bar"><span style={{ width: `${(v / maxKg) * 100}%` }} /></span>
                  <span className="bar-val">{num(v)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>ค่าใช้จ่ายรวม {baht(totalCost)}</h2>
        {costByCat.length === 0 ? <p className="muted">ยังไม่มีค่าใช้จ่าย</p> : (
          <ul className="list">{costByCat.map(([cid, v]) => <li key={cid}>{categories.find(c => c.id === cid)?.name}<span className="r">{baht(v)}</span></li>)}</ul>
        )}
      </section>

      <section className="card">
        <h2>ไทม์ไลน์</h2>
        {timeline.length === 0 ? <p className="muted">ยังไม่มีบันทึก</p> : (
          <ul className="timeline">
            {timeline.map(t => (
              <li key={t.k}><span className="tl-date">{thDate(t.d)}</span><span>{t.icon} {t.text}</span><span className="muted small">{people[t.by] ?? ''}</span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
