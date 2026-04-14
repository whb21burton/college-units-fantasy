// scripts/fix-def-scores.ts
// Fetches /games/teams from CFBD for each week, inserts def_sacks/def_ints/etc. rows,
// and recalculates unit_DEF scores from the raw components.
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const CFBD_KEY = process.env.CFBD_API_KEY!
if (!CFBD_KEY) throw new Error('CFBD_API_KEY not set')

async function cfbdGet(path: string, params: Record<string, string | number>): Promise<any[]> {
  const url = new URL(`https://api.collegefootballdata.com${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${CFBD_KEY}`, Accept: 'application/json' },
  })
  if (!res.ok) { console.warn(`CFBD ${path} → ${res.status}`); return [] }
  return res.json() as Promise<any[]>
}

function odrMult(rank: number): number {
  if (rank <=   5) return 1.3
  if (rank <=  10) return 1.2
  if (rank <=  15) return 1.1
  if (rank <=  25) return 1.0
  if (rank <=  35) return 0.9
  if (rank <=  50) return 0.8
  if (rank <=  80) return 0.7
  if (rank <= 100) return 0.6
  return 0.5
}

async function main() {
  const SEASON = 2025
  const WEEKS  = [1,2,3,4,5,6,7,8,9,10,11,12,13,14]

  let inserted = 0, fixed = 0, verified = 0

  for (const week of WEEKS) {
    console.log(`\n── Week ${week} ──`)

    // Get all schools that have unit_DEF for this week
    const { data: defRows } = await db
      .from('cached_stats')
      .select('game_id, school, value')
      .eq('stat_type', 'unit_DEF')
      .eq('season', SEASON)
      .eq('week', week)
      .is('player_name', null)

    if (!defRows?.length) { console.log('  No unit_DEF rows'); continue }

    // Fetch CFBD team stats + Elo for this week
    const [teamStats, eloData] = await Promise.all([
      cfbdGet('/games/teams', { year: SEASON, week }),
      cfbdGet('/ratings/elo', { year: SEASON, week }).catch(() => []),
    ])

    // Build team stat map: school → { category: value }
    const tsMap: Record<string, Record<string, number>> = {}
    for (const game of teamStats) {
      for (const team of game.teams ?? []) {
        const s = team.school ?? team.team ?? ''
        if (!s) continue
        tsMap[s] ??= {}
        for (const stat of team.stats ?? []) {
          tsMap[s][stat.category] = parseFloat(stat.stat) || 0
        }
      }
    }

    // Elo rank map (for opponent multiplier)
    const eloRank: Record<string, number> = {}
    ;[...eloData].sort((a: any, b: any) => (b.elo ?? 0) - (a.elo ?? 0))
      .forEach((t: any, i: number) => { if (t.team) eloRank[t.team] = i + 1 })

    // Log field names once to verify CFBD category names
    const firstTeam = Object.keys(tsMap)[0]
    if (firstTeam) {
      console.log(`  CFBD categories (${firstTeam}): ${Object.keys(tsMap[firstTeam]).join(', ')}`)
    }

    for (const row of defRows) {
      const { game_id, school } = row
      const ts = tsMap[school] ?? {}

      const sacks    = ts['sacks']             ?? ts['Sacks']             ?? 0
      const defInts  = ts['passesIntercepted'] ?? ts['Interceptions']     ?? ts['interceptions'] ?? 0
      const fumRec   = ts['fumblesRecovered']  ?? ts['Fumbles Recovered'] ?? 0
      const defTDs   = (ts['interceptionTDs']  ?? 0) + (ts['fumbleReturnTDs'] ?? 0) + (ts['defensiveTDs'] ?? 0)
      const safety   = ts['safeties']          ?? 0
      const defRaw   = sacks*1 + defInts*2 + fumRec*2 + defTDs*6 + safety*2

      if (!Object.keys(ts).length) {
        console.log(`  ⚠ ${school}: no CFBD team stats`)
        continue
      }

      // Upsert individual DEF stat rows
      const defStatRows = [
        { game_id, school, week, season: SEASON, stat_type: 'def_sacks',    value: sacks,   player_name: null, updated_at: new Date().toISOString() },
        { game_id, school, week, season: SEASON, stat_type: 'def_ints',     value: defInts, player_name: null, updated_at: new Date().toISOString() },
        { game_id, school, week, season: SEASON, stat_type: 'def_fum_rec',  value: fumRec,  player_name: null, updated_at: new Date().toISOString() },
        { game_id, school, week, season: SEASON, stat_type: 'def_tds',      value: defTDs,  player_name: null, updated_at: new Date().toISOString() },
        { game_id, school, week, season: SEASON, stat_type: 'def_safeties', value: safety,  player_name: null, updated_at: new Date().toISOString() },
      ]
      const { error: upsertErr } = await db.from('cached_stats')
        .upsert(defStatRows, { onConflict: 'game_id,school,stat_type,player_name' })
      if (upsertErr) console.error(`  ✗ upsert ${school}:`, upsertErr.message)
      else inserted += 5

      // Get stored game_mult
      const { data: multRow } = await db
        .from('cached_stats')
        .select('value')
        .eq('game_id', game_id)
        .eq('school', school)
        .eq('stat_type', 'game_mult')
        .is('player_name', null)
        .maybeSingle()

      const mult       = multRow?.value ?? 1.0
      const finalScore = Math.round(defRaw * mult * 10) / 10

      if (Math.abs(finalScore - row.value) > 0.05) {
        await db.from('cached_stats')
          .update({ value: finalScore })
          .eq('game_id', game_id)
          .eq('school', school)
          .eq('stat_type', 'unit_DEF')
          .is('player_name', null)
        console.log(`  ✅ ${school}: ${row.value} → ${finalScore}  (sacks=${sacks} ints=${defInts} fumRec=${fumRec} td=${defTDs} safety=${safety})`)
        fixed++
      } else {
        verified++
      }
    }

    // Brief pause between weeks to avoid rate limiting
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n── Done ──`)
  console.log(`Inserted breakdown rows: ${inserted}`)
  console.log(`Scores fixed: ${fixed} | Already correct: ${verified}`)
}

main().catch(console.error)
