import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMaster } from '../lib/master'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Planting } from '../lib/types'
import { errText, today } from '../lib/util'

type Kind = 'activity' | 'harvest' | 'planting' | 'cost'
const KINDS: [Kind, string][] = [['activity', '🛠 กิจกรรม'], ['harvest', '✂️ ตัด'], ['planting', '🌱 ปลูก'], ['cost', '💸 ค่าใช้จ่าย']]

const n = (v: string) => (v === '' ? null : Number(v))

export default function RecordPage() {
  const [params, setParams] = useSearchParams()
  const kind = (params.get('type') as Kind) || 'activity'
  const { plots, activityTypes, fertilizers, categories } = useMaster()
  const { session } = useAuth()
  const nav = useNavigate()

  const [plotId, setPlotId] = useState(params.get('plot') ?? '')
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [planting, setPlanting] = useState<Planting | null | undefined>(undefined)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // activity
  const [typeId, setTypeId] = useState('')
  const [fertId, setFertId] = useState('')
  const [fertQty, setFertQty] = useState('')
  const [workers, setWorkers] = useState('')
  const [actCost, setActCost] = useState('')
  const [actCostCat, setActCostCat] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  // harvest
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [harvestArea, setHarvestArea] = useState('')
  const [dest, setDest] = useState('feed')
  const [revenue, setRevenue] = useState('')
  // planting
  const [variety, setVariety] = useState('')
  const [method, setMethod] = useState('ท่อนพันธุ์')
  const [spacing, setSpacing] = useState('')
  const [cuttings, setCuttings] = useState('')
  // cost
  const [catId, setCatId] = useState('')
  const [amount, setAmount] = useState('')

  const plot = plots.find(p => String(p.id) === plotId)
  const aType = activityTypes.find(t => String(t.id) === typeId)
  const fert = fertilizers.find(f => String(f.id) === fertId)
  const fertCat = categories.find(c => c.name === 'ปุ๋ย')

  useEffect(() => {
    if (!plotId) { setPlanting(undefined); return }
    supabase.from('plantings').select('*').eq('plot_id', Number(plotId)).is('end_date', null)
      .order('plant_date', { ascending: false }).limit(1).then(({ data }) => setPlanting((data?.[0] as Planting) ?? null))
  }, [plotId])

  useEffect(() => { if (plot && !variety) setVariety(plot.variety ?? '') }, [plot, variety])

  // Suggest fertilizer cost from price × qty
  const suggested = useMemo(() => (fert?.price_per_unit && fertQty ? (Number(fert.price_per_unit) * Number(fertQty)).toFixed(2) : ''), [fert, fertQty])
  useEffect(() => { if (suggested) { setActCost(suggested); if (fertCat) setActCostCat(String(fertCat.id)) } }, [suggested, fertCat])

  const setKind = (k: Kind) => { const p = new URLSearchParams(params); p.set('type', k); setParams(p, { replace: true }); setMsg(null) }

  const resetFields = () => {
    setNotes(''); setFertId(''); setFertQty(''); setWorkers(''); setActCost(''); setPhoto(null)
    setWeight(''); setHeight(''); setHarvestArea(''); setRevenue(''); setCuttings(''); setAmount('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!plot) return
    setBusy(true); setMsg(null)
    try {
      if (kind === 'activity') {
        let photo_path: string | null = null
        if (photo) {
          const ext = photo.name.split('.').pop() || 'jpg'
          photo_path = `${plot.id}/${Date.now()}-${session?.user.id.slice(0, 8)}.${ext}`
          const up = await supabase.storage.from('photos').upload(photo_path, photo)
          if (up.error) throw up.error
        }
        const { data, error } = await supabase.from('activities').insert({
          plot_id: plot.id, planting_id: planting?.id ?? null, activity_date: date, activity_type_id: Number(typeId),
          fertilizer_id: aType?.uses_fertilizer && fertId ? Number(fertId) : null,
          fertilizer_qty: aType?.uses_fertilizer ? n(fertQty) : null, workers: n(workers), notes: notes || null, photo_path,
        }).select('id').single()
        if (error) throw error
        if (actCost && Number(actCost) > 0) {
          const cat = actCostCat || String(categories.find(c => c.name === 'ค่าแรง')?.id ?? categories[0]?.id)
          const c = await supabase.from('costs').insert({
            plot_id: plot.id, activity_id: data.id, cost_date: date, category_id: Number(cat), amount_baht: Number(actCost),
            notes: aType?.name ?? null,
          })
          if (c.error) throw c.error
        }
      } else if (kind === 'harvest') {
        if (!planting) throw new Error('แปลงนี้ยังไม่มีรอบปลูก ให้บันทึก "ปลูก" ก่อน')
        const { error } = await supabase.from('harvests').insert({
          planting_id: planting.id, cut_date: date, fresh_weight_kg: Number(weight), height_cm: n(height),
          area_rai: n(harvestArea), destination: dest, revenue_baht: n(revenue), notes: notes || null,
        })
        if (error) throw error
      } else if (kind === 'planting') {
        if (planting && !confirm('แปลงนี้มีรอบปลูกที่ยังไม่ปิด ต้องการปิดรอบเดิมแล้วเริ่มรอบใหม่หรือไม่?')) { setBusy(false); return }
        if (planting) {
          const u = await supabase.from('plantings').update({ end_date: date }).eq('id', planting.id)
          if (u.error) throw u.error
        }
        const { error } = await supabase.from('plantings').insert({
          plot_id: plot.id, plant_date: date, variety: variety || null, method: method || null,
          spacing_cm: spacing || null, cuttings_qty: n(cuttings), notes: notes || null,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.from('costs').insert({
          plot_id: plot.id, cost_date: date, category_id: Number(catId), amount_baht: Number(amount), notes: notes || null,
        })
        if (error) throw error
      }
      setMsg({ ok: true, text: 'บันทึกแล้ว' })
      resetFields()
      if (kind === 'planting') nav(`/plots/${plot.id}`)
    } catch (err) {
      setMsg({ ok: false, text: errText(err) })
    } finally { setBusy(false) }
  }

  return (
    <div className="stack">
      <h1>บันทึก</h1>
      <div className="seg">
        {KINDS.map(([k, label]) => <button key={k} type="button" className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{label}</button>)}
      </div>
      <form className="card form" onSubmit={submit}>
        <label>แปลง
          <select value={plotId} onChange={e => setPlotId(e.target.value)} required>
            <option value="">-- เลือกแปลง --</option>
            {plots.map(p => <option key={p.id} value={p.id}>{p.code} {p.name ?? ''}</option>)}
          </select>
        </label>
        {plot && kind === 'harvest' && planting === null && <p className="error">แปลงนี้ยังไม่มีรอบปลูก ให้บันทึก “ปลูก” ก่อน</p>}
        <label>วันที่<input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} required /></label>

        {kind === 'activity' && <>
          <label>ชนิดกิจกรรม
            <select value={typeId} onChange={e => setTypeId(e.target.value)} required>
              <option value="">-- เลือก --</option>
              {activityTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {aType?.uses_fertilizer && <div className="grid2">
            <label>ชนิดปุ๋ย
              <select value={fertId} onChange={e => setFertId(e.target.value)} required>
                <option value="">-- เลือก --</option>
                {fertilizers.filter(f => f.active).map(f => <option key={f.id} value={f.id}>{f.name}{f.formula ? ` (${f.formula})` : ''}</option>)}
              </select>
            </label>
            <label>ปริมาณ ({fert?.unit ?? 'กก.'})<input type="number" inputMode="decimal" step="any" min="0" value={fertQty} onChange={e => setFertQty(e.target.value)} required /></label>
          </div>}
          <label>จำนวนแรงงาน (คน)<input type="number" inputMode="numeric" min="0" value={workers} onChange={e => setWorkers(e.target.value)} /></label>
          <div className="grid2">
            <label>ค่าใช้จ่าย (บาท){suggested && <small className="muted"> คำนวณจากราคาปุ๋ย</small>}
              <input type="number" inputMode="decimal" step="any" min="0" value={actCost} onChange={e => setActCost(e.target.value)} placeholder="ไม่ระบุก็ได้" />
            </label>
            <label>หมวดค่าใช้จ่าย
              <select value={actCostCat} onChange={e => setActCostCat(e.target.value)}>
                <option value="">ค่าแรง (ค่าเริ่มต้น)</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <label>รูปถ่าย<input type="file" accept="image/*" capture="environment" onChange={e => setPhoto(e.target.files?.[0] ?? null)} /></label>
        </>}

        {kind === 'harvest' && <>
          <div className="grid2">
            <label>น้ำหนักสด (กก.)<input type="number" inputMode="decimal" step="any" min="0" value={weight} onChange={e => setWeight(e.target.value)} required /></label>
            <label>ความสูงต้น (ซม.)<input type="number" inputMode="decimal" step="any" min="0" value={height} onChange={e => setHeight(e.target.value)} /></label>
          </div>
          <label>พื้นที่ที่ตัด (ไร่)<input type="number" inputMode="decimal" step="any" min="0" value={harvestArea} onChange={e => setHarvestArea(e.target.value)} placeholder={plot ? `ทั้งแปลง ${plot.area_rai} ไร่` : ''} /></label>
          <div className="grid2">
            <label>นำไปใช้
              <select value={dest} onChange={e => setDest(e.target.value)}>
                <option value="feed">เลี้ยงสัตว์</option><option value="sale">ขาย</option><option value="silage">หมัก</option><option value="other">อื่นๆ</option>
              </select>
            </label>
            <label>รายได้ (บาท)<input type="number" inputMode="decimal" step="any" min="0" value={revenue} onChange={e => setRevenue(e.target.value)} /></label>
          </div>
        </>}

        {kind === 'planting' && <>
          <label>สายพันธุ์<input value={variety} onChange={e => setVariety(e.target.value)} placeholder="เช่น ปากช่อง 1" /></label>
          <div className="grid2">
            <label>วิธีปลูก<input value={method} onChange={e => setMethod(e.target.value)} /></label>
            <label>ระยะปลูก<input value={spacing} onChange={e => setSpacing(e.target.value)} placeholder="เช่น 80×100 ซม." /></label>
          </div>
          <label>จำนวนท่อนพันธุ์<input type="number" inputMode="numeric" min="0" value={cuttings} onChange={e => setCuttings(e.target.value)} /></label>
        </>}

        {kind === 'cost' && <div className="grid2">
          <label>หมวด
            <select value={catId} onChange={e => setCatId(e.target.value)} required>
              <option value="">-- เลือก --</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>จำนวนเงิน (บาท)<input type="number" inputMode="decimal" step="any" min="0" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
        </div>}

        <label>หมายเหตุ<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
        <button className="btn big" disabled={busy || (kind === 'harvest' && planting === null)}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </form>
    </div>
  )
}
