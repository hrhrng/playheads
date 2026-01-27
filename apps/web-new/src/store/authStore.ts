
import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  initialize: () => Promise<void>;
  signInWithOtp: (email: string) => Promise<{ error: any; data: any }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,

  initialize: async () => {
    set({ isLoading: true });
    try {
      // Get initial session
      const { data: { session } } = await supabase.auth.getSession();
      set({ session, user: session?.user ?? null });

      // Listen for changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null, isLoading: false });
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithOtp: async (email: string) => {
    return await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
      }
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  }
}));
