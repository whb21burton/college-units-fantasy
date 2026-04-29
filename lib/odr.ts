/**
 * Shared ODR (Opponent Difficulty Rating) utilities — safe to use in both
 * server code and client components (no Supabase imports).
 */

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
  return 0.5
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

export function getODRColor(mult: number | null | undefined): string {
  if (mult == null) return '#4a5d7a'
  if (mult >= 1.3) return '#ff6b35'   // Elite — orange
  if (mult >= 1.2) return '#ff9f1c'   // Hard — amber
  if (mult >= 1.1) return '#d4a828'   // Good — gold
  if (mult >= 1.0) return '#2ecc71'   // Average — green
  if (mult >= 0.9) return '#7a90b0'   // Not Bad — blue-gray
  if (mult >= 0.8) return '#7a90b0'   // Bad — blue-gray
  if (mult >= 0.7) return '#e74c3c'   // Really Bad — red
  if (mult >= 0.6) return '#c0392b'   // Weenie Hut Jr. — dark red
  return '#922b21'                     // Super Weenie Hut Jr. — darkest red
}
