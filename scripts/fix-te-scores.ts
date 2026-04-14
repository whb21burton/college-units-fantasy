// scripts/fix-te-scores.ts
// Fixes unit_TE = 0 rows in cached_stats by recalculating from individual
// receiving stats cross-referenced with cached_players positions.
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Get all school+week combos where unit_TE = 0 but receiving stats exist
  const { data: zeroTE } = await supabase
    .from('cached_stats')
    .select('game_id, school, week, season')
    .eq('stat_type', 'unit_TE')
    .eq('value', 0)
    .eq('season', 2025)
    .is('player_name', null)

  console.log(`Found ${zeroTE?.length ?? 0} school+week combos with unit_TE = 0`)

  let fixed = 0
  let skipped = 0

  for (const row of zeroTE ?? []) {
    const { game_id, school, week, season } = row

    // Get all receiving stats for this school+game
    const { data: recvStats } = await supabase
      .from('cached_stats')
      .select('player_name, stat_type, value')
      .eq('game_id', game_id)
      .eq('school', school)
      .eq('season', season)
      .in('stat_type', ['receiving_YDS', 'receiving_REC', 'receiving_TD'])
      .not('player_name', 'is', null)

    if (!recvStats?.length) { skipped++; continue }

    // Get TE players for this school from cached_players
    const { data: tePlayers } = await supabase
      .from('cached_players')
      .select('player_name')
      .eq('school', school)
      .eq('position', 'TE')
      .eq('season', 2025)

    const teNames = new Set((tePlayers ?? []).map((p: any) => p.player_name))
    if (!teNames.size) { skipped++; continue }

    // Build per-player receiving totals
    const playerMap: Record<string, { yds: number; rec: number; td: number }> = {}
    for (const s of recvStats) {
      if (!s.player_name) continue
      if (!playerMap[s.player_name]) playerMap[s.player_name] = { yds: 0, rec: 0, td: 0 }
      if (s.stat_type === 'receiving_YDS') playerMap[s.player_name].yds = s.value
      if (s.stat_type === 'receiving_REC') playerMap[s.player_name].rec = s.value
      if (s.stat_type === 'receiving_TD')  playerMap[s.player_name].td  = s.value
    }

    // Filter to only TE players
    const teStats = Object.entries(playerMap)
      .filter(([name]) => teNames.has(name))
      .map(([name, s]) => ({ name, pts: s.yds * 0.1 + s.rec * 1.0 + s.td * 6 }))
      .sort((a, b) => b.pts - a.pts)

    if (!teStats.length) { skipped++; continue }

    // Apply weights
    const te1 = teStats[0]?.pts ?? 0
    const te2 = teStats[1]?.pts ?? 0
    const teRaw = (te1 * 1.0) + (te2 * 0.5)

    // Get game_mult
    const { data: multRow } = await supabase
      .from('cached_stats')
      .select('value')
      .eq('game_id', game_id)
      .eq('school', school)
      .eq('stat_type', 'game_mult')
      .is('player_name', null)
      .single()

    const mult = multRow?.value ?? 1.0
    const finalScore = Math.round(teRaw * mult * 10) / 10

    if (finalScore === 0) { skipped++; continue }

    // Update unit_TE
    await supabase
      .from('cached_stats')
      .update({ value: finalScore })
      .eq('game_id', game_id)
      .eq('school', school)
      .eq('stat_type', 'unit_TE')
      .is('player_name', null)

    console.log(`✓ Fixed ${school} wk${week}: TE1=${teStats[0]?.name}(${te1.toFixed(1)}) TE2=${teStats[1]?.name ?? 'none'}(${te2.toFixed(1)}) → ${finalScore}`)
    fixed++
  }

  console.log(`\nDone. Fixed: ${fixed}, Skipped (no TE data): ${skipped}`)

  // Final report
  const { data: stillZero } = await supabase
    .from('cached_stats')
    .select('school, week')
    .eq('stat_type', 'unit_TE')
    .eq('value', 0)
    .eq('season', 2025)
    .is('player_name', null)

  console.log(`\nStill zero: ${stillZero?.length ?? 0} combos`)
  if (stillZero?.length) {
    const bySchool: Record<string, number[]> = {}
    for (const r of stillZero) {
      if (!bySchool[r.school]) bySchool[r.school] = []
      bySchool[r.school].push(r.week)
    }
    for (const [school, weeks] of Object.entries(bySchool)) {
      console.log(`  ${school}: weeks ${weeks.sort((a, b) => a - b).join(',')}`)
    }
  }
}

main().catch(console.error)
