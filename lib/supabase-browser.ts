import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Use this in Client Components ('use client')
export const supabase = createClientComponentClient();
