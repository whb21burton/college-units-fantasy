// GET /api/cron/espn-cws
// Vercel cron: */5 * * * * (every 5 min during CWS)
// Syncs ESPN data for all open baseball bracket contests

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { fetchTournamentGames, type ESPNGame } from '@/services/espnBaseballService'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: contests } = await admin
    .from('bracket_contests')
    .select('id')
    .eq('sport', 'baseball')
    .eq('status', 'open')

  if (!contests || contests.length === 0) {
    return NextResponse.json({ message: 'No open baseball contests' })
  }

  const games: ESPNGame[] = await fetchTournamentGames()
  const results: Record<string, any> = {}

  for (const contest of contests) {
    const contestId = contest.id
    const start = Date.now()
    let gamesUpdated = 0
    let advancementsSuggested = 0
    const errors: string[] = []

    for (const game of games) {
      try {
        const { error: upsertErr } = await admin
          .from('tournament_matchups')
          .upsert({
            contest_id:      contestId,
            espn_game_id:    game.espnGameId,
            round_type:      game.roundType ?? 'regional',
            regional_name:   game.regionalName,
            home_team:       game.homeTeam,
            away_team:       game.awayTeam,
            home_score:      game.homeTeam.score,
            away_score:      game.awayTeam.score,
            game_status:     game.status,
            inning_detail:   game.inningDetail,
            winner:          game.winner,
            scheduled_start: game.scheduledStart,
            completed_at:    game.completedAt,
            espn_raw:        { note: game.tournamentNote, venue: game.venue, wasSuspended: game.wasSuspended },
            updated_at:      new Date().toISOString(),
          }, { onConflict: 'espn_game_id' })

        if (upsertErr) { errors.push(`${game.espnGameId}: ${upsertErr.message}`); continue }
        gamesUpdated++

        if (game.status === 'final' && game.winner) {
          const { data: matchup } = await admin
            .from('tournament_matchups')
            .select('id')
            .eq('espn_game_id', game.espnGameId)
            .single()

          if (matchup) {
            const { data: existing } = await admin
              .from('pending_advancements')
              .select('id')
              .eq('matchup_id', matchup.id)
              .maybeSingle()

            if (!existing) {
              await admin.from('pending_advancements').insert({
                contest_id:     contestId,
                matchup_id:     matchup.id,
                round_type:     game.roundType ?? 'regional',
                advancing_team: game.winner,
                from_region:    game.regionalName,
                status:         'pending',
              })
              advancementsSuggested++
            }
          }
        }
      } catch (e: any) {
        errors.push(`${game.espnGameId}: ${e.message}`)
      }
    }

    await admin.from('espn_sync_log').insert({
      contest_id:             contestId,
      games_fetched:          games.length,
      games_updated:          gamesUpdated,
      advancements_suggested: advancementsSuggested,
      errors,
      duration_ms:            Date.now() - start,
    })

    results[contestId] = { gamesUpdated, advancementsSuggested, errors: errors.length }
  }

  return NextResponse.json({ success: true, contests: contests.length, results })
}
