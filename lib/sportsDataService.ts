/**
 * lib/sportsDataService.ts
 * ONLY file that calls CFBD API directly.
 * Simple pipeline: fetch roster → assign positions → score by unit → store
 */

import { createAdminClient } from '@/lib/supabase-server'
import { odrMult, odrMultSafe } from '@/lib/odr'


const BASE_URL = 'https://apinext.collegefootballdata.com'

// Maps your CONFERENCES display names → CFBD API school names
// Used when fetching stats so CFBD returns the right data
// Storage always uses YOUR display name (left side)
const CFBD_NAME: Record<string, string> = {
  'UConn':    'Connecticut',
  'Cal':      'California',
}

// Reverse map: CFBD name → your display name
// Used when storing stats so everything uses your canonical name
const YOUR_NAME: Record<string, string> = {
  'Connecticut': 'UConn',
  'California':  'Cal',
}

const SCORING = {
  passYd: 0.1, passTd: 4, int: -3,       // INT now -3
  rushYd: 0.1, rushTd: 6,
  recYd:  0.1, rec:  0,   recTd: 6,      // REC removed, total yds × 0.1 only
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
      home_team: YOUR_NAME[g.homeTeam] ?? g.homeTeam,
      away_team: YOUR_NAME[g.awayTeam] ?? g.awayTeam,
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
        game_id: String(g.id), home_team: YOUR_NAME[g.homeTeam] ?? g.homeTeam, away_team: YOUR_NAME[g.awayTeam] ?? g.awayTeam,
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
  // SP+ comes from sp_ratings table (updated by cron); fall back to live CFBD only if empty
  const [games, playerStats, teamStats, eloData, storedRatings] = await Promise.all([
    cfbdGet('/games',         { year: season, week }),
    cfbdGet('/games/players', { year: season, week }).catch(() => []),
    cfbdGet('/games/teams',   { year: season, week }).catch(() => []),
    cfbdGet('/ratings/elo',   { year: season, week }).catch(() => []),
    db.from('sp_ratings').select('school, def_rank, off_rank').eq('season', season),
  ])

  const completedGames = games.filter((g: any) =>
    g.homePoints != null && g.awayPoints != null && g.seasonType === 'regular'
  )
  if (!completedGames.length) return 0

  // 2. Elo rank map
  const eloRank: Record<string, number> = {}
  ;[...eloData].sort((a: any, b: any) => (b.elo ?? 0) - (a.elo ?? 0))
    .forEach((t: any, i: number) => { if (t.team) eloRank[t.team] = i + 1 })

  // SP+ defensive and offensive rank maps — stored table first, live CFBD fallback
  const defRankMap: Record<string, number> = {}
  const offRankMap: Record<string, number> = {}
  if (storedRatings.data && storedRatings.data.length > 0) {
    for (const r of storedRatings.data) {
      defRankMap[r.school] = r.def_rank
      offRankMap[r.school] = r.off_rank
    }
  } else {
    const spData = await cfbdGet('/ratings/sp', { year: season }).catch(() => [])
    for (const t of spData as any[]) {
      if (t.team) {
        if (t.defense?.ranking != null) defRankMap[t.team] = t.defense.ranking
        else if (t.defense?.rank != null) defRankMap[t.team] = t.defense.rank
        if (t.offense?.ranking != null) offRankMap[t.team] = t.offense.ranking
        else if (t.offense?.rank != null) offRankMap[t.team] = t.offense.rank
      }
    }
  }

  function getOdrMultForUnit(position: string, opponent: string, school: string): number {
    if (position === 'DEF') {
      const offRank = offRankMap[opponent] ?? eloRank[opponent] ?? null
      if (offRank == null) return odrMult(999)  // FCS/unknown → 0.40
      return odrMult(offRank)
    }
    const defRank = defRankMap[opponent] ?? eloRank[opponent] ?? null
    if (defRank == null) return odrMult(999)  // FCS/unknown → 0.40
    return odrMult(defRank)
  }

  // 3. Team stats map: school → { category: value }
  const teamStatMap: Record<string, Record<string, number>> = {}
  for (const game of teamStats) {
    for (const team of game.teams ?? []) {
      const rawS = team.school ?? team.team ?? ''
      if (!rawS) continue
      const s = YOUR_NAME[rawS] ?? rawS
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
      const rawS = team.school ?? team.team ?? ''
      if (!rawS) continue
      // Translate CFBD name to your canonical name
      const s = YOUR_NAME[rawS] ?? rawS
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
  // Use cached_players as single source of truth — consistent with breakdown API
  // This avoids 130+ CFBD API calls per sync run
  const posLookup: Record<string, string> = {}

  // Fetch all player positions using pagination (Supabase default limit is 1000)
  let cachedPlayerRows: any[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data: page, error: pageErr } = await db
      .from('season_rosters')
      .select('school, player_name, position')
      .in('school', allSchools)
      .eq('season', season)
      .range(from, from + PAGE - 1)
    if (pageErr || !page?.length) break
    cachedPlayerRows = cachedPlayerRows.concat(page)
    if (page.length < PAGE) break
    from += PAGE
  }
  console.log(`[playerRows] total rows: ${cachedPlayerRows.length}`)
  const washRows = cachedPlayerRows.filter((p: any) => p.school === 'Washington')
  console.log(`[playerRows] Washington rows: ${washRows.length}`)
  const adamRow = washRows.find((p: any) => p.player_name === 'Adam Mohammed')
  console.log(`[playerRows] Adam Mohammed:`, adamRow ?? 'NOT FOUND')

  for (const p of cachedPlayerRows ?? []) {
    if (!p.player_name || !p.position || !p.school) continue
    const exact = `${p.school}||${p.player_name}`
    const norm  = `${p.school}||${p.player_name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()}`
    posLookup[exact] = p.position
    posLookup[norm]  = p.position
  }

  const teInLookup = Object.values(posLookup).filter(p => p === 'TE').length
  if (teInLookup === 0) {
    console.error('[posLookup] WARNING: 0 TEs found — cached_players may be empty for this season')
  }

  // Helper: look up a player's position
  const getPos = (school: string, name: string): string | null => {
    return posLookup[`${school}||${name}`]
      ?? posLookup[`${school}||${name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()}`]
      ?? null
  }

  // 7. Process each game
  for (const game of completedGames) {
    const gameId = String(game.id)

    for (const rawSchool of [game.homeTeam, game.awayTeam] as string[]) {
      // Translate CFBD name to your display name if needed
      const school = YOUR_NAME[rawSchool] ?? rawSchool
      if (schoolsFilter?.length && !schoolsFilter.includes(school)) continue

      const opponent = YOUR_NAME[rawSchool === game.homeTeam ? game.awayTeam : game.homeTeam]
        ?? (rawSchool === game.homeTeam ? game.awayTeam : game.homeTeam)
      const offMult   = getOdrMultForUnit('QB',  opponent, school)  // skill units vs opponent defense
      const defMult   = getOdrMultForUnit('DEF', opponent, school)  // DEF unit vs opponent offense
      const dispRank = defRankMap[opponent] ?? eloRank[opponent] ?? 999
      const mult = odrMult(dispRank)
      const ts = teamStatMap[school] ?? {}
      const entries = Object.values(playerStatMap)
        .filter((e: any) => e.gameId === gameId && e.school === school)

      const rows: any[] = []
      // Round half up to 2 decimal places
      const roundHalfUp = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
      const add = (playerName: string | null, statType: string, value: number) => {
        rows.push({
          game_id: gameId, school, player_name: playerName,
          week, season, stat_type: statType,
          value: roundHalfUp(value),
          updated_at: new Date().toISOString(),
        })
      }

      // ── Per-player: store raw stats + assign to unit ──────────────────────
      type Unit = 'QB' | 'RB' | 'WR' | 'TE' | 'K'
      const units: Record<Unit, Array<{ name: string; pts: number }>> = {
        QB: [], RB: [], WR: [], TE: [], K: [],
      }

        // Filter out junk/team-level entries
        const JUNK_NAMES = new Set(['Team', ' Team', 'team', 'TEAM'])
        const names = Array.from(new Set<string>(
          entries.map((e: any) => e.name)
            .filter((n: string) => Boolean(n) && !JUNK_NAMES.has(n.trim()))
        ))

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

        // Position from roster is the ONLY source of truth
        // A player can only be ONE position — no splitting across units
        const pos = getPos(school, name)
        let unit: Unit | null = null

        if (pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE' || pos === 'K') {
          unit = pos
        } else if (!pos) {
          // No position found in cached_players — skip this player entirely
          // This ensures sync and breakdown use identical player sets
          continue
        }

        if (!unit) continue

        // Calculate raw fantasy points
        let pts = 0
        if (unit === 'QB') {
          pts = (passE ? (passE.YDS||0)*SCORING.passYd + (passE.TD||0)*SCORING.passTd + (passE.INT||0)*SCORING.int : 0)
              + (rushE ? (rushE.YDS||0)*SCORING.rushYd + (rushE.TD||0)*SCORING.rushTd : 0)
        } else if (unit === 'RB') {
          // Rush yds + recv yds × 0.1 + any TD × 6 + pass TD × 4
          pts = (rushE ? (rushE.YDS||0)*SCORING.rushYd + (rushE.TD||0)*SCORING.rushTd : 0)
              + (recvE ? (recvE.YDS||0)*SCORING.recYd + (recvE.TD||0)*SCORING.recTd : 0)
              + (passE ? (passE.TD||0)*SCORING.passTd : 0)
        } else if (unit === 'WR' || unit === 'TE') {
          // Total yards (rushing + receiving) × 0.1 + any TD × 6 + pass TD × 4
          const totalYds = (recvE?.YDS||0) + (rushE?.YDS||0)
          const totalTds = (recvE?.TD||0) + (rushE?.TD||0)
          const passTds  = passE ? (passE.TD||0)*SCORING.passTd : 0
          pts = totalYds * SCORING.recYd + totalTds * SCORING.recTd + passTds
        } else if (unit === 'K') {
          // Base kicking points (FGs + PATs made)
          const madePts   = kickE?.PTS || 0
          // Missed kicks penalties
          const missedFG  = kickE?.['FG_MISS']  ?? kickE?.['XPM_MISS'] ?? 0
          const missedPAT = kickE?.['PAT_MISS']  ?? kickE?.['XPA_MISS'] ?? 0
          // Kicker TDs (rare but possible)
          const kPassTd   = passE ? (passE.TD||0)*4 : 0
          const kRushTd   = rushE ? (rushE.TD||0)*6 : 0
          const kTwoPt    = 0 // two-point conversions not tracked by CFBD
          pts = madePts - (missedFG * 1) - (missedPAT * 2) + kPassTd + kRushTd + kTwoPt
        }

        units[unit].push({ name, pts })
      }

      // ── Score each unit ───────────────────────────────────────────────────
      add(null, 'game_mult', mult)
      const roundHU = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

      // QB — top scorer only — store RAW pts, ODR applied at display time
      units.QB.sort((a, b) => b.pts - a.pts)
      add(null, 'unit_QB', units.QB[0] ? roundHU(units.QB[0].pts) : 0)

      // RB
      units.RB.sort((a, b) => b.pts - a.pts)
      const rbTop3 = units.RB.slice(0, 3) // HARD CAP: top 3 only
      let rbRaw = 0
      for (let i = 0; i < rbTop3.length; i++) rbRaw += rbTop3[i].pts * RB_WEIGHTS[i]
      add(null, 'unit_RB', roundHU(rbRaw))

      // WR
      units.WR.sort((a, b) => b.pts - a.pts)
      const wrTop3 = units.WR.slice(0, 3) // HARD CAP: top 3 only
      let wrRaw = 0
      for (let i = 0; i < wrTop3.length; i++) wrRaw += wrTop3[i].pts * WR_WEIGHTS[i]
      add(null, 'unit_WR', roundHU(wrRaw))

      // TE
      units.TE.sort((a, b) => b.pts - a.pts)
      const teTop2 = units.TE.slice(0, 2) // HARD CAP: top 2 only
      let teRaw = 0
      for (let i = 0; i < teTop2.length; i++) teRaw += teTop2[i].pts * TE_WEIGHTS[i]
      add(null, 'unit_TE', roundHU(teRaw))

      // DEF — fallback field names handle CFBD's inconsistent casing
      const defSacks  = ts['sacks']             ?? ts['Sacks']             ?? 0
      const defInts   = ts['passesIntercepted'] ?? ts['Interceptions']     ?? ts['interceptions'] ?? 0
      const defFumRec = ts['fumblesRecovered']  ?? ts['Fumbles Recovered'] ?? 0
      const defTDs    = (ts['interceptionTDs']  ?? 0) + (ts['fumbleReturnTDs'] ?? 0) + (ts['defensiveTDs'] ?? 0)
      const defSafety = ts['safeties']          ?? 0

      // Points allowed bonus
      const oppScore  = school === game.homeTeam
        ? (game.awayPoints ?? game.awayScore ?? -1)
        : (game.homePoints ?? game.homeScore ?? -1)
      const ptsAllowedBonus =
        oppScore < 0  ?  0 :   // unknown
        oppScore === 0 ? 10 :
        oppScore <= 5  ?  8 :
        oppScore <= 10 ?  6 :
        oppScore <= 15 ?  4 :
        oppScore <= 20 ?  2 : 0

      const defRaw = defSacks*1 + defInts*2 + defFumRec*2 + defTDs*6 + defSafety*2 + ptsAllowedBonus
      add(null, 'unit_DEF', roundHU(defRaw))
      add(null, 'def_pts_allowed_bonus', ptsAllowedBonus)
      add(null, 'def_sacks',   defSacks)
      add(null, 'def_ints',    defInts)
      add(null, 'def_fum_rec', defFumRec)
      add(null, 'def_tds',     defTDs)
      add(null, 'def_safeties',defSafety)

      // K
      units.K.sort((a, b) => b.pts - a.pts)
      add(null, 'unit_K', units.K[0] ? roundHU(units.K[0].pts) : 0)

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

