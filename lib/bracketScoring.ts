export const BRACKET_SCORING = {
  regional:       3,   // 3 pts per correct regional winner
  super_regional: 5,   // 5 pts per correct super regional winner
  cws_semifinal:  10,  // 10 pts per correct CWS semifinal winner
  championship:   15,  // 15 pts for national champion
  series_bonus:   5,   // 5 bonus pts for correct series result (only if winner correct)
}

export function calculateBracketScore(picks: any): number {
  // Actual scoring happens server-side in complete/route.ts
  return 0
}

export async function recalculateAllScores(contestId: string, admin: any): Promise<void> {
  const { data: entries } = await admin
    .from('user_bracket_entries')
    .select('id, bracket_data')
    .eq('contest_id', contestId)

  if (!entries?.length) return

  const { data: matchups } = await admin
    .from('tournament_matchups')
    .select('*')
    .eq('contest_id', contestId)

  for (const entry of entries) {
    const picks = entry.bracket_data ?? {}
    let score = 0

    for (const matchup of matchups ?? []) {
      if (!matchup.winner) continue

      if (['regional_winners', 'regional_losers', 'regional_final'].includes(matchup.round)) {
        const pick = picks.regionals?.[matchup.region]
        if (pick?.id === matchup.winner?.id) score += BRACKET_SCORING.regional
      }

      if (matchup.round === 'super_regional') {
        const pick = picks.superRegionals?.[matchup.matchup_index]
        if (pick?.id === matchup.winner?.id) score += BRACKET_SCORING.super_regional
      }

      if (matchup.round === 'championship' && matchup.matchup_index < 2) {
        const pick = picks.semifinals?.[matchup.matchup_index]
        if (pick?.id === matchup.winner?.id) score += BRACKET_SCORING.cws_semifinal
      }

      if (matchup.round === 'championship' && matchup.matchup_index === 2) {
        if (picks.champion?.id === matchup.winner?.id) {
          score += BRACKET_SCORING.championship
          if (picks.seriesResult && picks.seriesResult === matchup.series_result) {
            score += BRACKET_SCORING.series_bonus
          }
        }
      }
    }

    await admin
      .from('user_bracket_entries')
      .update({ total_score: score, correct_picks: score })
      .eq('id', entry.id)
  }
}
