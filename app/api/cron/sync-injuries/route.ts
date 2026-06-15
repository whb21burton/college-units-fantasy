import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { CONFERENCES } from '@/lib/playerPool'

export const dynamic = 'force-dynamic'

const BASE   = 'https://apinext.collegefootballdata.com'
const SEASON = 2026
const ALL_FBS = Object.values(CONFERENCES).flat()

async function cfbdGet(path: string, params: Record<string, string | number> = {}) {
  const key = process.env.CFBD_API_KEY
  if (!key) throw new Error('CFBD_API_KEY not set')
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`CFBD ${path} HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // Fetch player usage — CFBD usage data includes snaps/participation
    // which we use as a proxy for injury (0 snaps = likely injured/out)
    // Also check if they had stats in recent weeks
    const { searchParams } = new URL(req.url)
    const weekParam = searchParams.get('week')
    const week      = weekParam ? parseInt(weekParam) : null

    if (!week) {
      return NextResponse.json({ error: 'week param required' }, { status: 400 })
    }

    // Get depth-1 and depth-2 players from season_rosters
    const { data: starters } = await admin
      .from('season_rosters')
      .select('school, player_name, position, depth_rank')
      .eq('season', SEASON)
      .in('depth_rank', [1, 2])
      .in('school', ALL_FBS)

    if (!starters?.length) {
      return NextResponse.json({ success: true, updated: 0, message: 'No starters found' })
    }

    // Check who had zero stats in the most recent week
    const { data: recentStats } = await admin
      .from('cached_stats')
      .select('school, player_name')
      .eq('season', SEASON)
      .eq('week', week)
      .not('player_name', 'is', null)
      .gt('value', 0)

    const hadStats = new Set(
      (recentStats ?? []).map((r: any) => `${r.school}||${r.player_name}`)
    )

    // Mark starters who had NO stats in recent week as Questionable
    // Only flag if they had stats in previous weeks (ruling out bye weeks)
    const { data: prevStats } = await admin
      .from('cached_stats')
      .select('school, player_name')
      .eq('season', SEASON)
      .lt('week', week)
      .not('player_name', 'is', null)
      .gt('value', 0)

    const hadPrevStats = new Set(
      (prevStats ?? []).map((r: any) => `${r.school}||${r.player_name}`)
    )

    const updates: Array<{ school: string; player_name: string; position: string; injury_status: string | null }> = []

    for (const player of starters) {
      const key     = `${player.school}||${player.player_name}`
      const wasActive = hadPrevStats.has(key)
      const isActive  = hadStats.has(key)

      if (wasActive && !isActive) {
        // Had stats before but not this week — flag as Questionable
        updates.push({
          school:         player.school,
          player_name:    player.player_name,
          position:       player.position,
          injury_status:  'Q',
        })
      } else if (isActive) {
        // Had stats this week — clear any injury flag
        updates.push({
          school:         player.school,
          player_name:    player.player_name,
          position:       player.position,
          injury_status:  null,
        })
      }
    }

    let updated = 0
    for (const u of updates) {
      const { error } = await admin
        .from('season_rosters')
        .update({ injury_status: u.injury_status, updated_at: new Date().toISOString() })
        .eq('school', u.school)
        .eq('player_name', u.player_name)
        .eq('position', u.position)
        .eq('season', SEASON)
      if (!error) updated++
    }

    await admin.from('data_refresh_log').insert({
      job_name: `syncInjuries:${SEASON}:w${week}`,
      status: 'success',
      records_updated: updated,
    })

    return NextResponse.json({ success: true, week, season: SEASON, checked: starters.length, updated })
  } catch (err: any) {
    console.error('[sync-injuries]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
