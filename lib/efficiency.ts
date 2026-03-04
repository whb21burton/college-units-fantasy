/**
 * Efficiency Multiplier System
 *
 * Calculates offensive and defensive efficiency percentiles for all schools
 * in the platform pool using CFBD API season-rolling stats.
 * Converts percentiles to scoring multipliers per the spec:
 *   ≥ 95th → 1.20x, ≥ 90th → 1.15x, ≥ 80th → 1.10x, ≥ 60th → 1.05x, else → 1.00x
 */

import { getAdvancedSeasonStats, getTeamStats } from 'cfbd';
import { initCfbdClient } from './cfbd-client';
import { CONFERENCES } from './playerPool';

// ── Types ─────────────────────────────────────────────────────

export interface EfficiencyMetrics {
  school: string;
  conference: string;
  // Offensive (higher = better offense)
  offPointsPerDrive: number;
  offYardsPerPlay: number;
  offSuccessRate: number;
  offTurnoverRate: number;   // turnovers lost per drive — LOWER = better
  // Defensive (lower opponent metric = better defense, except turnoverRate)
  defPointsPerDrive: number; // opponent pts per opportunity — LOWER = better
  defYardsPerPlay: number;   // negative opponent PPA — HIGHER = better
  defSuccessRate: number;    // opponent success rate — LOWER = better
  defTurnoverRate: number;   // havoc rate forced — HIGHER = better
}

export interface EfficiencyResult extends EfficiencyMetrics {
  offComposite: number;   // 0–1, normalized composite across pool
  defComposite: number;   // 0–1
  offPercentile: number;  // 0–100
  defPercentile: number;  // 0–100
  offMultiplier: number;  // 1.00–1.20
  defMultiplier: number;  // 1.00–1.20
}

// ── All schools in the platform pool ─────────────────────────

const ALL_SCHOOLS = new Set(Object.values(CONFERENCES).flat());

// Conference lookup for each school
const SCHOOL_CONFERENCE: Record<string, string> = {};
for (const [conf, schools] of Object.entries(CONFERENCES)) {
  for (const school of schools) SCHOOL_CONFERENCE[school] = conf;
}

// ── Multiplier table ──────────────────────────────────────────

export function multiplierFromPercentile(p: number): number {
  if (p >= 95) return 1.20;
  if (p >= 90) return 1.15;
  if (p >= 80) return 1.10;
  if (p >= 60) return 1.05;
  return 1.00;
}

// ── Normalization helpers ─────────────────────────────────────

/** Min-max normalize an array to [0, 1]. Returns 0.5 for all-equal arrays. */
function normalizeArray(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map(v => (v - min) / (max - min));
}

/**
 * Compute percentile rank for each value (0–100).
 * Higher composite = higher percentile.
 */
function computePercentiles(composites: number[]): number[] {
  const n = composites.length;
  const indexed = composites.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const percentiles = new Array<number>(n);
  indexed.forEach(({ i }, rank) => {
    percentiles[i] = Math.round((rank / (n - 1)) * 100);
  });
  return percentiles;
}

// ── Main calculation function ─────────────────────────────────

/**
 * Fetch CFBD season stats through `week` and compute efficiency
 * for all schools in the platform pool.
 */
export async function calculateEfficiencyForWeek(
  season: number,
  week: number,
): Promise<EfficiencyResult[]> {
  initCfbdClient();

  // Fetch advanced season stats (provides success rate, ppa, drives, plays, havoc)
  const [advRes, statRes] = await Promise.all([
    getAdvancedSeasonStats({ query: { year: season, endWeek: week } }),
    getTeamStats({ query: { year: season, endWeek: week } }),
  ]);

  const advancedStats = advRes.data ?? [];
  const teamStatRows = statRes.data ?? [];

  // Build lookup: team name → AdvancedSeasonStat
  const advMap = new Map(advancedStats.map(s => [s.team, s]));

  // Build lookup: team → { statName → value }
  const rawMap = new Map<string, Record<string, number>>();
  for (const row of teamStatRows) {
    if (!rawMap.has(row.team)) rawMap.set(row.team, {});
    rawMap.get(row.team)![row.statName] = Number(row.statValue);
  }

  // Collect raw metrics for all pool schools with available data
  const rawMetrics: EfficiencyMetrics[] = [];

  for (const school of Array.from(ALL_SCHOOLS)) {
    const adv = advMap.get(school);
    if (!adv) continue; // school has no stats yet (bye / early in season)

    const raw = rawMap.get(school) ?? {};
    const offDrives = adv.offense.drives || 1;
    const defDrives = adv.defense.drives || 1;

    // Turnovers lost (offense): sum interceptions thrown + fumbles lost
    const turnoversLost =
      (raw['turnovers'] ?? raw['interceptions'] ?? 0);

    // Turnovers forced (defense): from havoc stats (proportion of plays disrupted)
    const havocTotal = adv.defense.havoc?.total ?? 0;

    rawMetrics.push({
      school,
      conference: SCHOOL_CONFERENCE[school] ?? 'Unknown',
      // Offense — higher is better for all except turnoverRate
      offPointsPerDrive: adv.offense.pointsPerOpportunity,
      offYardsPerPlay: adv.offense.ppa,
      offSuccessRate: adv.offense.successRate,
      offTurnoverRate: offDrives > 0 ? turnoversLost / offDrives : 0,
      // Defense — lower opp metric = better (except defTurnoverRate where higher = better)
      defPointsPerDrive: adv.defense.pointsPerOpportunity,
      defYardsPerPlay: adv.defense.ppa,   // lower = better (will be inverted below)
      defSuccessRate: adv.defense.successRate, // lower = better (inverted below)
      defTurnoverRate: havocTotal,             // higher = better
    });
  }

  if (rawMetrics.length === 0) return [];

  // ── Normalize offensive metrics (all higher = better after inversion) ──
  const offPPD = normalizeArray(rawMetrics.map(m => m.offPointsPerDrive));
  const offYPP = normalizeArray(rawMetrics.map(m => m.offYardsPerPlay));
  const offSR  = normalizeArray(rawMetrics.map(m => m.offSuccessRate));
  // Turnover rate: LOWER is better → invert normalization
  const offTO  = normalizeArray(rawMetrics.map(m => m.offTurnoverRate)).map(v => 1 - v);

  // ── Normalize defensive metrics (higher composite = better defense) ──
  // Invert metrics where lower opponent value = better defense
  const defPPD = normalizeArray(rawMetrics.map(m => m.defPointsPerDrive)).map(v => 1 - v);
  const defYPP = normalizeArray(rawMetrics.map(m => m.defYardsPerPlay)).map(v => 1 - v);
  const defSR  = normalizeArray(rawMetrics.map(m => m.defSuccessRate)).map(v => 1 - v);
  const defTO  = normalizeArray(rawMetrics.map(m => m.defTurnoverRate));  // higher = better

  // ── Composite scores (average of 4 equal-weight metrics) ──
  const offComposites = rawMetrics.map((_, i) =>
    (offPPD[i] + offYPP[i] + offSR[i] + offTO[i]) / 4
  );
  const defComposites = rawMetrics.map((_, i) =>
    (defPPD[i] + defYPP[i] + defSR[i] + defTO[i]) / 4
  );

  // ── Percentiles ──
  const offPercentiles = computePercentiles(offComposites);
  const defPercentiles = computePercentiles(defComposites);

  // ── Assemble results ──
  return rawMetrics.map((m, i) => ({
    ...m,
    offComposite: offComposites[i],
    defComposite: defComposites[i],
    offPercentile: offPercentiles[i],
    defPercentile: defPercentiles[i],
    offMultiplier: multiplierFromPercentile(offPercentiles[i]),
    defMultiplier: multiplierFromPercentile(defPercentiles[i]),
  }));
}

// ── Adjusted score calculation ────────────────────────────────

export interface RosterUnit {
  school: string;
  unitType: 'QB' | 'RB' | 'WR' | 'TE' | 'DEF' | 'K';
  basePoints: number;
}

export interface AdjustedUnit extends RosterUnit {
  opponentSchool: string | null;  // null = bye week
  multiplier: number;
  adjustedPoints: number;
}

/**
 * Given a roster of starter units, their base fantasy points, the school
 * schedule for this week, and efficiency data, compute adjusted scores.
 *
 * For OFFENSIVE units (QB/RB/WR/TE/K): multiplier = opponent's DEF multiplier
 * For DEF units: multiplier = opponent's OFF multiplier
 */
export function applyEfficiencyMultipliers(
  starterUnits: RosterUnit[],
  efficiencyMap: Record<string, EfficiencyResult>,
  scheduleMap: Record<string, string>,  // school → opponentSchool this week
): AdjustedUnit[] {
  return starterUnits.map(unit => {
    const opponentSchool = scheduleMap[unit.school] ?? null;

    if (!opponentSchool) {
      // Bye week: no multiplier
      return { ...unit, opponentSchool: null, multiplier: 1.0, adjustedPoints: unit.basePoints };
    }

    const opponentEff = efficiencyMap[opponentSchool];
    if (!opponentEff) {
      return { ...unit, opponentSchool, multiplier: 1.0, adjustedPoints: unit.basePoints };
    }

    const multiplier =
      unit.unitType === 'DEF'
        ? opponentEff.offMultiplier  // DEF faces elite offense → bonus
        : opponentEff.defMultiplier; // Offense faces elite defense → bonus

    return {
      ...unit,
      opponentSchool,
      multiplier,
      adjustedPoints: parseFloat((unit.basePoints * multiplier).toFixed(2)),
    };
  });
}
