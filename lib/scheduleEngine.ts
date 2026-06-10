export interface ScheduleGame {
  week: number;
  home: string;
  away: string;
}

/**
 * Generate a round-robin schedule for the given team IDs.
 * Each team plays exactly once per week.
 * Odd number of teams: a BYE slot is added and BYE matchups are omitted.
 * Teams rotate: index 0 is fixed, indices 1..n-1 rotate each week.
 */
export function generateSchedule(teamIds: string[], weeks = 11): ScheduleGame[] {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push('BYE');
  const n = teams.length;
  const schedule: ScheduleGame[] = [];

  for (let w = 1; w <= weeks; w++) {
    const fixed  = teams[0];
    const rest   = teams.slice(1);
    const offset = (w - 1) % (n - 1);
    const rotated = [...rest.slice(offset), ...rest.slice(0, offset)];
    const round   = [fixed, ...rotated];

    for (let i = 0; i < n / 2; i++) {
      const home = round[i];
      const away = round[n - 1 - i];
      if (home === 'BYE' || away === 'BYE') continue;
      schedule.push({ week: w, home, away });
    }
  }

  return schedule;
}

/** Return the opponent teamId for a given team in a given week, or null for BYE/missing. */
export function getOpponent(schedule: ScheduleGame[], teamId: string, week: number): string | null {
  const game = schedule.find(g => g.week === week && (g.home === teamId || g.away === teamId));
  if (!game) return null;
  return game.home === teamId ? game.away : game.home;
}
