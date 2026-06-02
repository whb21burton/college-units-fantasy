import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { odrMult } from '@/lib/odr'

export const dynamic = 'force-dynamic'

const BASE   = 'https://apinext.collegefootballdata.com'
const SEASON = 2025

const SCORING = {
  passYd: 0.1, passTd: 4, int: -2,
  rushYd: 0.1, rushTd: 6,
  recYd:  0.1, rec:  1.0, recTd: 6,
  sack: 1, defInt: 2, fumRec: 2, defTd: 6,
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

function isGameDay(): boolean {
  const day = new Date().getDay()
  // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  return [1, 4, 5, 6].includes(day) // Mon, Thu, Fri, Sat
}

function currentCfbWeek(): number {
  const now         = new Date()
  const seasonStart = new Date(`${SEASON}-08-28`)
  const diffDays    = Math.floor((now.getTime() - seasonStart.getTime()) / 86400000)
  return Math.max(1, Math.min(16, Math.floor(diffDays / 7) + 1))
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Skip if not a game day
  if (!isGameDay()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'not a game day' })
  }

  try {
    const admin = createAdminClient()
    const week  = currentCfbWeek()

    // 1. Fetch live scoreboard — checks which games are in progress
    const scoreboard = await cfbdGet('/scoreboard', { year: SEASON })
    const liveGames  = scoreboard.filter((g: any) =>
      g.status === 'in_progress' || g.status === 'halftime'
    )

    // Update live_game_status for ALL games this week
    const scoreRows = scoreboard
      .filter((g: any) => g.id)
      .map((g: any) => ({
        game_id:      String(g.id),
        season:       SEASON,
        week,
        home_team:    g.homeTeam?.name ?? g.homeTeam ?? '',
        away_team:    g.awayTeam?.name ?? g.awayTeam ?? '',
        home_score:   g.homeTeam?.points ?? g.homeScore ?? 0,
        away_score:   g.awayTeam?.points ?? g.awayScore ?? 0,
        period:       g.period ?? null,
        clock:        g.clock ?? null,
        status:       g.status === 'in_progress' ? 'in_progress'
                    : g.status === 'halftime'    ? 'halftime'
                    : g.status === 'final'       ? 'final'
                    : 'scheduled',
        possession:   g.possession ?? null,
        last_play:    g.lastPlay ?? null,
        last_updated: new Date().toISOString(),
      }))

    if (scoreRows.length) {
      await admin
        .from('live_game_status')
        .upsert(scoreRows, { onConflict: 'game_id' })
    }

    // 2. If no games in progress — skip player stat update
    if (!liveGames.length) {
      return NextResponse.json({
        success: true, week,
        message: 'No games in progress — scores updated, stats skipped',
        gamesUpdated: scoreRows.length,
      })
    }

    // 3. Fetch live player stats for this week
    const [playerStats, spRatings] = await Promise.all([
      cfbdGet('/games/players', { year: SEASON, week }),
      admin.from('sp_ratings').select('school, def_rank, off_rank').eq('season', SEASON)
        .then(r => r.data ?? []),
    ])

    const defRankMap: Record<string, number> = {}
    const offRankMap: Record<string, number> = {}
    for (const r of spRatings) {
      defRankMap[r.school] = r.def_rank
      offRankMap[r.school] = r.off_rank
    }

    // 4. Process player stats — same logic as syncStats but marks is_live=true
    const statRows: any[] = []
    const liveGameIds = new Set(liveGames.map((g: any) => String(g.id)))

    for (const game of playerStats) {
      const gameId   = String(game.id ?? '')
      const isLive   = liveGameIds.has(gameId)

      for (const team of game.teams ?? []) {
        const school   = team.school ?? team.team ?? ''
        const opponent = school === (game.homeTeam ?? '') ? (game.awayTeam ?? '') : (game.homeTeam ?? '')
        if (!school) continue

        const defRank = defRankMap[opponent] ?? 50
        const offMult = odrMult(defRank)

        for (const cat of team.categories ?? []) {
          for (const type of cat.types ?? []) {
            for (const athlete of type.athletes ?? []) {
              const name = athlete.name ?? ''
              if (!name) continue
              const val  = parseFloat(athlete.stat) || 0

              statRows.push({
                game_id:     gameId,
                school,
                player_name: name,
                week,
                season:      SEASON,
                stat_type:   `${cat.name}_${type.name}`,
                value:       val,
                is_live:     isLive,
                updated_at:  new Date().toISOString(),
              })
            }
          }
        }
      }
    }

    // Upsert live stats (will overwrite previous live values)
    let statsUpdated = 0
    for (let i = 0; i < statRows.length; i += 500) {
      const { error } = await admin
        .from('cached_stats')
        .upsert(statRows.slice(i, i + 500), {
          onConflict: 'game_id,school,player_name,stat_type',
        })
      if (!error) statsUpdated += Math.min(500, statRows.length - i)
    }

    return NextResponse.json({
      success: true, week, season: SEASON,
      liveGames: liveGames.length,
      scoresUpdated: scoreRows.length,
      statsUpdated,
    })
  } catch (err: any) {
    console.error('[sync-live-stats]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
