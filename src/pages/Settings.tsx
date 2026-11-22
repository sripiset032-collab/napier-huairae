import { useCallback, useEffect, useState } from 'react'
import { useMaster } from '../lib/master'
import { useAuth, useRole } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Profile, Role } from '../lib/types'
import { ROLE_TH, STATUS_TH, errText } from '../lib/util'

type FieldType = 'text' | 'number' | 'bool' | 'select'
interface Field { key: string; label: string; type: FieldType; options?: [string, string][]; required?: boolean }
type Rec = Record<string, unknown> & { id?: number }

function CrudTable({ title, table, fields, rows, onChange, hint }: {
  title: string; table: string; fields: Field[]; rows: Rec[]; onChange: () => void; hint?: string
}) {
  const blank = () => Object.fromEntries(fields.map(f => [f.key, f.type === 'bool' ? true : f.type === 'select' ? f.options?.[0]?.[0] ?? '' : '']))
  const [draft, setDraft] = useState<Rec>(blank)
  const [editing, setEditing] = useState<Rec | null>(null)
  const [err, setErr] = useState('')

  const clean = (r: Rec) => Object.fromEntries(fields.map(f => {
    const v = r[f.key]
    if (f.type === 'number') return [f.key, v === '' || v === null || v === undefined ? null : Number(v)]
    if (f.type === 'select' && /_id$/.test(f.key)) return [f.key, Number(v)]
    if (f.type === 'text') return [f.key, v === '' ? null : v]
    return [f.key, v]
  }))

  const add = async () => {
    setErr('')
    const row = Object.fromEntries(Object.entries(clean(draft)).filter(([, v]) => v !== null))
    const { error } = await supabase.from(table).insert(row)
    if (error) setErr(errText(error)); else { setDraft(blank()); onChange() }
  }
  const save = async () => {
    if (!editing) return
    setErr('')
    const { error } = await supabase.from(table).update(clean(editing)).eq('id', editing.id!)
    if (error) setErr(errText(error)); else { setEditing(null); onChange() }
  }

  const input = (f: Field, r: Rec, set: (r: Rec) => void) => {
    const v = r[f.key]
    if (f.type === 'bool') return <input type="checkbox" checked={Boolean(v)} onChange={e => set({ ...r, [f.key]: e.target.checked })} />
    if (f.type === 'select') return <select value={String(v ?? '')} onChange={e => set({ ...r, [f.key]: e.target.value })}>{f.options?.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    return <input type={f.type === 'number' ? 'number' : 'text'} step="any" value={String(v ?? '')} placeholder={f.label} onChange={e => set({ ...r, [f.key]: e.target.value })} />
  }
  const show = (f: Field, r: Rec) => {
    const v = r[f.key]
    if (f.type === 'bool') return v ? '✓' : ''
    if (f.type === 'select') return f.options?.find(([k]) => k === String(v))?.[1] ?? String(v ?? '')
    return v === null || v === undefined ? '' : String(v)
  }

  return (
    <section className="card">
      <h2>{title}</h2>
      {hint && <p className="muted small">{hint}</p>}
      <div className="table-wrap">
        <table className="crud">
          <thead><tr>{fields.map(f => <th key={f.key}>{f.label}</th>)}<th></th></tr></thead>
          <tbody>
            {rows.map(r => editing?.id === r.id ? (
              <tr key={r.id}>{fields.map(f => <td key={f.key}>{input(f, editing!, setEditing)}</td>)}
                <td className="nowrap"><button className="btn small" onClick={save}>บันทึก</button> <button className="link" onClick={() => setEditing(null)}>ยกเลิก</button></td></tr>
            ) : (
              <tr key={r.id}>{fields.map(f => <td key={f.key}>{show(f, r)}</td>)}<td><button className="link" onClick={() => setEditing({ ...r })}>แก้ไข</button></td></tr>
            ))}
            <tr className="new-row">{fields.map(f => <td key={f.key}>{input(f, draft, setDraft)}</td>)}<td><button className="btn small" onClick={add}>+ เพิ่ม</button></td></tr>
          </tbody>
        </table>
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  )
}

function Users() {
  const { session } = useAuth()
  const [people, setPeople] = useState<Profile[]>([])
  const [invites, setInvites] = useState<{ email: string; role: Role }[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [p, i] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('invitations').select('email, role').order('created_at'),
    ])
    setPeople((p.data ?? []) as Profile[]); setInvites((i.data ?? []) as { email: string; role: Role }[])
  }, [])
  useEffect(() => { load() }, [load])

  const setUserRole = async (id: string, r: Role) => {
    const { error } = await supabase.from('profiles').update({ role: r }).eq('id', id)
    if (error) setErr(errText(error)); else load()
  }
  const invite = async () => {
    setErr('')
    const e = email.trim().toLowerCase()
    if (!e) return
    const { error } = await supabase.from('invitations').upsert({ email: e, role, invited_by: session?.user.id })
    if (error) { setErr(errText(error)); return }
    // If they already signed up, apply the role now
    const existing = people.find(p => p.email?.toLowerCase() === e)
    if (existing) await supabase.from('profiles').update({ role }).eq('id', existing.id)
    setEmail(''); load()
  }
  const uninvite = async (e: string) => { await supabase.from('invitations').delete().eq('email', e); load() }

  const roles: Role[] = ['admin', 'staff', 'viewer', 'pending']
  return (
    <section className="card">
      <h2>ผู้ใช้</h2>
      <p className="muted small">เชิญด้วยอีเมล แล้วส่งลิงก์เว็บให้เขากด “สมัครใช้งาน” ด้วยอีเมลนั้น ระบบจะให้สิทธิ์ตามที่เชิญไว้ ตั้งเป็น “รออนุมัติ” เพื่อปิดสิทธิ์</p>
      <div className="inline-form">
        <input type="email" placeholder="อีเมลผู้ใช้ใหม่" value={email} onChange={e => setEmail(e.target.value)} />
        <select value={role} onChange={e => setRole(e.target.value as Role)}>{roles.slice(0, 3).map(r => <option key={r} value={r}>{ROLE_TH[r]}</option>)}</select>
        <button className="btn small" onClick={invite}>เชิญ</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th></tr></thead>
          <tbody>
            {people.map(p => (
              <tr key={p.id}><td>{p.full_name}</td><td>{p.email}</td>
                <td>{p.id === session?.user.id ? ROLE_TH[p.role] + ' (คุณ)' : (
                  <select value={p.role} onChange={e => setUserRole(p.id, e.target.value as Role)}>{roles.map(r => <option key={r} value={r}>{ROLE_TH[r]}</option>)}</select>
                )}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {invites.filter(i => !people.some(p => p.email?.toLowerCase() === i.email)).length > 0 && <>
        <h3>เชิญแล้ว ยังไม่สมัคร</h3>
        <ul className="list">
          {invites.filter(i => !people.some(p => p.email?.toLowerCase() === i.email)).map(i => (
            <li key={i.email}>{i.email} <span className="badge">{ROLE_TH[i.role]}</span><button className="link danger" onClick={() => uninvite(i.email)}>ยกเลิก</button></li>
          ))}
        </ul>
      </>}
      {err && <p className="error">{err}</p>}
    </section>
  )
}

export default function Settings() {
  const m = useMaster()
  const { profile } = useAuth()
  const { isAdmin } = useRole()

  if (!isAdmin) return (
    <div className="stack">
      <h1>ตั้งค่า</h1>
      <section className="card"><p>{profile?.full_name} · {profile?.email}</p><p>บทบาท: <b>{ROLE_TH[profile?.role ?? 'pending']}</b></p>
        <p className="muted small">การเพิ่มแปลง ชนิดปุ๋ย และผู้ใช้ ทำได้เฉพาะ Admin</p></section>
    </div>
  )

  const siteOpts: [string, string][] = m.sites.map(s => [String(s.id), s.name])
  return (
    <div className="stack">
      <h1>ตั้งค่า (Admin)</h1>
      <CrudTable title="แปลง" table="plots" rows={m.plots as unknown as Rec[]} onChange={m.reload}
        hint="สถานะเปลี่ยนเป็น “กำลังปลูก” อัตโนมัติเมื่อบันทึกการปลูก"
        fields={[
          { key: 'code', label: 'รหัส', type: 'text', required: true }, { key: 'name', label: 'ชื่อ', type: 'text' },
          { key: 'site_id', label: 'พื้นที่', type: 'select', options: siteOpts }, { key: 'area_rai', label: 'ไร่', type: 'number' },
          { key: 'variety', label: 'พันธุ์', type: 'text' }, { key: 'latitude', label: 'ละติจูด', type: 'number' }, { key: 'longitude', label: 'ลองจิจูด', type: 'number' },
          { key: 'status', label: 'สถานะ', type: 'select', options: Object.entries(STATUS_TH) },
        ]} />
      <CrudTable title="ชนิดปุ๋ย" table="fertilizers" rows={m.fertilizers as unknown as Rec[]} onChange={m.reload}
        hint="ใส่ราคาต่อหน่วย แล้วระบบจะคำนวณค่าปุ๋ยให้ตอนบันทึก"
        fields={[
          { key: 'name', label: 'ชื่อ', type: 'text' }, { key: 'formula', label: 'สูตร', type: 'text' }, { key: 'unit', label: 'หน่วย', type: 'text' },
          { key: 'price_per_unit', label: 'ราคา/หน่วย (บาท)', type: 'number' }, { key: 'active', label: 'ใช้งาน', type: 'bool' },
        ]} />
      <CrudTable title="ชนิดกิจกรรม" table="activity_types" rows={m.activityTypes as unknown as Rec[]} onChange={m.reload}
        fields={[{ key: 'name', label: 'ชื่อ', type: 'text' }, { key: 'uses_fertilizer', label: 'ใช้ปุ๋ย', type: 'bool' }, { key: 'sort_order', label: 'ลำดับ', type: 'number' }]} />
      <CrudTable title="หมวดค่าใช้จ่าย" table="cost_categories" rows={m.categories as unknown as Rec[]} onChange={m.reload}
        fields={[{ key: 'name', label: 'ชื่อ', type: 'text' }, { key: 'sort_order', label: 'ลำดับ', type: 'number' }]} />
      <CrudTable title="พื้นที่" table="sites" rows={m.sites as unknown as Rec[]} onChange={m.reload}
        fields={[{ key: 'name', label: 'ชื่อ', type: 'text' }]} />
      <Users />
    </div>
  )
}
