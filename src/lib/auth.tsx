import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  profileError: string | null
  refreshProfile: () => Promise<void>
}

const AuthCtx = createContext<AuthState>({ session: null, profile: null, loading: true, profileError: null, refreshProfile: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  const loadProfile = async (s: Session | null) => {
    if (!s) { setProfile(null); setProfileError(null); return }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile(data as Profile | null)
    setProfileError(error ? error.message : data ? null : 'no-profile')
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // defer DB call out of the auth callback
      setTimeout(() => { loadProfile(s) }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthCtx.Provider value={{ session, profile, loading, profileError, refreshProfile: () => loadProfile(session) }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)

export const useRole = () => {
  const { profile } = useAuth()
  const role = profile?.role ?? 'pending'
  return { role, isAdmin: role === 'admin', canWrite: role === 'admin' || role === 'staff' }
}
