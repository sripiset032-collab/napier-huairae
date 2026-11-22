import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMaster } from '../lib/master'
import { useRole } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { PlotSummary } from '../lib/types'
import { CUT_DUE_DAYS, STATUS_TH, num, thDate, today } from '../lib/util'

interface Recent { kind: string; date: string; plot_id: number; text: string }

export default function Dashboard() {
  const { plots, activityTypes, fertilizers } = useMaster()
  const { canWrite } = useRole()
  const [sum, setSum] = useState<PlotSummary[]>([])
  const [month, setMonth] = useState({ kg: 0, cost: 0 })
  const [recent, setRecent] = useState<Recent[]>([])

  useEffect(() => {
    const first = today().slice(0, 8) + '01'
    Promise.all([
      supabase.from('plot_summary').select('*').order('code'),
      supabase.from('harvests').select('fresh_weight_kg').gte('cut_date', first),
      supabase.from('costs').select('amount_baht').gte('cost_date', first),
      supabase.from('activities').select('*').order('activity_date', { ascending: false }).order('id', { ascending: false }).limit(6),
    ]).then(([s, h, c, a]) => {
      setSum((s.data ?? []) as PlotSummary[])
      setMonth({
        kg: (h.data ?? []).reduce((t, r) => t + Number(r.fresh_weight_kg), 0),
        cost: (c.data ?? []).reduce((t, r) => t + Number(r.amount_baht), 0),
      })
      setRecent((a.data ?? []).map(r => ({
        kind: 'activity', date: r.activity_date, plot_id: r.plot_id,
        text: (activityTypes.find(t => t.id === r.activity_type_id)?.name ?? 'กิจกรรม') +
          (r.fertilizer_id ? ` · ${fertilizers.find(f => f.id === r.fertilizer_id)?.name ?? ''} ${num(r.fertilizer_qty)}` : ''),
      })))
    })
  }, [activityTypes, fertilizers])

  const due = sum.filter(s => s.planting_id && (s.days_since_cut ?? 0) >= CUT_DUE_DAYS)
  const byStatus = (st: string) => plots.filter(p => p.status === st).length
  const totalRai = plots.reduce((t, p) => t + Number(p.area_rai), 0)
  const code = (id: number) => plots.find(p => p.id === id)?.code ?? ''

  return (
    <div className="stack">
      <h1>ภาพรวม</h1>
      <div className="tiles">
        <div className="tile"><div className="tile-n">{plots.length}</div><div>แปลงทั้งหมด · {num(totalRai, 1)} ไร่</div></div>
        <div className="tile"><div className="tile-n">{byStatus('active')}</div><div>{STATUS_TH.active}</div></div>
        <div className="tile"><div className="tile-n">{num(month.kg)}</div><div>ผลผลิตเดือนนี้ (กก.)</div></div>
        <div className="tile"><div className="tile-n">{num(month.cost)}</div><div>ค่าใช้จ่ายเดือนนี้ (บาท)</div></div>
      </div>

      <section className="card">
        <h2>ถึงรอบตัด (≥ {CUT_DUE_DAYS} วัน)</h2>
        {due.length === 0 ? <p className="muted">ยังไม่มีแปลงที่ถึงรอบตัด</p> : (
          <ul className="list">
            {due.map(d => (
              <li key={d.plot_id}>
                <Link to={`/plots/${d.plot_id}`}><b>{d.code}</b> {d.name}</Link>
                <span className="pill warn">{d.days_since_cut} วัน</span>
                {canWrite && <Link className="btn small" to={`/record?type=harvest&plot=${d.plot_id}`}>บันทึกตัด</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>สรุปรายแปลง</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>แปลง</th><th>จากตัด/ปลูก</th><th className="r">กก./ไร่</th><th className="r">ต้นทุน (฿)</th></tr></thead>
            <tbody>
              {sum.map(s => (
                <tr key={s.plot_id}>
                  <td className="nowrap"><Link to={`/plots/${s.plot_id}`}><b>{s.code}</b></Link></td>
                  <td>{s.planting_id ? `${s.days_since_cut ?? '-'} วัน` : <span className="muted">{STATUS_TH[s.status]}</span>}</td>
                  <td className="r">{num(s.kg_per_rai)}</td>
                  <td className="r">{num(s.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>กิจกรรมล่าสุด</h2>
        {recent.length === 0 ? <p className="muted">ยังไม่มีบันทึก</p> : (
          <ul className="list">
            {recent.map((r, i) => <li key={i}><span className="muted">{thDate(r.date)}</span> <b>{code(r.plot_id)}</b> {r.text}</li>)}
          </ul>
        )}
      </section>
    </div>
  )
}
