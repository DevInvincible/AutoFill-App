import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://hiilcadgkjtcmnobvwex.supabase.co'
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaWxjYWRna2p0Y21ub2J2d2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTk2OTgsImV4cCI6MjEwNjU5NTY5OH0.vrMIR_dfVElzER_lHqgS8H2vmqNhA1zJ79MNnwlhbSg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
