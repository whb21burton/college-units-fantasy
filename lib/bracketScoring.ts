import type { UserBracketPick, TournamentMatchup } from './bracketTypes'

export function calculateBracketScore(
  picks: UserBracketPick[],
  matchups: TournamentMatchup[],
): number {
  let score = 0
  for (const pick of picks) {
    const matchup = matchups.find(m => m.id === pick.matchup_id)
    if (!matchup?.winner) continue
    if (matchup.winner.id === pick.picked_team.id) score += 1
  }
  return score
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

  for (const entry of entries) {
    const { data: picks } = await admin
      .from('user_bracket_picks')
      .select('*')
      .eq('entry_id', entry.id)

    if (!picks) continue
    const score = calculateBracketScore(picks, matchups ?? [])

    for (const pick of picks) {
      const matchup = (matchups ?? []).find((m: any) => m.id === pick.matchup_id)
      if (!matchup?.winner) continue
      const correct = matchup.winner.id === pick.picked_team.id
      await admin.from('user_bracket_picks')
        .update({ is_correct: correct, points_earned: correct ? 1 : 0 })
        .eq('id', pick.id)
    }

    await admin.from('user_bracket_entries')
      .update({ total_score: score, correct_picks: score })
      .eq('id', entry.id)
  }
}
