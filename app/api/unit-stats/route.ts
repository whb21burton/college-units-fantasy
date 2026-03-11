/**
 * GET /api/unit-stats?school=X&unitType=Y&season=2025
 *
 * Returns week-by-week game log stats for a school's fantasy unit,
 * plus individual player data per week for use in the player detail view.
 */
import { NextResponse } from 'next/server';
import { initCfbdClient } from '@/lib/cfbd-client';

const pkg = require('cfbd');
const { getGames, getGamePlayerStats, getGameTeamStats } = pkg;

const S = {
  passYd: 0.05, passTd: 4,  int: -2,
  rushYd: 0.05, rushTd: 6,
  recYd:  0.05, recTd:  6,
  sack:   1,    defInt: 2,  fumRec: 2, defTd: 6,
};

const TOTAL_WEEKS = 14;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const school   = searchParams.get('school')   ?? '';
  const unitType = searchParams.get('unitType') ?? '';
  const season   = parseInt(searchParams.get('season') || '2025', 10);

  if (!school || !unitType) {
    return NextResponse.json({ error: 'school and unitType required' }, { status: 400 });
  }

  try {
    initCfbdClient();

    const weeks = await Promise.all(
      Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map(async (week) => {
        try {
          const [gamesData, playerData, teamData] = await Promise.all([
            getGames({ query: { year: season, week } }).then((r: any) => r.data ?? []).catch(() => []),
            getGamePlayerStats({ query: { year: season, week } }).then((r: any) => r.data ?? []).catch(() => []),
            getGameTeamStats({ query: { year: season, week } }).then((r: any) => r.data ?? []).catch(() => []),
          ]);

          const game = (gamesData as any[]).find(
            (g: any) => g.homeTeam === school || g.awayTeam === school
          );
          const opponent = game
            ? (game.homeTeam === school ? game.awayTeam : game.homeTeam)
            : null;
          const completed = game != null && game.homePoints != null && game.awayPoints != null;

          if (!completed) {
            return { week, opponent, completed: false, fantasyPoints: null, players: [] };
          }

          // Team stats for this school
          const teamEntry = (teamData as any[])
            .flatMap((g: any) => g.teams ?? [])
            .find((t: any) => t.school === school || t.team === school);
          const ts: Record<string, number> = {};
          for (const s of (teamEntry?.stats ?? [])) {
            ts[s.category] = parseFloat(s.stat) || 0;
          }

          // Player stats for this school
          const schoolTeamEntries = (playerData as any[])
            .flatMap((g: any) => (g.teams ?? []).filter((t: any) => t.school === school || t.team === school));

          const pm: Record<string, any> = {};
          for (const te of schoolTeamEntries) {
            for (const cat of (te.categories ?? [])) {
              for (const type of (cat.types ?? [])) {
                for (const ath of (type.athletes ?? [])) {
                  const key = `${ath.name}||${cat.name}`;
                  if (!pm[key]) pm[key] = { name: ath.name, category: cat.name };
                  pm[key][type.name] = (pm[key][type.name] || 0) + (parseFloat(ath.stat) || 0);
                }
              }
            }
          }

          const entries = Object.values(pm);
          let fantasyPoints = 0;
          let players: any[] = [];

          switch (unitType) {
            case 'QB': {
              const passers = entries
                .filter((e: any) => e.category === 'passing')
                .sort((a: any, b: any) => (b.YDS || 0) - (a.YDS || 0));
              const qb = passers[0];
              if (qb) {
                const rush = pm[`${qb.name}||rushing`] ?? {};
                fantasyPoints = Math.round((
                  (qb.YDS || 0) * S.passYd +
                  (qb.TD  || 0) * S.passTd +
                  (qb.INT || 0) * S.int    +
                  (rush.YDS || 0) * S.rushYd +
                  (rush.TD  || 0) * S.rushTd
                ) * 10) / 10;
                players = [{ name: qb.name, passYd: qb.YDS || 0, passTd: qb.TD || 0, int: qb.INT || 0, rushYd: rush.YDS || 0, rushTd: rush.TD || 0 }];
              }
              break;
            }

            case 'RB': {
              fantasyPoints = Math.round((
                (ts.rushingYards || 0) * S.rushYd +
                (ts.rushingTDs   || 0) * S.rushTd
              ) * 10) / 10;
              players = entries
                .filter((e: any) => e.category === 'rushing')
                .filter((e: any) => !entries.some((p: any) => p.name === e.name && p.category === 'passing'))
                .sort((a: any, b: any) => (b.YDS || 0) - (a.YDS || 0))
                .slice(0, 4)
                .map((r: any) => {
                  const rec = pm[`${r.name}||receiving`] ?? {};
                  return { name: r.name, rushAtt: r.ATT || 0, rushYd: r.YDS || 0, rushTd: r.TD || 0, rec: rec.REC || 0, recYd: rec.YDS || 0 };
                });
              break;
            }

            case 'WR':
            case 'TE': {
              const recvs = entries
                .filter((e: any) => e.category === 'receiving')
                .filter((e: any) => !entries.some((p: any) => p.name === e.name && p.category === 'passing'))
                .sort((a: any, b: any) => (b.YDS || 0) - (a.YDS || 0))
                .slice(0, 5);
              fantasyPoints = Math.round(
                recvs.reduce((s: number, r: any) => s + (r.YDS || 0) * S.recYd + (r.TD || 0) * S.recTd, 0) * 10
              ) / 10;
              players = recvs.map((r: any) => ({ name: r.name, rec: r.REC || 0, recYd: r.YDS || 0, recTd: r.TD || 0 }));
              break;
            }

            case 'DEF': {
              fantasyPoints = Math.round((
                (ts.sacks             || 0) * S.sack   +
                (ts.passesIntercepted || 0) * S.defInt +
                (ts.fumblesRecovered  || 0) * S.fumRec +
                ((ts.interceptionTDs  || 0) + (ts.fumbleReturnTDs || 0)) * S.defTd
              ) * 10) / 10;
              players = [{
                sacks:  ts.sacks             || 0,
                ints:   ts.passesIntercepted || 0,
                fumRec: ts.fumblesRecovered  || 0,
                defTd:  (ts.interceptionTDs  || 0) + (ts.fumbleReturnTDs || 0),
              }];
              break;
            }

            case 'K': {
              const k = entries
                .filter((e: any) => e.category === 'kicking')
                .sort((a: any, b: any) => (b.PTS || 0) - (a.PTS || 0))[0];
              if (k) {
                fantasyPoints = Math.round((k.PTS || 0) * 10) / 10;
                players = [{ name: k.name, pts: k.PTS || 0 }];
              }
              break;
            }
          }

          return { week, opponent, completed: true, fantasyPoints, players };
        } catch {
          return { week, opponent: null, completed: false, fantasyPoints: null, players: [] };
        }
      })
    );

    return NextResponse.json(
      { school, unitType, weeks },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    );
  } catch (err: any) {
    console.error('unit-stats error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
