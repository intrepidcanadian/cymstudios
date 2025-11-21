import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
                                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' // Backward compatibility

export const supabase = createClient(supabaseUrl, supabasePublishableKey)

// Type for newsletter subscriber
export interface NewsletterSubscriber {
  id?: number
  email: string
  consent: boolean
  subscribed_at?: string
  ip_address?: string
  user_agent?: string
}

