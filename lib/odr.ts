/**
 * Shared ODR (Opponent Difficulty Rating) utilities — safe to use in both
 * server code and client components (no Supabase imports).
 */

export const FBS_TEAMS = new Set([
  // SEC
  'Alabama','Arkansas','Auburn','Florida','Georgia','Kentucky',
  'LSU','Mississippi State','Missouri','Ole Miss','South Carolina',
  'Tennessee','Texas','Texas A&M','Vanderbilt',
  // Big Ten
  'Illinois','Indiana','Iowa','Maryland','Michigan','Michigan State',
  'Minnesota','Nebraska','Northwestern','Ohio State','Oregon',
  'Penn State','Purdue','Rutgers','UCLA','USC','Washington','Wisconsin',
  // Big 12
  'Arizona','Arizona State','Baylor','BYU','Cincinnati','Colorado',
  'Houston','Iowa State','Kansas','Kansas State','Oklahoma State',
  'TCU','Texas Tech','UCF','Utah','West Virginia',
  // ACC
  'Boston College','California','Clemson','Duke','Florida State',
  'Georgia Tech','Louisville','Miami','NC State','North Carolina',
  'Pittsburgh','SMU','Stanford','Syracuse','Virginia','Virginia Tech',
  'Wake Forest',
  // FBS Independents
  'Army', 'Navy', 'Notre Dame', 'Liberty', 'New Mexico State',
  'UConn', 'UMass',
])

export function odrLabel(rank: number): string {
  if (rank <=   5) return 'Elite'
  if (rank <=  10) return 'Hard'
  if (rank <=  15) return 'Good'
  if (rank <=  25) return 'Average'
  if (rank <=  35) return 'Not Bad'
  if (rank <=  50) return 'Bad'
  if (rank <=  80) return 'Really Bad'
  if (rank <= 100) return 'Weenie Hut Jr.'
  return 'Super Weenie Hut Jr.'
}

export function odrMult(rank: number): number {
  if (rank <=   5) return 1.3
  if (rank <=  10) return 1.2
  if (rank <=  15) return 1.1
  if (rank <=  25) return 1.0
  if (rank <=  35) return 0.9
  if (rank <=  50) return 0.8
  if (rank <=  80) return 0.7
  if (rank <= 100) return 0.6
  if (rank <= 134) return 0.50  // bottom FBS
  return 0.40                   // FCS/non-FBS
}

/** Derive a label directly from the stored multiplier value. */
export function odrLabelFromMult(mult: number | null | undefined): string {
  if (mult == null) return '—'
  if (mult >= 1.3) return 'Elite'
  if (mult >= 1.2) return 'Hard'
  if (mult >= 1.1) return 'Good'
  if (mult >= 1.0) return 'Average'
  if (mult >= 0.9) return 'Not Bad'
  if (mult >= 0.8) return 'Bad'
  if (mult >= 0.7) return 'Really Bad'
  if (mult >= 0.6) return 'Weenie Hut Jr.'
  return 'Super Weenie Hut Jr.'
}

export function odrMultSafe(rank: number, school: string): number {
  if (rank >= 999) return 0.45
  return odrMult(rank)
}

export function odrMultForUnit(
  position: string,
  opponentDefRank: number,
  opponentOffRank: number,
  fallbackRank = 999
): number {
  if (position === 'DEF') return odrMult(opponentOffRank || fallbackRank)
  return odrMult(opponentDefRank || fallbackRank)
}

export function getODRColor(mult: number | null | undefined): string {
  if (mult == null) return '#4a5d7a'
  if (mult >= 1.3) return '#39ff14'   // Elite — bright highlighter green
  if (mult >= 1.2) return '#90ee90'   // Hard — light green
  if (mult >= 1.1) return '#228b22'   // Good — green
  if (mult >= 1.0) return '#ffff00'   // Average — yellow
  if (mult >= 0.9) return '#ff8c00'   // Not Bad — orange
  if (mult >= 0.8) return '#ff4500'   // Bad — red/orange
  if (mult >= 0.7) return '#cc0000'   // Really Bad — red
  if (mult >= 0.6) return '#9400d3'   // Weenie Hut Jr. — purple
  return '#ff69b4'                     // Super Weenie Hut Jr. — pink
}
