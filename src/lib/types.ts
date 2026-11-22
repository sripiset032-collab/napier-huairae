export type Role = 'admin' | 'staff' | 'viewer' | 'pending'
export interface Profile { id: string; email: string | null; full_name: string | null; role: Role; created_at: string }
export interface Site { id: number; name: string }
export interface Plot {
  id: number; site_id: number; code: string; name: string | null; area_rai: number; variety: string | null
  latitude: number | null; longitude: number | null; status: 'active' | 'idle' | 'fallow'; notes: string | null
}
export interface ActivityType { id: number; name: string; uses_fertilizer: boolean; sort_order: number }
export interface Fertilizer { id: number; name: string; formula: string | null; unit: string; price_per_unit: number | null; active: boolean }
export interface CostCategory { id: number; name: string; sort_order: number }
export interface Planting {
  id: number; plot_id: number; plant_date: string; variety: string | null; method: string | null; spacing_cm: string | null
  cuttings_qty: number | null; end_date: string | null; notes: string | null; created_by: string; created_at: string
}
export interface Harvest {
  id: number; planting_id: number; cut_date: string; cut_no: number; height_cm: number | null; fresh_weight_kg: number
  area_rai: number | null; destination: string | null; revenue_baht: number | null; notes: string | null; created_by: string; created_at: string
}
export interface Activity {
  id: number; plot_id: number; planting_id: number | null; activity_date: string; activity_type_id: number
  fertilizer_id: number | null; fertilizer_qty: number | null; workers: number | null; notes: string | null
  photo_path: string | null; created_by: string; created_at: string
}
export interface Cost {
  id: number; plot_id: number; activity_id: number | null; cost_date: string; category_id: number; amount_baht: number
  notes: string | null; created_by: string; created_at: string
}
export interface PlotSummary {
  plot_id: number; code: string; name: string | null; area_rai: number; status: string; site_name: string
  planting_id: number | null; plant_date: string | null; cuts: number; total_kg: number; last_cut: string | null
  days_since_cut: number | null; total_cost: number; revenue: number; kg_per_rai: number; cost_per_rai: number; cost_per_kg: number | null
}
