import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { transactionId } = await req.json()
  if (!transactionId) return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('transactions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', transactionId)
    .eq('type', 'withdrawal')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
