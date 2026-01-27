/**
 * Supabase client configuration
 * @module utils/supabase
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase URL from environment or default
 */
const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL || 'https://djwbwwuipjdpeppbbspd.supabase.co';

/**
 * Supabase anonymous key from environment or default
 */
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqd2J3d3VpcGpkcGVwcGJic3BkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzgzMTQsImV4cCI6MjA4MzgxNDMxNH0.mXuewdcQKxglasC0lSR9Lgcu7ivOtdoT53moMw6Tg4E';

/**
 * Supabase client instance
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
