/**
 * lib/sportsDataService.ts
 * ONLY file that calls CFBD API directly.
 * Simple pipeline: fetch roster → assign positions → score by unit → store
 */

import { createAdminClient } from '@/lib/supabase-server'

const BASE_URL = 'https://apinext.collegefootballdata.com'

const SCORING = {
  passYd: 0.1, passTd: 4, int: -2,
  rushYd: 0.1, rushTd: 6,
  recYd: 0.1,  rec: 1.0, recTd: 6,
  sack: 1, defInt: 2, fumRec: 2, defTd: 6,
}

const RB_WEIGHTS = [1.0, 0.5, 0.25]
const WR_WEIGHTS = [1.0, 0.5, 0.25]
const TE_WEIGHTS = [1.0, 0.5]

const CFBD_POS: Record<string, string> = {
  QB: 'QB', QUARTERBACK: 'QB',
  RB: 'RB', 'RUNNING BACK': 'RB', HB: 'RB', HALFBACK: 'RB', FB: 'RB', FULLBACK: 'RB',
  WR: 'WR', 'WIDE RECEIVER': 'WR',
  TE: 'TE', 'TIGHT END': 'TE',
  K: 'K', PK: 'K', KICKER: 'K', PLACEKICKER: 'K', 'PLACE KICKER': 'K',
}

function odrMult(rank: number): number {
  if (rank <=  5) return 1.3
  if (rank <= 10) return 1.2
  if (rank <= 15) return 1.1
  if (rank <= 25) return 1.0
  if (rank <= 35) return 0.9
  if (rank <= 50) return 0.8
  if (rank <= 80) return 0.7
  if (rank <= 100) return 0.6
  return 0.5
}

async function cfbdGet(path: string, params: Record<string, string | number>): Promise<any[]> {
  const apiKey = process.env.CFBD_API_KEY
  if (!apiKey) throw new Error('CFBD_API_KEY not set')
  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`CFBD ${path} HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function logSync(job: string, status: 'success' | 'failed', records: number, err?: string) {
  const db = createAdminClient()
  await db.from('data_refresh_log').insert({
    job_name: job, status, records_updated: records, error_message: err ?? null,
  })
}

// ─── syncSchedule ────────────────────────────────────────────────────────────
export async function syncSchedule(season: number): Promise<number> {
  const db = createAdminClient()
  const games = await cfbdGet('/games', { year: season })
  const rows = games
    .filter((g: any) => g.id && g.homeTeam && g.awayTeam && g.seasonType === 'regular')
    .map((g: any) => ({
      game_id: String(g.id), week: g.week ?? 0, season,
      home_team: g.homeTeam, away_team: g.awayTeam,
      game_date: g.startDate ?? null, updated_at: new Date().toISOString(),
    }))
  if (rows.length) await db.from('cached_schedule').upsert(rows, { onConflict: 'game_id' })
  await logSync(`syncSchedule:${season}`, 'success', rows.length)
  return rows.length
}

// ─── syncScores ──────────────────────────────────────────────────────────────
export async function syncScores(week: number, season: number): Promise<number> {
  const db = createAdminClient()
  const games = await cfbdGet('/games', { year: season, week })
  const rows = games
    .filter((g: any) => g.id && g.homeTeam && g.awayTeam && g.seasonType === 'regular')
    .map((g: any) => {
      const done = g.homePoints != null && g.awayPoints != null
      return {
        game_id: String(g.id), home_team: g.homeTeam, away_team: g.awayTeam,
        home_score: g.homePoints ?? null, away_score: g.awayPoints ?? null,
        week, season, start_time: g.startDate ?? null,
        status: done ? 'completed' : 'scheduled', updated_at: new Date().toISOString(),
      }
    })
  if (rows.length) await db.from('cached_scores').upsert(rows, { onConflict: 'game_id' })
  await logSync(`syncScores:${season}:w${week}`, 'success', rows.length)
  return rows.length
}

// ─── syncRosters ─────────────────────────────────────────────────────────────
export async function syncRosters(teams: string[], season = 2025): Promise<number> {
  const db = createAdminClient()
  let total = 0

  for (const team of teams) {
    try {
      const roster = await cfbdGet('/roster', { team, year: season })
      const rows = roster.flatMap((p: any) => {
        const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
        const pos = CFBD_POS[(p.position ?? '').toUpperCase().trim()] ?? null
        if (!name || !pos) return []
        const yearMap: Record<number, string> = { 1: 'FR', 2: 'SO', 3: 'JR', 4: 'SR', 5: 'SR' }
        const validYears = new Set(['FR', 'SO', 'JR', 'SR'])
        let yr: string | null = null
        if (typeof p.year === 'number') yr = yearMap[p.year] ?? null
        else if (typeof p.year === 'string' && validYears.has(p.year.toUpperCase())) yr = p.year.toUpperCase()
        return [{
          school: team, season, position: pos, player_name: name,
          jersey_number: p.jersey != null ? String(p.jersey) : null,
          year: yr, status: 'active', depth_chart_position: null,
          updated_at: new Date().toISOString(),
        }]
      })
      if (!rows.length) continue
      const { error } = await db.from('cached_players')
        .upsert(rows, { onConflict: 'school,player_name,season' })
      if (error) console.error(`syncRosters:${team}`, error.message)
      else total += rows.length
    } catch (e: any) {
      console.error(`syncRosters:${team} error:`, e.message)
    }
  }

  await logSync(`syncRosters:${season}`, 'success', total)
  return total
}

// ─── syncStats ───────────────────────────────────────────────────────────────
export async function syncStats(
  week: number,
  season: number,
  schoolsFilter?: string[],
): Promise<number> {
  const db = createAdminClient()
  let total = 0

  // 1. Fetch games, player stats, team stats, elo — all in parallel
  const [games, playerStats, teamStats, eloData] = await Promise.all([
    cfbdGet('/games',         { year: season, week }),
    cfbdGet('/games/players', { year: season, week }).catch(() => []),
    cfbdGet('/games/teams',   { year: season, week }).catch(() => []),
    cfbdGet('/ratings/elo',   { year: season, week }).catch(() => []),
  ])

  const completedGames = games.filter((g: any) =>
    g.homePoints != null && g.awayPoints != null && g.seasonType === 'regular'
  )
  if (!completedGames.length) return 0

  // 2. Elo rank map
  const eloRank: Record<string, number> = {}
  ;[...eloData].sort((a: any, b: any) => (b.elo ?? 0) - (a.elo ?? 0))
    .forEach((t: any, i: number) => { if (t.team) eloRank[t.team] = i + 1 })

  // 3. Team stats map: school → { category: value }
  const teamStatMap: Record<string, Record<string, number>> = {}
  for (const game of teamStats) {
    for (const team of game.teams ?? []) {
      const s = team.school ?? team.team ?? ''
      if (!s) continue
      teamStatMap[s] ??= {}
      for (const stat of team.stats ?? []) {
        teamStatMap[s][stat.category] = parseFloat(stat.stat) || 0
      }
    }
  }

  // 4. Player stats map: gameId||school||name||category → fields
  const playerStatMap: Record<string, any> = {}
  for (const game of playerStats) {
    const gId = String(game.id ?? '')
    for (const team of game.teams ?? []) {
      const s = team.school ?? team.team ?? ''
      if (!s) continue
      for (const cat of team.categories ?? []) {
        for (const type of cat.types ?? []) {
          for (const athlete of type.athletes ?? []) {
            const name = athlete.name ?? ''
            if (!name) continue
            const key = `${gId}||${s}||${name}||${cat.name}`
            playerStatMap[key] ??= { gameId: gId, school: s, name, category: cat.name }
            playerStatMap[key][type.name] = (playerStatMap[key][type.name] || 0) + (parseFloat(athlete.stat) || 0)
          }
        }
      }
    }
  }

  // 5. Get all schools in this week's games
  const allSchools = Array.from(new Set<string>(
    completedGames.flatMap((g: any) => [g.homeTeam, g.awayTeam])
  ))

  // 6. ── POSITION REGISTRY ──────────────────────────────────────────────────
  // Fetch roster from CFBD for every school → build posLookup
  // Key: "school||firstname lastname" → position
  // This is the ONLY source of truth for player positions.
  const posLookup: Record<string, string> = {}

  await Promise.all(allSchools.map(async (school) => {
    try {
      const roster = await cfbdGet('/roster', { team: school, year: season })
      let teCount = 0
      for (const p of roster) {
        const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
        const pos = CFBD_POS[(p.position ?? '').toUpperCase().trim()] ?? null
        if (!name || !pos) continue
        // Store exact name
        posLookup[`${school}||${name}`] = pos
        // Store normalized name (lowercase, no punctuation)
        const norm = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
        posLookup[`${school}||${norm}`] = pos
        if (pos === 'TE') teCount++
      }
      console.log(`[posRegistry] ${school}: ${roster.length} players, ${teCount} TEs`)
    } catch (e: any) {
      console.error(`[posRegistry] ${school} failed:`, e.message)
    }
  }))

  // Helper: look up a player's position
  const getPos = (school: string, name: string): string | null => {
    return posLookup[`${school}||${name}`]
      ?? posLookup[`${school}||${name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()}`]
      ?? null
  }

  // 7. Process each game
  for (const game of completedGames) {
    const gameId = String(game.id)

    for (const school of [game.homeTeam, game.awayTeam] as string[]) {
      if (schoolsFilter?.length && !schoolsFilter.includes(school)) continue

      const opponent = school === game.homeTeam ? game.awayTeam : game.homeTeam
      const mult = odrMult(eloRank[opponent] ?? 999)
      const ts = teamStatMap[school] ?? {}
      const entries = Object.values(playerStatMap)
        .filter((e: any) => e.gameId === gameId && e.school === school)

      const rows: any[] = []
      const add = (playerName: string | null, statType: string, value: number) => {
        rows.push({
          game_id: gameId, school, player_name: playerName,
          week, season, stat_type: statType,
          value: Math.round(value * 1000) / 1000,
          updated_at: new Date().toISOString(),
        })
      }

      // ── Per-player: store raw stats + assign to unit ──────────────────────
      type Unit = 'QB' | 'RB' | 'WR' | 'TE' | 'K'
      const units: Record<Unit, Array<{ name: string; pts: number }>> = {
        QB: [], RB: [], WR: [], TE: [], K: [],
      }

      const names = Array.from(new Set<string>(entries.map((e: any) => e.name).filter(Boolean)))

      for (const name of names) {
        const passE = entries.find((e: any) => e.name === name && e.category === 'passing')
        const rushE = entries.find((e: any) => e.name === name && e.category === 'rushing')
        const recvE = entries.find((e: any) => e.name === name && e.category === 'receiving')
        const kickE = entries.find((e: any) => e.name === name && e.category === 'kicking')

        // Store raw stats
        if (passE) { add(name, 'passing_YDS', passE.YDS||0); add(name, 'passing_TD', passE.TD||0); add(name, 'passing_INT', passE.INT||0) }
        if (rushE) { add(name, 'rushing_YDS', rushE.YDS||0); add(name, 'rushing_TD',  rushE.TD||0);  add(name, 'rushing_ATT', rushE.ATT||0) }
        if (recvE) { add(name, 'receiving_YDS', recvE.YDS||0); add(name, 'receiving_TD', recvE.TD||0); add(name, 'receiving_REC', recvE.REC||0) }
        if (kickE) { add(name, 'kicking_PTS', kickE.PTS||0) }

        // Assign to unit — posLookup is source of truth
        const pos = getPos(school, name)
        let unit: Unit | null = null

        if (pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE' || pos === 'K') {
          unit = pos
        } else if (passE) {
          unit = 'QB'
        } else if (kickE && !rushE && !recvE) {
          unit = 'K'
        } else if (rushE && !recvE) {
          unit = 'RB'
        } else if (recvE && !rushE) {
          unit = 'WR'
        } else if (rushE && recvE) {
          const rPts = (rushE.YDS||0)*SCORING.rushYd + (rushE.TD||0)*SCORING.rushTd
          const cPts = (recvE.YDS||0)*SCORING.recYd  + (recvE.REC||0)*SCORING.rec + (recvE.TD||0)*SCORING.recTd
          unit = rPts >= cPts ? 'RB' : 'WR'
        }

        if (!unit) continue

        // Calculate raw fantasy points
        let pts = 0
        if (unit === 'QB') {
          pts = (passE ? (passE.YDS||0)*SCORING.passYd + (passE.TD||0)*SCORING.passTd + (passE.INT||0)*SCORING.int : 0)
              + (rushE ? (rushE.YDS||0)*SCORING.rushYd + (rushE.TD||0)*SCORING.rushTd : 0)
        } else if (unit === 'RB') {
          pts = (rushE ? (rushE.YDS||0)*SCORING.rushYd + (rushE.TD||0)*SCORING.rushTd : 0)
              + (recvE ? (recvE.YDS||0)*SCORING.recYd  + (recvE.REC||0)*SCORING.rec + (recvE.TD||0)*SCORING.recTd : 0)
        } else if (unit === 'WR' || unit === 'TE') {
          pts = recvE ? (recvE.YDS||0)*SCORING.recYd + (recvE.REC||0)*SCORING.rec + (recvE.TD||0)*SCORING.recTd : 0
        } else if (unit === 'K') {
          pts = kickE?.PTS || 0
        }

        units[unit].push({ name, pts })
      }

      // ── Score each unit ───────────────────────────────────────────────────
      add(null, 'game_mult', mult)

      // QB — top scorer only
      units.QB.sort((a, b) => b.pts - a.pts)
      add(null, 'unit_QB', units.QB[0] ? Math.round(units.QB[0].pts * mult * 10) / 10 : 0)

      // RB
      units.RB.sort((a, b) => b.pts - a.pts)
      let rbRaw = 0
      for (let i = 0; i < Math.min(units.RB.length, RB_WEIGHTS.length); i++) rbRaw += units.RB[i].pts * RB_WEIGHTS[i]
      add(null, 'unit_RB', Math.round(rbRaw * mult * 10) / 10)

      // WR
      units.WR.sort((a, b) => b.pts - a.pts)
      let wrRaw = 0
      for (let i = 0; i < Math.min(units.WR.length, WR_WEIGHTS.length); i++) wrRaw += units.WR[i].pts * WR_WEIGHTS[i]
      add(null, 'unit_WR', Math.round(wrRaw * mult * 10) / 10)

      // TE
      units.TE.sort((a, b) => b.pts - a.pts)
      let teRaw = 0
      for (let i = 0; i < Math.min(units.TE.length, TE_WEIGHTS.length); i++) teRaw += units.TE[i].pts * TE_WEIGHTS[i]
      add(null, 'unit_TE', Math.round(teRaw * mult * 10) / 10)
      console.log(`[TE] ${school} wk${week}: ${units.TE.length} TEs → ${teRaw.toFixed(1)} raw pts (top: ${units.TE[0]?.name ?? 'none'})`)

      // DEF
      const defRaw = (ts.sacks||0)*SCORING.sack + (ts.passesIntercepted||0)*SCORING.defInt
        + (ts.fumblesRecovered||0)*SCORING.fumRec + ((ts.interceptionTDs||0)+(ts.fumbleReturnTDs||0))*SCORING.defTd
      add(null, 'unit_DEF', Math.round(defRaw * mult * 10) / 10)

      // K
      units.K.sort((a, b) => b.pts - a.pts)
      add(null, 'unit_K', units.K[0] ? Math.round(units.K[0].pts * mult * 10) / 10 : 0)

      // ── Persist: delete old rows for this school+game, insert fresh ───────
      await db.from('cached_stats').delete().eq('game_id', gameId).eq('school', school)
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from('cached_stats').insert(rows.slice(i, i + 500))
        if (error) throw error
      }
      total += rows.length
    }
  }

  await logSync(`syncStats:${season}:w${week}`, 'success', total)
  return total
}

// ─── getActiveGames ──────────────────────────────────────────────────────────
export async function getActiveGames(): Promise<any[]> {
  const db = createAdminClient()
  const { data } = await db.from('cached_scores').select('*').eq('status', 'in_progress').order('start_time')
  return data ?? []
}