import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const season = new Date().getFullYear()
    const CFBD_KEY = process.env.CFBD_API_KEY!

    const spRes = await fetch(
      `https://api.collegefootballdata.com/ratings/sp?year=${season}`,
      { headers: { Authorization: `Bearer ${CFBD_KEY}` } }
    )

    if (!spRes.ok) {
      const errText = await spRes.text()
      console.error('[sync-sp-ratings] CFBD error:', spRes.status, errText)
      return NextResponse.json({ error: 'CFBD SP+ fetch failed', status: spRes.status, detail: errText }, { status: 500 })
    }

    const spData = await spRes.json()

    if (!Array.isArray(spData) || spData.length === 0) {
      console.log('[sync-sp-ratings] No SP+ data available yet for', season)
      return NextResponse.json({
        success: true,
        updated: 0,
        season,
        message: 'No SP+ data available yet — try again after season starts',
      })
    }

    // Fetch Elo rankings
    const eloRankMap: Record<string, number> = {}
    const eloRes = await fetch(
      `https://api.collegefootballdata.com/ratings/elo?year=${season}`,
      { headers: { Authorization: `Bearer ${CFBD_KEY}` } }
    )
    if (eloRes.ok) {
      const eloData = await eloRes.json()
      if (Array.isArray(eloData) && eloData.length > 0) {
        const sorted = [...eloData].sort((a: any, b: any) => (b.elo ?? 0) - (a.elo ?? 0))
        sorted.forEach((t: any, i: number) => { if (t.team) eloRankMap[t.team] = i + 1 })
      }
    }

    const spTeams = new Set(spData.map((t: any) => t.team).filter(Boolean))
    const ratings: any[] = spData
      .filter((t: any) => t.team)
      .map((t: any) => ({
        school:       t.team,
        season,
        def_rank:     t.defense?.ranking ?? t.defense?.rank ?? 999,
        off_rank:     t.offense?.ranking ?? t.offense?.rank ?? 999,
        overall_rank: t.ranking ?? 999,
        elo_rank:     eloRankMap[t.team] ?? 999,
        updated_at:   new Date().toISOString(),
      }))

    // Add teams in Elo but not SP+
    for (const [school, rank] of Object.entries(eloRankMap)) {
      if (!spTeams.has(school)) {
        ratings.push({ school, season, def_rank: 999, off_rank: 999, overall_rank: rank, elo_rank: rank, updated_at: new Date().toISOString() })
      }
    }

    const { error } = await admin
      .from('sp_ratings')
      .upsert(ratings, { onConflict: 'school,season' })

    if (error) {
      console.error('[sync-sp-ratings] upsert error:', error.message, error.code, error.details)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
    }

    console.log(`[sync-sp-ratings] updated ${ratings.length} teams for ${season}`)
    return NextResponse.json({ success: true, updated: ratings.length, season })

  } catch (err: any) {
    console.error('[sync-sp-ratings] unhandled error:', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
