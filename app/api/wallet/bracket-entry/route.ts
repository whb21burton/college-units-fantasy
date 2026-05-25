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
  if (!contestId || !buyInCents) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const admin = createAdminClient()

  // Atomic debit — idempotent, blocks overdrafts, auto-creates ledger accounts
  const { error: rpcError } = await admin.rpc('debit_wallet', {
    p_user_id:         user.id,
    p_amount_cents:    buyInCents,
    p_type:            'contest_entry',
    p_description:     `Bracket entry #${entryNumber}: ${contestId}`,
    p_idempotency_key: `entry_${contestId}_${user.id}_${entryNumber}`,
  })

  if (rpcError) {
    if (rpcError.message.includes('Insufficient balance')) {
      return NextResponse.json({ error: 'Not enough funds' }, { status: 400 })
    }
    if (rpcError.message.includes('Wallet not found')) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
