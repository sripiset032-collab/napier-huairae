import { useEffect, useMemo, useState } from 'react'
import { useMaster } from '../lib/master'
import { supabase } from '../lib/supabase'
import type { PlotSummary } from '../lib/types'
import { baht, downloadCsv, num } from '../lib/util'

interface MonthRow { month: string; kg: number; cost: number; byCat: Record<number, number> }

export default function Reports() {
  const { categories } = useMaster()
  const [sum, setSum] = useState<PlotSummary[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [raw, setRaw] = useState<{ h: { cut_date: string; fresh_weight_kg: number }[]; c: { cost_date: string; amount_baht: number; category_id: number }[] }>({ h: [], c: [] })

  useEffect(() => { supabase.from('plot_summary').select('*').order('code').then(({ data }) => setSum((data ?? []) as PlotSummary[])) }, [])
  useEffect(() => {
    const a = `${year}-01-01`, b = `${year}-12-31`
    Promise.all([
      supabase.from('harvests').select('cut_date, fresh_weight_kg').gte('cut_date', a).lte('cut_date', b),
      supabase.from('costs').select('cost_date, amount_baht, category_id').gte('cost_date', a).lte('cost_date', b),
    ]).then(([h, c]) => setRaw({ h: h.data ?? [], c: c.data ?? [] }))
  }, [year])

  const months = useMemo(() => {
    const m: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, kg: 0, cost: 0, byCat: {} }))
    for (const h of raw.h) m[Number(h.cut_date.slice(5, 7)) - 1].kg += Number(h.fresh_weight_kg)
    for (const c of raw.c) {
      const r = m[Number(c.cost_date.slice(5, 7)) - 1]
      r.cost += Number(c.amount_baht)
      r.byCat[c.category_id] = (r.byCat[c.category_id] ?? 0) + Number(c.amount_baht)
    }
    return m
  }, [raw, year])

  const totals = sum.reduce((t, s) => ({ rai: t.rai + Number(s.area_rai), kg: t.kg + Number(s.total_kg), cost: t.cost + Number(s.total_cost), rev: t.rev + Number(s.revenue) }), { rai: 0, kg: 0, cost: 0, rev: 0 })
  const monthName = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'short' })

  return (
    <div className="stack">
      <h1>รายงาน</h1>
      <section className="card">
        <div className="title-row"><h2>สรุปรายแปลง (ทั้งหมดที่บันทึก)</h2>
          <button className="btn secondary small" onClick={() => downloadCsv('napier-plot-summary.csv', sum.map(s => ({
            แปลง: s.code, ชื่อ: s.name ?? '', 'พื้นที่ (ไร่)': s.area_rai, 'ตัด (ครั้ง)': s.cuts, 'ผลผลิตรวม (กก.)': s.total_kg,
            'กก./ไร่': s.kg_per_rai, 'ต้นทุนรวม (บาท)': s.total_cost, 'บาท/ไร่': s.cost_per_rai, 'บาท/กก.': s.cost_per_kg ?? '', 'รายได้ (บาท)': s.revenue,
          })))}>ส่งออก CSV</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>แปลง</th><th className="r">ไร่</th><th className="r">ตัด</th><th className="r">ผลผลิต กก.</th><th className="r">กก./ไร่</th><th className="r">ต้นทุน</th><th className="r">บาท/ไร่</th><th className="r">บาท/กก.</th></tr></thead>
            <tbody>
              {sum.map(s => (
                <tr key={s.plot_id}><td><b>{s.code}</b></td><td className="r">{num(s.area_rai, 2)}</td><td className="r">{s.cuts}</td>
                  <td className="r">{num(s.total_kg)}</td><td className="r">{num(s.kg_per_rai)}</td><td className="r">{num(s.total_cost, 2)}</td>
                  <td className="r">{num(s.cost_per_rai, 2)}</td><td className="r">{s.cost_per_kg !== null ? num(s.cost_per_kg, 2) : '-'}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td>รวม</td><td className="r">{num(totals.rai, 2)}</td><td></td><td className="r">{num(totals.kg)}</td><td className="r">{totals.rai ? num(totals.kg / totals.rai) : '-'}</td>
              <td className="r">{num(totals.cost, 2)}</td><td className="r">{totals.rai ? num(totals.cost / totals.rai, 2) : '-'}</td><td className="r">{totals.kg ? num(totals.cost / totals.kg, 2) : '-'}</td></tr></tfoot>
          </table>
        </div>
        <p className="muted small">รายได้รวม {baht(totals.rev)}</p>
      </section>

      <section className="card">
        <div className="title-row"><h2>รายเดือน ปี {year + 543}</h2>
          <div className="actions"><button className="btn secondary small" onClick={() => setYear(year - 1)}>‹</button><button className="btn secondary small" onClick={() => setYear(year + 1)}>›</button>
            <button className="btn secondary small" onClick={() => downloadCsv(`napier-monthly-${year}.csv`, months.map(m => ({
              เดือน: m.month, 'ผลผลิต (กก.)': m.kg, 'ค่าใช้จ่าย (บาท)': m.cost, ...Object.fromEntries(categories.map(c => [c.name, m.byCat[c.id] ?? 0])),
            })))}>ส่งออก CSV</button></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>เดือน</th><th className="r">ผลผลิต กก.</th><th className="r">ค่าใช้จ่าย</th>{categories.map(c => <th key={c.id} className="r">{c.name}</th>)}</tr></thead>
            <tbody>
              {months.map(m => (
                <tr key={m.month}><td>{monthName(m.month)}</td><td className="r">{m.kg ? num(m.kg) : ''}</td><td className="r">{m.cost ? num(m.cost, 2) : ''}</td>
                  {categories.map(c => <td key={c.id} className="r muted">{m.byCat[c.id] ? num(m.byCat[c.id]) : ''}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
