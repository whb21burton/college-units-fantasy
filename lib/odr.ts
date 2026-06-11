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

/** Single source of truth for ODR tier label + color from a multiplier value. */
export function odrInfo(mult: number): { label: string; color: string } {
  if (mult >= 1.25) return { label: 'Elite',   color: '#15c678' }
  if (mult >= 1.15) return { label: 'Elite',   color: '#15c678' }
  if (mult >= 1.05) return { label: 'Elite',   color: '#15c678' }
  if (mult >= 0.95) return { label: 'Good',    color: '#7fc97f' }
  if (mult >= 0.85) return { label: 'Good',    color: '#7fc97f' }
  if (mult >= 0.75) return { label: 'Average', color: '#f5a623' }
  if (mult >= 0.65) return { label: 'Average', color: '#f5a623' }
  if (mult >= 0.55) return { label: 'Poor',    color: '#f03a5a' }
  return                    { label: 'Poor',   color: '#f03a5a' }
}

export function odrLabel(rank: number): string {
  return odrInfo(odrMult(rank)).label
}

/** Derive a label from a stored multiplier value. */
export function odrLabelFromMult(mult: number | null | undefined): string {
  if (mult == null) return '—'
  return odrInfo(mult).label
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
  return odrInfo(mult).color
}
