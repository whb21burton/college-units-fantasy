export interface Team {
  id: string
  name: string
  seed: number
  logo_url?: string
  record?: string
  conference?: string
}

export interface TournamentMatchup {
  id: string
  contest_id: string
  region: string
  round: 'regional_winners' | 'regional_losers' | 'regional_final' | 'super_regional' | 'championship'
  matchup_index: number
  team1: Team | null
  team2: Team | null
  winner: Team | null
  series_result: '2-0' | '2-1' | null
  status: 'upcoming' | 'active' | 'completed'
}

export interface UserBracketEntry {
  id: string
  contest_id: string
  user_id: string
  entry_name: string
  total_score: number
  correct_picks: number
  is_submitted: boolean
  is_locked: boolean
  submitted_at: string | null
}

export interface UserBracketPick {
  id: string
  entry_id: string
  matchup_id: string
  picked_team: Team
  predicted_series: '2-0' | '2-1' | null
  is_correct: boolean | null
  points_earned: number
}

export interface ScoringConfig {
  regional_win: number
  super_regional_win: number
  championship_win: number
  exact_series_bonus: number
}

export const DEFAULT_SCORING: ScoringConfig = {
  regional_win: 10,
  super_regional_win: 20,
  championship_win: 40,
  exact_series_bonus: 5,
}
