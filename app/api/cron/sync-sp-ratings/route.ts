import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const season = new Date().getFullYear()
  const CFBD_KEY = process.env.CFBD_API_KEY!

  const spRes = await fetch(
    `https://api.collegefootballdata.com/ratings/sp?year=${season}`,
    { headers: { Authorization: `Bearer ${CFBD_KEY}` } }
  )

  if (!spRes.ok) {
    return NextResponse.json({ error: 'CFBD SP+ fetch failed' }, { status: 500 })
  }

  const spData = await spRes.json()

  const ratings: any[] = []
  for (const t of spData) {
    const school = t.team
    if (!school) continue
    const defRank    = t.defense?.ranking ?? t.defense?.rank ?? 999
    const offRank    = t.offense?.ranking ?? t.offense?.rank ?? 999
    const overallRank = t.ranking ?? 999

    ratings.push({
      school,
      season,
      def_rank:     defRank,
      off_rank:     offRank,
      overall_rank: overallRank,
      updated_at:   new Date().toISOString(),
    })
  }

  const { error } = await admin
    .from('sp_ratings')
    .upsert(ratings, { onConflict: 'school,season' })

  if (error) {
    console.error('[sync-sp-ratings] upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[sync-sp-ratings] updated ${ratings.length} teams`)
  return NextResponse.json({ success: true, updated: ratings.length, season })
}
