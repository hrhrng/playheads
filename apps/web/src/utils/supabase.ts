/**
 * Supabase client configuration
 * @module utils/supabase
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase URL from environment or default
 */
const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;

/**
 * Supabase anonymous key from environment variable
 */
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Supabase client instance
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
