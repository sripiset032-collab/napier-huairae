import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMaster } from '../lib/master'
import { supabase } from '../lib/supabase'
import type { PlotSummary } from '../lib/types'
import { CUT_DUE_DAYS, STATUS_TH, num, thDate } from '../lib/util'

export default function Plots() {
  const { plots } = useMaster()
  const [sum, setSum] = useState<Record<number, PlotSummary>>({})
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from('plot_summary').select('*').then(({ data }) => {
      const m: Record<number, PlotSummary> = {}
      for (const s of (data ?? []) as PlotSummary[]) m[s.plot_id] = s
      setSum(m)
    })
  }, [plots])

  const shown = plots.filter(p => !q || `${p.code} ${p.name ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="stack">
      <h1>แปลง</h1>
      <input placeholder="ค้นหารหัสหรือชื่อแปลง" value={q} onChange={e => setQ(e.target.value)} />
      {plots.length === 0 && <p className="muted">ยังไม่มีแปลง ให้ Admin เพิ่มที่หน้า ตั้งค่า</p>}
      <div className="cards">
        {shown.map(p => {
          const s = sum[p.id]
          const due = s?.planting_id && (s.days_since_cut ?? 0) >= CUT_DUE_DAYS
          return (
            <Link key={p.id} to={`/plots/${p.id}`} className="card plot-card">
              <div className="plot-head"><b>{p.code}</b> {p.name}<span className={`pill ${p.status}`}>{STATUS_TH[p.status]}</span></div>
              <div className="muted">{num(p.area_rai, 2)} ไร่ · {p.variety || 'ไม่ระบุพันธุ์'}</div>
              {s?.planting_id ? (
                <div className="plot-meta">
                  <span>ปลูก {thDate(s.plant_date)}</span>
                  <span>ตัดแล้ว {s.cuts} ครั้ง</span>
                  <span className={due ? 'pill warn' : ''}>{s.days_since_cut} วันจากตัด/ปลูก</span>
                </div>
              ) : <div className="muted">ไม่มีรอบปลูกที่ดำเนินอยู่</div>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
