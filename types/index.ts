// ============================================================
// COLLEGE UNITS FANTASY — shared types
// ============================================================

export type LeagueStatus = 'forming' | 'drafting' | 'active' | 'playoffs' | 'complete';
export type DraftType    = 'snake' | 'salary';

export interface Profile {
  id:           string;
  display_name: string | null;
  avatar_url:   string | null;
  created_at:   string;
}

export interface League {
  id:              string;
  name:            string;
  commissioner_id: string;
  invite_code:     string;
  buy_in:          number;     // dollars; 0 = free
  league_size:     number;     // 4 | 6 | 8 | 10 | 12
  draft_type:      DraftType;
  salary_cap:      number;
  status:          LeagueStatus;
  current_week:    number;
  draft_order:     string[];
  settings:        Record<string, unknown>;
  created_at:      string;
  // joined from profiles:
  commissioner?:   Profile;
  // joined from league_members:
  members?:        LeagueMember[];
}

export interface LeagueMember {
  id:          string;
  league_id:   string;
  user_id:     string;
  team_name:   string;
  roster:      Player[];
  paid:        boolean;
  draft_slot:  number | null;
  joined_at:   string;
  // joined:
  profile?:    Profile;
}

export interface Player {
  id:          string;
  name:        string;
  type:        'QB' | 'RB' | 'WR' | 'TE' | 'DEF' | 'K';
  school:      string;
  projAvg:     number;
  projBase?:   number;
  salary:      number;
  depthRank?:  number;
  typeRank?:   number;
  overallRank?: number;
}

export interface DraftPick {
  id:          string;
  league_id:   string;
  user_id:     string;
  player_id:   string;
  player_data: Player;
  round:       number;
  pick_number: number;
  picked_at:   string;
}

export interface WeeklyScore {
  id:           string;
  league_id:    string;
  user_id:      string;
  week:         number;
  score:        number;
  calculated_at: string;
}

export interface Matchup {
  id:          string;
  league_id:   string;
  week:        number;
  team1_id:    string;
  team2_id:    string | null;
  team1_score: number;
  team2_score: number;
  winner_id:   string | null;
}

// ── Form types ───────────────────────────────────────────────
export interface CreateLeagueFormData {
  name:        string;
  buy_in:      number;
  league_size: number;
  draft_type:  DraftType;
  salary_cap:  number;
  team_name:   string;   // commissioner's own team name
}

export interface JoinLeagueFormData {
  team_name:  string;
}

// ── API response types ───────────────────────────────────────
export interface ApiSuccess<T> {
  data:  T;
  error: null;
}
export interface ApiError {
  data:  null;
  error: string;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
