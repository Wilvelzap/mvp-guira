import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profile = {
  id: string
  email: string
  role: 'client' | 'staff' | 'admin'
  full_name: string | null
  onboarding_status: OnboardingStatus
  bridge_customer_id: string | null
  created_at: string
}

export type OnboardingStatus = 'draft' | 'submitted' | 'under_review' | 'verified' | 'rejected' | 'needs_changes'

export type Onboarding = {
  id: string
  user_id: string
  type: 'personal' | 'company'
  status: OnboardingStatus
  data: any
  observations: string | null
  bridge_customer_id: string | null
  created_at: string
  updated_at: string
}
