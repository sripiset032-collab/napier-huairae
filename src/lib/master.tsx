import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { ActivityType, CostCategory, Fertilizer, Plot, Profile, Site } from './types'

interface Master {
  sites: Site[]; plots: Plot[]; activityTypes: ActivityType[]; fertilizers: Fertilizer[]; categories: CostCategory[]
  people: Record<string, string>
  ready: boolean
  reload: () => Promise<void>
}

const empty: Master = { sites: [], plots: [], activityTypes: [], fertilizers: [], categories: [], people: {}, ready: false, reload: async () => {} }
const Ctx = createContext<Master>(empty)

export function MasterProvider({ children }: { children: ReactNode }) {
  const [m, setM] = useState<Omit<Master, 'reload'>>(empty)

  const reload = useCallback(async () => {
    const [s, p, a, f, c, u] = await Promise.all([
      supabase.from('sites').select('*').order('name'),
      supabase.from('plots').select('*').order('code'),
      supabase.from('activity_types').select('*').order('sort_order'),
      supabase.from('fertilizers').select('*').order('name'),
      supabase.from('cost_categories').select('*').order('sort_order'),
      supabase.from('profiles').select('id, full_name, email'),
    ])
    const people: Record<string, string> = {}
    for (const x of (u.data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email'>[]) people[x.id] = x.full_name || x.email || ''
    setM({
      sites: (s.data ?? []) as Site[], plots: (p.data ?? []) as Plot[], activityTypes: (a.data ?? []) as ActivityType[],
      fertilizers: (f.data ?? []) as Fertilizer[], categories: (c.data ?? []) as CostCategory[], people, ready: true,
    })
  }, [])

  useEffect(() => { reload() }, [reload])
  return <Ctx.Provider value={{ ...m, reload }}>{children}</Ctx.Provider>
}

export const useMaster = () => useContext(Ctx)
