import type { UserBracketPick, TournamentMatchup, ScoringConfig } from './bracketTypes'

export function calculateBracketScore(
  picks: UserBracketPick[],
  matchups: TournamentMatchup[],
  scoringConfig: ScoringConfig
): { score: number; correctPicks: number } {
  let score = 0
  let correctPicks = 0
  for (const pick of picks) {
    const matchup = matchups.find(m => m.id === pick.matchup_id)
    if (!matchup?.winner) continue
    const correct = matchup.winner.id === pick.picked_team.id
    if (!correct) continue
    correctPicks++
    const roundPoints: Record<string, number> = {
      regional_winners: scoringConfig.regional_win,
      regional_losers: scoringConfig.regional_win,
      regional_final: scoringConfig.regional_win,
      super_regional: scoringConfig.super_regional_win,
      championship: scoringConfig.championship_win,
    }
    score += roundPoints[matchup.round] ?? 0
    if (pick.predicted_series && pick.predicted_series === matchup.series_result) {
      score += scoringConfig.exact_series_bonus
    }
  }
  return { score, correctPicks }
}

export async function recalculateAllScores(contestId: string, admin: any): Promise<void> {
  const { data: entries } = await admin
    .from('user_bracket_entries')
    .select('id, user_id')
    .eq('contest_id', contestId)

  if (!entries?.length) return

  const { data: matchups } = await admin
    .from('tournament_matchups')
    .select('*')
    .eq('contest_id', contestId)

  const { data: scoringRow } = await admin
    .from('bracket_contests')
    .select('settings')
    .eq('id', contestId)
    .single()

  const scoringConfig: ScoringConfig = scoringRow?.settings?.scoring ?? {
    regional_win: 10,
    super_regional_win: 20,
    championship_win: 40,
    exact_series_bonus: 5,
  }

  for (const entry of entries) {
    const { data: picks } = await admin
      .from('user_bracket_picks')
      .select('*')
      .eq('entry_id', entry.id)

    if (!picks) continue
    const { score, correctPicks } = calculateBracketScore(picks, matchups ?? [], scoringConfig)

    // Update each pick's is_correct and points_earned
    for (const pick of picks) {
      const matchup = (matchups ?? []).find((m: any) => m.id === pick.matchup_id)
      if (!matchup?.winner) continue
      const correct = matchup.winner.id === pick.picked_team.id
      const roundPoints: Record<string, number> = {
        regional_winners: scoringConfig.regional_win,
        regional_losers: scoringConfig.regional_win,
        regional_final: scoringConfig.regional_win,
        super_regional: scoringConfig.super_regional_win,
        championship: scoringConfig.championship_win,
      }
      let pts = correct ? (roundPoints[matchup.round] ?? 0) : 0
      if (correct && pick.predicted_series && pick.predicted_series === matchup.series_result) {
        pts += scoringConfig.exact_series_bonus
      }
      await admin.from('user_bracket_picks')
        .update({ is_correct: correct, points_earned: pts })
        .eq('id', pick.id)
    }

    await admin.from('user_bracket_entries')
      .update({ total_score: score, correct_picks: correctPicks })
      .eq('id', entry.id)
  }
}
