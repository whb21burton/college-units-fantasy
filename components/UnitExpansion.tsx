'use client';
import React, { useEffect, useState } from 'react';

type Props = {
  school: string;
  unitType: string;
  currentWeek: number;
  season?: number;
  logos?: Record<string, string>;
  homeMap?: Record<string, boolean>;
  defRankMap?: Record<string, number>;
  offRankMap?: Record<string, number>;
};

const thStyle: React.CSSProperties = {
  fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1.5, color: '#4a5d7a',
  textTransform: 'uppercase', padding: '4px 6px', fontWeight: 400, whiteSpace: 'nowrap',
};
const tdBase: React.CSSProperties = {
  fontFamily: 'Oswald,sans-serif', fontSize: 11, padding: '6px 6px',
  borderTop: '1px solid rgba(30,45,71,.4)', whiteSpace: 'nowrap',
};

const COL_DEFS: Record<string, { label: string; key: string }[]> = {
  QB:  [{ label: 'PASS YDS', key: 'passing_YDS' }, { label: 'TD', key: 'passing_TD' }, { label: 'INT', key: 'passing_INT' }, { label: 'RUSH YDS', key: 'rushing_YDS' }],
  RB:  [{ label: 'ATT', key: 'rushing_ATT' }, { label: 'RUSH YDS', key: 'rushing_YDS' }, { label: 'TD', key: 'rushing_TD' }, { label: 'REC', key: 'receiving_REC' }, { label: 'REC YDS', key: 'receiving_YDS' }],
  WR:  [{ label: 'REC', key: 'receiving_REC' }, { label: 'YDS', key: 'receiving_YDS' }, { label: 'TD', key: 'receiving_TD' }],
  TE:  [{ label: 'REC', key: 'receiving_REC' }, { label: 'YDS', key: 'receiving_YDS' }, { label: 'TD', key: 'receiving_TD' }],
  DEF: [{ label: 'SACKS', key: 'sacks' }, { label: 'INT', key: 'ints' }, { label: 'FUM', key: 'fumRec' }, { label: 'TD', key: 'defTd' }],
  K:   [{ label: 'PTS', key: 'kicking_PTS' }],
};
const SUMMARY_COL_DEFS: Record<string, { label: string; key: string }[]> = {
  QB:  [{ label: 'PASS YDS', key: 'passYd' }, { label: 'TD', key: 'passTd' }, { label: 'INT', key: 'int' }, { label: 'RUSH YDS', key: 'rushYd' }],
  RB:  [{ label: 'ATT', key: 'rushAtt' }, { label: 'RUSH YDS', key: 'rushYd' }, { label: 'TD', key: 'rushTd' }, { label: 'REC', key: 'rec' }, { label: 'REC YDS', key: 'recYd' }],
  WR:  [{ label: 'REC', key: 'rec' }, { label: 'YDS', key: 'recYd' }, { label: 'TD', key: 'recTd' }],
  TE:  [{ label: 'REC', key: 'rec' }, { label: 'YDS', key: 'recYd' }, { label: 'TD', key: 'recTd' }],
  DEF: [{ label: 'SACKS', key: 'sacks' }, { label: 'INT', key: 'ints' }, { label: 'FUM', key: 'fumRec' }, { label: 'TD', key: 'defTd' }],
  K:   [{ label: 'PTS', key: 'pts' }],
};

function odrMult(rank: number): number {
  return rank <= 5 ? 1.3 : rank <= 10 ? 1.2 : rank <= 15 ? 1.1 : rank <= 25 ? 1.0
    : rank <= 35 ? 0.9 : rank <= 50 ? 0.8 : rank <= 80 ? 0.7 : rank <= 100 ? 0.6 : 0.5;
}

export default function UnitExpansion({
  school, unitType, currentWeek, season = 2025,
  logos: logosIn, homeMap: homeMapIn, defRankMap: defRankMapIn, offRankMap: offRankMapIn,
}: Props) {
  const [unitStats,     setUnitStats]     = useState<any>(null);
  const [expandedWeek,  setExpandedWeek]  = useState<number | null>(null);
  const [weekBreakdown, setWeekBreakdown] = useState<Record<number, any>>({});
  const [logos,         setLogos]         = useState<Record<string, string>>(logosIn ?? {});
  const [homeMap,       setHomeMap]       = useState<Record<string, boolean>>(homeMapIn ?? {});
  const [defRankMap,    setDefRankMap]    = useState<Record<string, number>>(defRankMapIn ?? {});
  const [offRankMap,    setOffRankMap]    = useState<Record<string, number>>(offRankMapIn ?? {});

  useEffect(() => {
    // Fetch unit game log
    fetch(`/api/unit-stats?school=${encodeURIComponent(school)}&unitType=${unitType}&season=${season}&currentWeek=${currentWeek}`)
      .then(r => r.json())
      .then(d => setUnitStats(d))
      .catch(() => setUnitStats(null));

    // Fetch matchup context + logos if not provided
    if (!logosIn || !defRankMapIn) {
      Promise.all([
        fetch(`/api/matchup-context?week=${currentWeek}&season=${season}`).then(r => r.json()).catch(() => ({})),
        fetch('/api/team-logos').then(r => r.json()).catch(() => ({})),
      ]).then(([ctx, logoData]) => {
        if (!logosIn) setLogos(typeof logoData === 'object' && !Array.isArray(logoData) ? logoData : {});
        if (!homeMapIn) setHomeMap(ctx.homeMap ?? {});
        if (!defRankMapIn) setDefRankMap(ctx.defRankMap ?? {});
        if (!offRankMapIn) setOffRankMap(ctx.offRankMap ?? {});
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school, unitType, currentWeek, season]);

  if (!unitStats) return (
    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: '#3e5470', padding: '8px 0' }}>Loading stats…</div>
  );

  const weeks = unitStats.weeks ?? [];
  const cols = COL_DEFS[unitType] ?? [];
  const summaryCols = SUMMARY_COL_DEFS[unitType] ?? [];

  // Avg FPTS
  const playedWeeks = weeks.filter((w: any) => w.completed);
  const fptsVals = playedWeeks.map((w: any) => weekBreakdown[w.week]?.fpts ?? w.fantasyPoints ?? null).filter((v: any) => v != null);
  const avgFpts = fptsVals.length > 0 ? fptsVals.reduce((s: number, v: number) => s + v, 0) / fptsVals.length : 0;
  function loadBreakdown(wkNum: number) {
    if (weekBreakdown[wkNum]) return;
    fetch(`/api/unit-stats?school=${encodeURIComponent(school)}&unitType=${unitType}&season=${season}&week=${wkNum}`)
      .then(r => r.json())
      .then(d => setWeekBreakdown(prev => ({ ...prev, [wkNum]: d })))
      .catch(() => {});
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: '5%' }}>WK</th>
            <th style={{ ...thStyle, textAlign: 'left', width: '22%' }}>OPP</th>
            <th style={{ ...thStyle, textAlign: 'right', width: '10%' }}>FPTS</th>
            <th style={{ ...thStyle, textAlign: 'right', width: '12%' }}>ODR</th>
            {summaryCols.map(c => <th key={c.key} style={{ ...thStyle, textAlign: 'right' }}>{c.label}</th>)}
            <th style={{ ...thStyle, width: '4%' }}></th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((wk: any) => {
            const isUpcoming = wk.isUpcoming && !wk.completed && !wk.isBye;
            const isFuture   = !wk.completed && !wk.isBye && !isUpcoming && wk.week > currentWeek;

            // Upcoming week — green projected row
            if (isUpcoming) {
              const opp = wk.opponent;
              const oppRank = opp ? (unitType === 'DEF' ? (offRankMap[opp] ?? 50) : (defRankMap[opp] ?? 50)) : 50;
              const mult = odrMult(oppRank);
              const proj = avgFpts > 0 ? (avgFpts * mult).toFixed(2) : '—';
              const oppShort = opp ? (opp.length > 12 ? opp.slice(0, 12) + '…' : opp) : 'TBD';
              return (
                <tr key={wk.week} style={{ outline: '2px solid rgba(21,198,120,.6)', outlineOffset: '-1px', background: 'rgba(21,198,120,.05)' }}>
                  <td style={{ ...tdBase, textAlign: 'left', color: '#15c678', fontWeight: 700 }}>{wk.week}</td>
                  <td style={{ ...tdBase, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {opp && logos[opp] && <img src={logos[opp]} alt={opp} style={{ width: 16, height: 16, objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />}
                      <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: '#7eb8f7' }}>{opp ? (homeMap[school] ? 'vs ' : '@ ') + oppShort : 'TBD'}</span>
                    </div>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#15c678', fontFamily: 'Anton,sans-serif', fontSize: 12 }}>{proj}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#15c678', fontFamily: 'Oswald,sans-serif', fontWeight: 700 }}>×{mult.toFixed(1)}</td>
                  {summaryCols.map(c => <td key={c.key} style={{ ...tdBase, textAlign: 'right', color: '#3e5470' }}>—</td>)}
                  <td style={{ ...tdBase, color: '#15c678', fontSize: 9, textAlign: 'right' }}>▶</td>
                </tr>
              );
            }

            // Future week — grey projected
            if (isFuture) {
              const opp = wk.opponent;
              const oppRank = opp ? (unitType === 'DEF' ? (offRankMap[opp] ?? 50) : (defRankMap[opp] ?? 50)) : 50;
              const mult = odrMult(oppRank);
              const proj = avgFpts > 0 ? (avgFpts * mult).toFixed(2) : '—';
              const oppShort = opp ? (opp.length > 12 ? opp.slice(0, 12) + '…' : opp) : '—';
              return (
                <tr key={wk.week} style={{ opacity: 0.45 }}>
                  <td style={{ ...tdBase, textAlign: 'left', color: '#3e5470' }}>{wk.week}</td>
                  <td style={{ ...tdBase, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {opp && logos[opp] && <img src={logos[opp]} alt={opp} style={{ width: 16, height: 16, objectFit: 'contain', opacity: 0.5 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />}
                      <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: '#3e5470' }}>{opp ? (homeMap[school] ? 'vs ' : '@ ') + oppShort : 'TBD'}</span>
                    </div>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#3e5470', fontSize: 10 }}>{proj}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#3e5470', fontSize: 10 }}>×{mult.toFixed(1)}</td>
                  {summaryCols.map(c => <td key={c.key} style={{ ...tdBase, textAlign: 'right', color: '#2a3a52' }}>—</td>)}
                  <td style={{ ...tdBase, color: '#2a3a52' }}></td>
                </tr>
              );
            }

            // Bye week
            if (wk.isBye) {
              return (
                <tr key={wk.week} style={{ opacity: 0.5 }}>
                  <td style={{ ...tdBase, textAlign: 'left', color: '#4a5d7a' }}>{wk.week}</td>
                  <td style={{ ...tdBase, textAlign: 'left', color: '#4a5d7a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {wk.opponent && logos[wk.opponent] && <img src={logos[wk.opponent]} alt={wk.opponent} style={{ width: 16, height: 16, objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />}
                      <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: '#3e5470', letterSpacing: 1 }}>
                        {wk.opponent ? `BYE vs ${wk.opponent.length > 10 ? wk.opponent.slice(0,10)+'…' : wk.opponent}` : 'BYE'}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#3e5470' }}>—</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#3e5470' }}>—</td>
                  {summaryCols.map(c => <td key={c.key} style={{ ...tdBase, textAlign: 'right', color: '#3e5470' }}>—</td>)}
                  <td style={{ ...tdBase, color: '#3e5470' }}></td>
                </tr>
              );
            }

            // Played week
            const mult = wk.multiplier ?? 1.0;
            const multColor = mult >= 1.2 ? '#15c678' : mult >= 1.0 ? '#f5a623' : mult >= 0.8 ? '#f08030' : '#f03a5a';
            const player0 = wk.players?.[0] ?? {};
            const oppShort = wk.opponent ? (wk.opponent.length > 12 ? wk.opponent.slice(0, 12) + '…' : wk.opponent) : '—';
            const isExp = expandedWeek === wk.week;
            const bd = weekBreakdown[wk.week];

            return (
              <React.Fragment key={wk.week}>
                <tr
                  onClick={() => {
                    const next = isExp ? null : wk.week;
                    setExpandedWeek(next);
                    if (next) loadBreakdown(wk.week);
                  }}
                  style={{ cursor: 'pointer', background: isExp ? 'rgba(245,166,35,.05)' : 'transparent' }}
                >
                  <td style={{ ...tdBase, textAlign: 'left', color: '#4a5d7a' }}>{wk.week}</td>
                  <td style={{ ...tdBase, textAlign: 'left', color: '#7a90b0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {logos[wk.opponent] && <img src={logos[wk.opponent]} alt={wk.opponent} style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>vs {oppShort}</span>
                    </div>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#f0c94a', fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
                    {(bd?.fpts ?? wk.fantasyPoints)?.toFixed(2) ?? '—'}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', color: multColor, fontFamily: 'Oswald,sans-serif', fontWeight: 700 }}>
                    ×{mult.toFixed(2)}
                  </td>
                  {summaryCols.map(c => (
                    <td key={c.key} style={{ ...tdBase, textAlign: 'right', color: '#7a90b0' }}>{player0[c.key] ?? '—'}</td>
                  ))}
                  <td style={{ ...tdBase, textAlign: 'right', color: '#4a5d7a', fontSize: 10 }}>{isExp ? '▲' : '▼'}</td>
                </tr>
                {isExp && (
                  <tr>
                    <td colSpan={4 + cols.length + 1} style={{ padding: 0 }}>
                      {!bd ? (
                        <div style={{ padding: '8px 12px', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: '#3e5470' }}>Loading breakdown…</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'rgba(0,0,0,.2)' }}>
                          <thead>
                            <tr>
                              <th style={{ ...thStyle, textAlign: 'left', width: '28%' }}>PLAYER</th>
                              <th style={{ ...thStyle, textAlign: 'left', width: '10%' }}>ROLE</th>
                              {cols.map(c => <th key={c.key} style={{ ...thStyle, textAlign: 'right' }}>{c.label}</th>)}
                              <th style={{ ...thStyle, textAlign: 'right', width: '10%' }}>PTS</th>
                              <th style={{ ...thStyle, textAlign: 'right', width: '10%' }}>MULT</th>
                              <th style={{ ...thStyle, textAlign: 'right', width: '10%', color: '#15c678' }}>WPTS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(bd?.bdRows ?? []).map((row: any, ri: number) => (
                              <tr key={ri}>
                                <td style={{ ...tdBase, textAlign: 'left', color: '#7eb8f7', fontSize: 10 }}>{row.playerName ?? 'Team'}</td>
                                <td style={{ ...tdBase, textAlign: 'left', color: '#4a5d7a', fontSize: 9 }}>{row.role}</td>
                                {cols.map(c => <td key={c.key} style={{ ...tdBase, textAlign: 'right', color: '#7a90b0', fontSize: 10 }}>{row.stats?.[c.key] ?? '—'}</td>)}
                                <td style={{ ...tdBase, textAlign: 'right', color: '#f0c94a', fontFamily: 'Anton,sans-serif', fontSize: 11 }}>{row.rawPts?.toFixed(2) ?? '—'}</td>
                                <td style={{ ...tdBase, textAlign: 'right', color: '#7a90b0', fontSize: 10 }}>×{(row.multiplier ?? 1).toFixed(2)}</td>
                                <td style={{ ...tdBase, textAlign: 'right', color: '#15c678', fontFamily: 'Anton,sans-serif', fontSize: 11 }}>{row.weightedPts?.toFixed(2) ?? '—'}</td>
                              </tr>
                            ))}
                            <tr style={{ borderTop: '1px solid rgba(245,166,35,.3)', background: 'rgba(0,0,0,.2)' }}>
                              <td colSpan={2 + cols.length} style={{ ...tdBase, textAlign: 'left', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#f5a623', letterSpacing: 1, paddingTop: 8 }}>UNIT TOTAL</td>
                              <td style={{ ...tdBase, textAlign: 'right', paddingTop: 8 }} colSpan={3}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                  <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: '#15c678' }}>{bd?.unitTotal?.toFixed(2) ?? '—'} WPTS</span>
                                  <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: '#f03a5a', letterSpacing: 0.5 }}>× ODR {(bd?.odrMult ?? wk.multiplier ?? 1).toFixed(2)}</span>
                                  <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: '#f0c94a', borderTop: '1px solid rgba(245,166,35,.4)', paddingTop: 2 }}>{bd?.fpts?.toFixed(2) ?? '—'} FPTS</span>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {weeks.length === 0 && (
            <tr><td colSpan={4 + cols.length + 1} style={{ ...tdBase, textAlign: 'center', color: '#4a5d7a' }}>No games played yet</td></tr>
          )}
        </tbody>
      </table>
      {avgFpts > 0 && (
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#4a5d7a', marginTop: 6 }}>
          {avgFpts.toFixed(2)} avg FPTS ({playedWeeks.length} games)
        </div>
      )}
    </div>
  );
}
