import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, useRole } from './lib/auth'
import { MasterProvider } from './lib/master'
import { configured, supabase } from './lib/supabase'
import { ROLE_TH } from './lib/util'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Plots from './pages/Plots'
import PlotDetail from './pages/PlotDetail'
import RecordPage from './pages/Record'
import History from './pages/History'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function NotConfigured() {
  return (
    <div className="center-page">
      <div className="card narrow">
        <h1>ยังไม่ได้เชื่อมฐานข้อมูล</h1>
        <p>ตั้งค่า <code>VITE_SUPABASE_URL</code> และ <code>VITE_SUPABASE_ANON_KEY</code> ใน Vercel (หรือไฟล์ <code>.env.local</code>) แล้ว deploy ใหม่</p>
      </div>
    </div>
  )
}

function Pending() {
  const { profile } = useAuth()
  return (
    <div className="center-page">
      <div className="card narrow">
        <h1>รอ Admin อนุมัติ</h1>
        <p>บัญชี <b>{profile?.email}</b> ยังไม่ได้รับสิทธิ์ใช้งาน ให้ Admin เพิ่มอีเมลนี้ในหน้า ตั้งค่า &gt; ผู้ใช้</p>
        <button className="btn secondary" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
      </div>
    </div>
  )
}

export default function App() {
  const { session, profile, loading, profileError, refreshProfile } = useAuth()
  const { role, canWrite } = useRole()

  if (!configured) return <NotConfigured />
  if (loading) return <div className="center-page muted">กำลังโหลด…</div>
  if (!session) return <Login />
  if (!profile && profileError) return (
    <div className="center-page">
      <div className="card narrow">
        <h1>โหลดโปรไฟล์ไม่ได้</h1>
        <p>{profileError === 'no-profile'
          ? 'ไม่พบโปรไฟล์ของบัญชีนี้ (อาจสมัครก่อนรันสคริปต์ฐานข้อมูล)'
          : `ฐานข้อมูลตอบกลับว่า: ${profileError}`}</p>
        <p className="muted small">Admin ให้รันไฟล์ supabase/fix-access.sql ใน Supabase SQL Editor แล้วกดลองใหม่</p>
        <button className="btn" onClick={() => refreshProfile()}>ลองใหม่</button>
        <button className="btn secondary" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
      </div>
    </div>
  )
  if (!profile) return <div className="center-page muted">กำลังโหลดโปรไฟล์…</div>
  if (role === 'pending') return <Pending />

  return (
    <MasterProvider>
      <header className="topbar">
        <div className="brand"><img src="/favicon.svg" alt="" /> เนเปียร์ ห้วยแร่</div>
        <div className="who">
          <span>{profile.full_name || profile.email}</span>
          <span className="badge">{ROLE_TH[role]}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>ออก</button>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/plots" element={<Plots />} />
          <Route path="/plots/:id" element={<PlotDetail />} />
          <Route path="/record" element={canWrite ? <RecordPage /> : <Navigate to="/" />} />
          <Route path="/history" element={<History />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <nav className="tabbar">
        <NavLink to="/" end>🏠<span>หน้าหลัก</span></NavLink>
        <NavLink to="/plots">🌱<span>แปลง</span></NavLink>
        {canWrite && <NavLink to="/record" className="add">＋<span>บันทึก</span></NavLink>}
        <NavLink to="/history">📋<span>ประวัติ</span></NavLink>
        <NavLink to="/reports">📊<span>รายงาน</span></NavLink>
        <NavLink to="/settings">⚙️<span>ตั้งค่า</span></NavLink>
      </nav>
    </MasterProvider>
  )
}
