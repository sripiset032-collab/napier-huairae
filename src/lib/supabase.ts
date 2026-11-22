import { createClient } from '@supabase/supabase-js'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

// Accept "https://xxx.supabase.co", "https://xxx.supabase.co/", "https://xxx.supabase.co/rest/v1/" or just "xxx.supabase.co"
const normalize = (u: string | undefined) => {
  if (!u) return undefined
  try { return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).origin } catch { return undefined }
}
const url = normalize(rawUrl)

export const configured = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key')
