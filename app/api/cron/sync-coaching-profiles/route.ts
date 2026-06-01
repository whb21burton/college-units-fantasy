import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const BASE = 'https://apinext.collegefootballdata.com'

async function cfbdGet(path: string, params: Record<string, string | number>) {
  const key = process.env.CFBD_API_KEY
  if (!key) throw new Error('CFBD_API_KEY not set')
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`CFBD ${path} HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin  = createAdminClient()
    const season = 2025

    console.log('[sync-coaching] fetching coaches + advanced stats...')

    // TWO calls — fetch all teams at once
    const [coachData, advancedData] = await Promise.all([
      cfbdGet('/coaches', { year: season }),
      cfbdGet('/stats/season/advanced', { year: season, excludeGarbageTime: 'true' }),
    ])

    console.log('[sync-coaching] coaches:', coachData.length, 'advanced:', advancedData.length)

    // Build coach map: school → { headCoach, offCoordinator }
    // CFBD /coaches returns one entry per coach with a seasons[] array
    // Each entry: { firstName, lastName, hireDate, seasons: [{ school, year, ... }] }
    // We group by school from seasons[0].school for the requested year
    const coachMap: Record<string, { headCoach: string | null; oc: string | null }> = {}

    // First pass: find head coaches (highest spOverall or just first entry per school)
    // CFBD doesn't return position/title — head coach is identified as the one with
    // spOverall data (coordinators don't have SP+ ratings)
    const schoolCoaches: Record<string, Array<{ name: string; hasSP: boolean }>> = {}
    for (const entry of coachData) {
      const name = `${entry.firstName ?? ''} ${entry.lastName ?? ''}`.trim()
      if (!name) continue
      for (const s of entry.seasons ?? []) {
        if (s.year !== 2025) continue
        const school = s.school ?? ''
        if (!school) continue
        if (!schoolCoaches[school]) schoolCoaches[school] = []
        const hasSP = s.spOverall != null && s.spOverall !== 0
        schoolCoaches[school].push({ name, hasSP })
      }
    }

    // Head coach = coach with SP+ data (head coaches have team SP ratings)
    // OC = second coach at the school if exists
    for (const [school, coaches] of Object.entries(schoolCoaches)) {
      const hc  = coaches.find(c => c.hasSP) ?? coaches[0] ?? null
      const oc  = coaches.find(c => c !== hc) ?? null
      coachMap[school] = {
        headCoach: hc?.name ?? null,
        oc:        oc?.name ?? null,
      }
    }

    // Build advanced stats map: school → stats
    const advMap: Record<string, any> = {}
    for (const entry of advancedData) {
      const school = entry.team ?? entry.school ?? ''
      if (!school) continue
      advMap[school] = entry
    }

    // Merge into profiles
    const allSchools = Array.from(new Set([
      ...Object.keys(coachMap),
      ...Object.keys(advMap),
    ]))

    const rows = allSchools.map(school => {
      const coaches = coachMap[school] ?? { headCoach: null, oc: null }
      const adv     = advMap[school] ?? {}

      // offense object from advanced stats
      const off = adv.offense ?? {}

      const passRate      = off.passingPlays?.rate != null
        ? Math.round(off.passingPlays.rate * 100)
        : null
      // plays_per_game: total plays / estimated games (drives / ~10 drives per game)
      const estimatedGames = off.drives != null ? Math.round(off.drives / 10) : null
      const playsPerGameCalc = (off.plays != null && estimatedGames && estimatedGames > 0)
        ? Math.round(off.plays / estimatedGames)
        : null
      const rushRate      = passRate != null ? 100 - passRate : null
      const explosiveness = off.explosiveness ?? null
      const playsPerGame  = playsPerGameCalc

      // Tempo: fast = >75 plays/game, slow = <65
      let tempo: string | null = null
      if (playsPerGame != null) {
        tempo = playsPerGame >= 75 ? 'fast' : playsPerGame <= 64 ? 'slow' : 'normal'
      }

      // HC philosophy: offensive if pass rate > 55, defensive if < 42, else balanced
      let hcPhilosophy: string | null = null
      if (passRate != null) {
        hcPhilosophy = passRate >= 55 ? 'offensive' : passRate <= 42 ? 'defensive' : 'balanced'
      }

      // Aggressiveness score 0-10: weighted combo of pass rate + explosiveness + tempo
      let aggressiveness: number | null = null
      if (passRate != null) {
        const passScore  = Math.min(10, (passRate - 40) / 3)   // 40% pass = 0, 70% = 10
        const exploScore = explosiveness != null
          ? Math.min(10, explosiveness * 8) : 5                 // ~1.2 avg = 9.6
        const tempoScore = tempo === 'fast' ? 8 : tempo === 'slow' ? 3 : 5
        aggressiveness   = Math.round(
          (passScore * 0.5 + exploScore * 0.3 + tempoScore * 0.2) * 10
        ) / 10
        aggressiveness   = Math.max(0, Math.min(10, aggressiveness))
      }

      return {
        school,
        season,
        head_coach:           coaches.headCoach,
        hc_philosophy:        hcPhilosophy,
        off_coordinator:      coaches.oc,
        pass_rate:            passRate,
        rush_rate:            rushRate,
        explosiveness:        explosiveness,
        tempo,
        plays_per_game:       playsPerGame,
        aggressiveness_score: aggressiveness,
        updated_at:           new Date().toISOString(),
      }
    })

    console.log('[sync-coaching] upserting', rows.length, 'profiles...')
    const { error } = await admin
      .from('team_coaching_profiles')
      .upsert(rows, { onConflict: 'school,season' })

    if (error) {
      console.error('[sync-coaching] upsert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log it
    await admin.from('data_refresh_log').insert({
      job_name: `syncCoachingProfiles:${season}`,
      status: 'success',
      records_updated: rows.length,
    })

    return NextResponse.json({ success: true, season, updated: rows.length })

  } catch (err: any) {
    console.error('[sync-coaching] error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
