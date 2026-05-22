// POST /api/admin/espn-sync
// Body: { contestId: string, dateStr?: string, fullScan?: boolean }
// Fetches ESPN data, upserts tournament_matchups, suggests pending_advancements
// NEVER auto-advances teams — only suggests

import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { fetchTournamentGames, fetchTournamentRange, type ESPNGame } from '@/services/espnBaseballService'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { contestId, dateStr, fullScan } = await req.json()
  if (!contestId) return NextResponse.json({ error: 'contestId required' }, { status: 400 })

  const admin  = createAdminClient()
  const start  = Date.now()
  const errors: string[] = []
  let gamesUpdated         = 0
  let advancementsSuggested = 0

  try {
    let games: ESPNGame[]
    if (fullScan) {
      games = await fetchTournamentRange('20250530', '20250624')
    } else if (dateStr) {
      games = await fetchTournamentGames(dateStr)
    } else {
      games = await fetchTournamentGames()
    }

    console.log(`[espn-sync] Fetched ${games.length} tournament games`)

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

        if (upsertErr) {
          errors.push(`Game ${game.espnGameId}: ${upsertErr.message}`)
          continue
        }
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
              .select('id, status')
              .eq('matchup_id', matchup.id)
              .maybeSingle()

            if (!existing) {
              await admin.from('pending_advancements').insert({
                contest_id:      contestId,
                matchup_id:      matchup.id,
                round_type:      game.roundType ?? 'regional',
                advancing_team:  game.winner,
                from_region:     game.regionalName,
                status:          'pending',
              })
              advancementsSuggested++
            }
          }
        }
      } catch (e: any) {
        errors.push(`Game ${game.espnGameId}: ${e.message}`)
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

    return NextResponse.json({
      success:               true,
      gamesFetched:          games.length,
      gamesUpdated,
      advancementsSuggested,
      errors,
      durationMs:            Date.now() - start,
    })
  } catch (e: any) {
    console.error('[espn-sync] Fatal error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
