import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contestId, buyInCents, entryNumber = 1 } = await req.json()
  console.log('[bracket-entry] contestId:', contestId, 'entryNumber:', entryNumber, 'userId:', user.id)
  console.log('[bracket-entry] idempotency key:', `bracket_entry_${contestId}_${user.id}_${entryNumber}`)
  if (!contestId || !buyInCents) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const admin = createAdminClient()

  console.log('[bracket-entry] calling debit_wallet', { contestId, userId: user.id, entryNumber, buyInCents })
  const { error: debitError } = await admin.rpc('debit_wallet', {
    p_user_id:         user.id,
    p_amount_cents:    buyInCents,
    p_type:            'contest_entry',
    p_description:     `Bracket entry #${entryNumber}: ${contestId}`,
    p_idempotency_key: `bracket_entry_${contestId}_${user.id}_${entryNumber}`,
  })

  if (debitError) {
    console.error('[bracket-entry] debit_wallet error:', debitError.message, debitError.code, debitError.details)
    return NextResponse.json({ error: debitError.message ?? 'Payment failed' }, { status: 400 })
  }

  console.log('[bracket-entry] debit_wallet SUCCESS entry', entryNumber)
  return NextResponse.json({ success: true })
}
