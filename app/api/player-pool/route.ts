import { NextResponse } from 'next/server';
import { initCfbdClient } from '@/lib/cfbd-client';
import type { DraftUnit, UnitType, Tier, Conference } from '@/lib/playerPool';

const pkg = require('cfbd');
const { getPlayerSeasonStats, getTeamStats, getSp } = pkg;

/** Convert SOS rank (1 = hardest) to a projection multiplier. */
function sosMult(rank: number): number {
  if (rank <=  5) return 1.3;
  if (rank <= 10) return 1.2;
  if (rank <= 15) return 1.1;
  if (rank <= 25) return 1.0;
  if (rank <= 35) return 0.9;
  if (rank <= 50) return 0.8;
  if (rank <= 80) return 0.7;
  return 0.6;
}

/** Units that get SOS adjustment — NOT QB or K. */
const SOS_UNITS = new Set<UnitType>(['RB', 'WR', 'TE', 'DEF']);

const SEASON = 2025;

// Conferences to include (must match DraftUnit Conference type)
const CONF_MAP: Record<string, Conference> = {
  'SEC':              'SEC',
  'Big Ten':          'Big Ten',
  'Big 12':           'Big 12',
  'ACC':              'ACC',
  'FBS Independents': 'FBS Independents',
};
const P4_CONFS = Object.keys(CONF_MAP);

// Fantasy scoring weights (full-season totals)
const S = {
  passYd: 0.04, passTd: 4, int: -2,
  rushYd: 0.1,  rushTd: 6,
  recYd:  0.1,  recTd:  6, rec: 0.5,
  sack:   2,    tfl:    1, defInt: 3, fumRec: 2,
};

function uid(school: string, unitType: UnitType, player?: string) {
  const base = `${school}-${unitType}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return player ? `${base}-${player.toLowerCase().replace(/\s+/g, '-')}` : base;
}

function tierFromRank(rank: number, total: number): Tier {
  const pct = rank / total;
  if (pct <= 0.30) return 'Elite';
  if (pct <= 0.65) return 'Solid';
  return 'Depth';
}

function assignAdps(units: { pts: number }[]): number[] {
  // Returns ADP positions starting from a given offset
  return units.map((_, i) => i + 1);
}

export async function GET() {
  try {
    initCfbdClient();

    // Fetch player stats, team stats, and SP+ ratings in parallel
    const [playerResults, teamResults, spRes] = await Promise.all([
      Promise.all(P4_CONFS.map(conf =>
        getPlayerSeasonStats({ query: { year: SEASON, conference: conf } })
          .then((r: any) => r.data || [])
      )),
      Promise.all(P4_CONFS.map(conf =>
        getTeamStats({ query: { year: SEASON, conference: conf } })
          .then((r: any) => r.data || [])
      )),
      getSp({ query: { year: SEASON } }).then((r: any) => r.data || []),
    ]);

    // ── Build SOS rank → multiplier map ──────────────────────
    // SP+ includes a `sos` field (higher = harder schedule).
    // Rank all P4 teams by SOS descending; rank 1 = hardest.
    const spData: any[] = spRes;
    const p4SpTeams = spData
      .filter((t: any) => t.sos != null)
      .sort((a: any, b: any) => (b.sos ?? 0) - (a.sos ?? 0));
    const sosMultMap: Record<string, number> = {};
    p4SpTeams.forEach((t: any, idx: number) => {
      sosMultMap[t.team] = sosMult(idx + 1);
    });

    const allPlayerRows: any[] = playerResults.flat();
    const allTeamRows:   any[] = teamResults.flat();

    // ── Build player maps per team ────────────────────────────
    // Group player rows by team+player+position+category
    type PlayerEntry = Record<string, any>;
    const playerMap: Record<string, PlayerEntry> = {};
    for (const row of allPlayerRows) {
      if (!CONF_MAP[row.conference]) continue;
      const key = `${row.team}||${row.player}||${row.position}||${row.category}`;
      if (!playerMap[key]) {
        playerMap[key] = { team: row.team, conf: row.conference, player: row.player, position: row.position, category: row.category };
      }
      playerMap[key][row.statType] = parseFloat(row.stat) || 0;
    }
    const playerEntries = Object.values(playerMap);

    // ── Team stats map: team → statName → value ───────────────
    const teamStat: Record<string, Record<string, number>> = {};
    for (const row of allTeamRows) {
      if (!teamStat[row.team]) teamStat[row.team] = {};
      teamStat[row.team][row.statName] = parseFloat(row.statValue) || 0;
    }

    // Get all P4 teams from team stats
    const allTeams = Object.keys(teamStat);

    // Conference lookup for each team
    const teamConf: Record<string, Conference> = {};
    for (const row of allTeamRows) {
      if (CONF_MAP[row.conference]) teamConf[row.team] = CONF_MAP[row.conference];
    }

    // ── QB: top passer per team ───────────────────────────────
    const qbPassers = playerEntries.filter(e => e.position === 'QB' && e.category === 'passing');
    const qbRushers = playerEntries.filter(e => e.position === 'QB' && e.category === 'rushing');
    // Build rush map for QBs
    const qbRushMap: Record<string, { YDS: number; TD: number }> = {};
    for (const r of qbRushers) {
      const k = `${r.team}||${r.player}`;
      if (!qbRushMap[k]) qbRushMap[k] = { YDS: 0, TD: 0 };
      qbRushMap[k].YDS += r.YDS || 0;
      qbRushMap[k].TD  += r.TD  || 0;
    }

    // Top QB per team by passing yards
    const topQbPerTeam: Record<string, any> = {};
    for (const qb of qbPassers) {
      const curr = topQbPerTeam[qb.team];
      if (!curr || (qb.YDS || 0) > (curr.YDS || 0)) {
        topQbPerTeam[qb.team] = qb;
      }
    }

    // QB fantasy points
    type QBData = { team: string; conf: Conference; name: string; pts: number };
    const qbData: QBData[] = [];
    for (const [team, qb] of Object.entries(topQbPerTeam)) {
      const conf = teamConf[team];
      if (!conf) continue;
      const rush = qbRushMap[`${team}||${qb.player}`] || { YDS: 0, TD: 0 };
      const pts =
        (qb.YDS || 0) * S.passYd +
        (qb.TD  || 0) * S.passTd +
        (qb.INT || 0) * S.int    +
        rush.YDS * S.rushYd      +
        rush.TD  * S.rushTd;
      qbData.push({ team, conf, name: qb.player, pts });
    }
    qbData.sort((a, b) => b.pts - a.pts);

    // ── K: top kicker per team ────────────────────────────────
    const kickers = playerEntries.filter(e => (e.position === 'K' || e.position === 'PK') && e.category === 'kicking');
    const topKPerTeam: Record<string, any> = {};
    for (const k of kickers) {
      const curr = topKPerTeam[k.team];
      if (!curr || (k.PTS || 0) > (curr.PTS || 0)) topKPerTeam[k.team] = k;
    }
    type KData = { team: string; conf: Conference; name: string; pts: number };
    const kData: KData[] = [];
    for (const [team, k] of Object.entries(topKPerTeam)) {
      const conf = teamConf[team];
      if (!conf) continue;
      kData.push({ team, conf, name: k.player, pts: k.PTS || 0 });
    }
    kData.sort((a, b) => b.pts - a.pts);

    // ── WR unit: sum all WR receiving per team ────────────────
    const wrReceivers = playerEntries.filter(e => e.position === 'WR' && e.category === 'receiving');
    const wrTeamTotals: Record<string, { pts: number; conf: Conference }> = {};
    for (const wr of wrReceivers) {
      const conf = teamConf[wr.team];
      if (!conf) continue;
      if (!wrTeamTotals[wr.team]) wrTeamTotals[wr.team] = { pts: 0, conf };
      wrTeamTotals[wr.team].pts +=
        (wr.YDS || 0) * S.recYd +
        (wr.TD  || 0) * S.recTd +
        (wr.REC || 0) * S.rec;
    }
    const wrData = Object.entries(wrTeamTotals)
      .map(([team, d]) => ({ team, conf: d.conf, pts: d.pts * (sosMultMap[team] ?? 1.0) }))
      .sort((a, b) => b.pts - a.pts);

    // ── TE unit: sum all TE receiving per team ────────────────
    const teReceivers = playerEntries.filter(e => e.position === 'TE' && e.category === 'receiving');
    const teTeamTotals: Record<string, { pts: number; conf: Conference }> = {};
    for (const te of teReceivers) {
      const conf = teamConf[te.team];
      if (!conf) continue;
      if (!teTeamTotals[te.team]) teTeamTotals[te.team] = { pts: 0, conf };
      teTeamTotals[te.team].pts +=
        (te.YDS || 0) * S.recYd +
        (te.TD  || 0) * S.recTd +
        (te.REC || 0) * S.rec;
    }
    const teData = Object.entries(teTeamTotals)
      .map(([team, d]) => ({ team, conf: d.conf, pts: d.pts * (sosMultMap[team] ?? 1.0) }))
      .sort((a, b) => b.pts - a.pts);

    // ── RB unit: team rushing stats ───────────────────────────
    const rbData: { team: string; conf: Conference; pts: number }[] = [];
    for (const team of allTeams) {
      const conf = teamConf[team];
      if (!conf) continue;
      const ts = teamStat[team];
      const pts =
        (ts.rushingYards || 0) * S.rushYd +
        (ts.rushingTDs   || 0) * S.rushTd;
      rbData.push({ team, conf, pts: pts * (sosMultMap[team] ?? 1.0) });
    }
    rbData.sort((a, b) => b.pts - a.pts);

    // ── DEF unit: team defensive stats ───────────────────────
    const defData: { team: string; conf: Conference; pts: number }[] = [];
    for (const team of allTeams) {
      const conf = teamConf[team];
      if (!conf) continue;
      const ts = teamStat[team];
      const pts =
        (ts.sacks              || 0) * S.sack   +
        (ts.tacklesForLoss     || 0) * S.tfl    +
        (ts.passesIntercepted  || 0) * S.defInt +
        (ts.fumblesRecovered   || 0) * S.fumRec;
      defData.push({ team, conf, pts: pts * (sosMultMap[team] ?? 1.0) });
    }
    defData.sort((a, b) => b.pts - a.pts);

    // ── Assign ADP globally by interleaving all units ────────
    // We want ADP to reflect global draft value — QB/RB/WR/DEF
    // mix together. Compute global rank from projected points.
    type UnitDraft = { team: string; conf: Conference; unitType: UnitType; pts: number; name?: string };
    const allUnits: UnitDraft[] = [
      ...qbData.map(d  => ({ ...d, unitType: 'QB'  as UnitType })),
      ...rbData.map(d  => ({ ...d, unitType: 'RB'  as UnitType })),
      ...wrData.map(d  => ({ ...d, unitType: 'WR'  as UnitType })),
      ...teData.map(d  => ({ ...d, unitType: 'TE'  as UnitType })),
      ...defData.map(d => ({ ...d, unitType: 'DEF' as UnitType })),
      ...kData.map(d   => ({ ...d, unitType: 'K'   as UnitType })),
    ].sort((a, b) => b.pts - a.pts);

    // Global ADP
    const adpMap = new Map<string, number>();
    allUnits.forEach((u, i) => adpMap.set(`${u.team}||${u.unitType}`, i + 1));

    // ── Build final DraftUnit[] ───────────────────────────────
    const pool: DraftUnit[] = [];

    const addUnits = (
      data: { team: string; conf: Conference; pts: number; name?: string }[],
      unitType: UnitType
    ) => {
      data.forEach((d, rank) => {
        const tier = tierFromRank(rank, data.length);
        const adp  = adpMap.get(`${d.team}||${unitType}`) ?? (rank + 1);
        pool.push({
          id:             uid(d.team, unitType, d.name),
          school:         d.team,
          conference:     d.conf,
          unitType,
          playerName:     d.name,
          tier,
          adp:            parseFloat(adp.toFixed(1)),
          projectedPoints: Math.round(d.pts),
        });
      });
    }

    // For QB and K, add backup/depth entries per team
    // Top QB per team already included. Add depth QBs.
    addUnits(qbData,  'QB');
    addUnits(rbData,  'RB');
    addUnits(wrData,  'WR');
    addUnits(teData,  'TE');
    addUnits(defData, 'DEF');
    addUnits(kData,   'K');

    return NextResponse.json(pool, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (err: any) {
    console.error('player-pool error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
