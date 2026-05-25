import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { regionalWinners, srWinners, omahaAWinner, omahaBWinner, champion, seriesResult } = await req.json()
  const admin = createAdminClient()

  const results = {
    regionalWinners,
    srWinners,
    omahaAWinner,
    omahaBWinner,
    champion,
    seriesResult,
    updatedAt: new Date().toISOString(),
  }

  const { error } = await admin
    .from('platform_settings')
    .upsert({
      key: 'bracket_results_2026',
      value: JSON.stringify(results),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })

  if (error) {
    console.error('[save-bracket-results] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Trigger payouts for all open baseball bracket contests when champion is set
  if (champion) {
    const { data: contests } = await admin
      .from('bracket_contests')
      .select('id, name, entry_fee_cents, settings')
      .eq('sport', 'baseball')
      .eq('status', 'open')

    for (const contest of contests ?? []) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/brackets/${contest.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': process.env.CRON_SECRET ?? '',
        },
        body: JSON.stringify({ results }),
      })
    }
  }

  return NextResponse.json({ success: true })
}
