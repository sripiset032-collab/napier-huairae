import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errText } from '../lib/util'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: location.origin } })
        if (error) throw error
        if (!data.session) setMsg({ ok: true, text: 'สมัครแล้ว กรุณาเปิดอีเมลเพื่อยืนยัน แล้วกลับมาเข้าสู่ระบบ' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin })
        if (error) throw error
        setMsg({ ok: true, text: 'ส่งลิงก์ไปที่อีเมลแล้ว' })
      }
    } catch (err) {
      const t = errText(err)
      setMsg({ ok: false, text: /invalid login/i.test(t) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : t })
    } finally { setBusy(false) }
  }

  return (
    <div className="center-page">
      <form className="card narrow" onSubmit={submit}>
        <div className="login-brand"><img src="/favicon.svg" alt="" /><div><h1>บันทึกแปลงเนเปียร์</h1><p className="muted">แปลงห้วยแร่</p></div></div>
        <h2>{mode === 'in' ? 'เข้าสู่ระบบ' : mode === 'up' ? 'สมัครใช้งาน' : 'ลืมรหัสผ่าน'}</h2>
        {mode === 'up' && (
          <label>ชื่อ-นามสกุล<input value={name} onChange={e => setName(e.target.value)} required /></label>
        )}
        <label>อีเมล<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
        {mode !== 'reset' && (
          <label>รหัสผ่าน<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
        )}
        {msg && <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
        <button className="btn" disabled={busy}>{busy ? 'กำลังดำเนินการ…' : mode === 'in' ? 'เข้าสู่ระบบ' : mode === 'up' ? 'สมัคร' : 'ส่งลิงก์'}</button>
        <div className="row-links">
          {mode !== 'in' && <button type="button" className="link" onClick={() => setMode('in')}>มีบัญชีแล้ว เข้าสู่ระบบ</button>}
          {mode !== 'up' && <button type="button" className="link" onClick={() => setMode('up')}>สมัครใช้งาน (ต้องได้รับเชิญจาก Admin)</button>}
          {mode === 'in' && <button type="button" className="link" onClick={() => setMode('reset')}>ลืมรหัสผ่าน</button>}
        </div>
      </form>
    </div>
  )
}
