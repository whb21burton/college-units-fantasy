import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const BASE   = 'https://apinext.collegefootballdata.com'
const SEASON = 2026

const CFBD_POS: Record<string, string> = {
  QB: 'QB', QUARTERBACK: 'QB',
  RB: 'RB', HB: 'RB', FB: 'RB', 'RUNNING BACK': 'RB',
  WR: 'WR', 'WIDE RECEIVER': 'WR',
  TE: 'TE', 'TIGHT END': 'TE',
  K: 'K', PK: 'K', KICKER: 'K', PLACEKICKER: 'K',
}

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

  const { searchParams } = new URL(req.url)
  const schoolParam  = searchParams.get('school')
  const divisionParam = searchParams.get('division') // 'FBS', 'FCS', or null for all

  // Load all schools from cached_teams
  const admin = createAdminClient()
  let schoolQuery = admin
    .from('cached_teams')
    .select('school, division')
    .limit(2000)
  if (divisionParam) schoolQuery = schoolQuery.eq('division', divisionParam)
  const { data: teamRows } = await schoolQuery
  const allSchools = (teamRows ?? []).map((t: any) => t.school as string)
  const schools = schoolParam ? [schoolParam] : allSchools

  try {
    const admin  = createAdminClient()
    let   total  = 0

    // Fetch previous season stats to rank players (who has most yards = depth 1)
    // This gives us week-1 depth rankings before any games are played
    const { data: prevStats } = await admin
      .from('cached_stats')
      .select('school, player_name, stat_type, value')
      .eq('season', SEASON - 1)
      .in('stat_type', ['passing_YDS', 'rushing_YDS', 'receiving_YDS', 'kicking_PTS'])
      .not('player_name', 'is', null)

    // Build prev season totals: school||player_name → { pos, yards }
    const prevTotals: Record<string, Record<string, number>> = {}
    for (const row of prevStats ?? []) {
      if (!row.player_name) continue
      const k = `${row.school}||${row.player_name}`
      if (!prevTotals[k]) prevTotals[k] = {}
      prevTotals[k][row.stat_type] = (prevTotals[k][row.stat_type] ?? 0) + row.value
    }

    for (const school of schools) {
      try {
        const roster = await cfbdGet('/roster', { team: school, year: SEASON })
        if (!roster.length) continue

        // Group by position
        const byPos: Record<string, Array<{ name: string; jersey: string | null; year: string | null; stars: number | null; height: string | null; weight: number | null; prevYards: number }>> = {}

        for (const p of roster) {
          const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
          const pos  = CFBD_POS[(p.position ?? '').toUpperCase().trim()] ?? null
          if (!name || !pos) continue

          const k = `${school}||${name}`
          const prevYards =
            prevTotals[k]?.['passing_YDS'] ??
            prevTotals[k]?.['rushing_YDS'] ??
            prevTotals[k]?.['receiving_YDS'] ??
            prevTotals[k]?.['kicking_PTS'] ?? 0

          const yearMap: Record<number, string> = { 1: 'FR', 2: 'SO', 3: 'JR', 4: 'SR', 5: 'GR' }
          const yr = typeof p.year === 'number' ? (yearMap[p.year] ?? null) : null

          if (!byPos[pos]) byPos[pos] = []
          byPos[pos].push({
            name,
            jersey:    p.jersey != null ? String(p.jersey) : null,
            year:      yr,
            stars:     p.recruitingRating ? Math.round(p.recruitingRating * 5) : null,
            height:    p.height ?? null,
            weight:    p.weight ?? null,
            prevYards,
          })
        }

        // Sort each position by prev season yards desc → assign depth rank
        const rows: any[] = []
        for (const [pos, players] of Object.entries(byPos)) {
          players.sort((a, b) => b.prevYards - a.prevYards)
          players.forEach((p, i) => {
            rows.push({
              school,
              season:         SEASON,
              player_name:    p.name,
              position:       pos,
              depth_rank:     Math.min(i + 1, 3), // cap at 3
              jersey_number:  p.jersey,
              year_in_school: p.year,
              injury_status:  null,
              stars:          p.stars,
              height:         p.height,
              weight:         p.weight,
              updated_at:     new Date().toISOString(),
            })
          })
        }

        if (rows.length) {
          const { error } = await admin
            .from('season_rosters')
            .upsert(rows, { onConflict: 'school,season,player_name,position' })
          if (error) console.error(`[sync-rosters] ${school}:`, error.message)
          else total += rows.length
        }
      } catch (e: any) {
        console.error(`[sync-rosters] ${school} failed:`, e.message)
      }
    }

    await admin.from('data_refresh_log').insert({
      job_name: `syncSeasonRosters:${SEASON}`,
      status: 'success',
      records_updated: total,
    })

    return NextResponse.json({ success: true, season: SEASON, updated: total })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
