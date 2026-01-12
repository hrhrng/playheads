
import { createClient } from '@supabase/supabase-js'

// Need to define these in .env first, using placeholders for now if not set
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://djwbwwuipjdpeppbbspd.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqd2J3d3VpcGpkcGVwcGJic3BkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzgzMTQsImV4cCI6MjA4MzgxNDMxNH0.mXuewdcQKxglasC0lSR9Lgcu7ivOtdoT53moMw6Tg4E'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
