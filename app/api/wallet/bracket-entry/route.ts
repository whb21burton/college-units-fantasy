import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { getStateFromIP, checkStateRestriction, logComplianceEvent } from '@/lib/compliance'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? ''
  const stateCode = await getStateFromIP(ip)
  if (stateCode) {
    const { restricted, stateName } = await checkStateRestriction(stateCode)
    if (restricted) {
      await logComplianceEvent(user.id, 'blocked_entry', { route: 'bracket-entry', stateCode }, ip, req.headers.get('user-agent') ?? '')
      return NextResponse.json({
        error: `Cash contests and deposits are unavailable while you are located in ${stateName}. You may still access your account and withdraw funds.`,
        restricted: true,
        state_code: stateCode,
      }, { status: 403 })
    }
  }

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
