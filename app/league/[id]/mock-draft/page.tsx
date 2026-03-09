'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { FULL_POOL, POSITION_CAPS, ROSTER_SLOTS, type DraftUnit, type UnitType } from '@/lib/playerPool';
import type { TeamEfficiency } from '@/types';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a', text: '#e8edf5', sub: '#7a90b0', muted: '#4a5d7a',
  green: '#2ecc71', red: '#e74c3c', blue: '#3b82f6', orange: '#f39c12',
};

const POS_COLORS: Record<UnitType, string> = {
  QB: '#3b82f6', RB: '#2ecc71', WR: '#d4a828', TE: '#f39c12', DEF: '#e74c3c', K: '#7a90b0',
};

const TOTAL_ROUNDS = ROSTER_SLOTS.starters.length + ROSTER_SLOTS.bench.length;
const USER_TEAM = 0;
const PICK_TIME = 60;
const MIN_CPU = 1;
const MAX_CPU = 11; // max 12 total teams

const CPU_NAMES = [
  'Crimson AI', 'Bulldog Bot', 'Longhorn CPU', 'Buckeye Bot',
  'Duck AI', 'Tiger CPU', 'Vol Bot', 'Gator AI',
  'Sooner CPU', 'Bayou Bot', 'Nittany CPU',
];

type Pick = { unit: DraftUnit; teamIdx: number; round: number; pickNum: number };
type RosterCount = Record<UnitType, number>;

function emptyRoster(): RosterCount {
  return { QB: 0, RB: 0, WR: 0, TE: 0, DEF: 0, K: 0 };
}

function getTeamForPick(pickNum: number, numTeams: number): number {
  const round = Math.floor(pickNum / numTeams);
  const pos = pickNum % numTeams;
  return round % 2 === 0 ? pos : numTeams - 1 - pos;
}

function aiPickUnit(available: DraftUnit[], roster: RosterCount): DraftUnit | null {
  const sorted = [...available].sort((a, b) => b.projectedPoints - a.projectedPoints);
  const topN = sorted.slice(0, Math.min(5, sorted.length));
  const rand = Math.random();
  const candidates = rand < 0.65 ? [topN[0]] : rand < 0.85 ? topN.slice(0, 2) : topN.slice(0, 3);
  const pick = candidates[Math.floor(Math.random() * candidates.length)] || topN[0];
  for (const unit of [pick, ...sorted]) {
    if ((roster[unit.unitType] || 0) < POSITION_CAPS[unit.unitType]) return unit;
  }
  return sorted[0] || null;
}

// ── Setup Screen ──────────────────────────────────────────────────────────────

function SetupScreen({ onStart, onBack }: { onStart: (numCpu: number) => void; onBack: () => void }) {
  const [numCpu, setNumCpu] = useState(7);
  const teamNames = ['Your Team', ...CPU_NAMES.slice(0, numCpu)];

  return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald', sans-serif", color: C.text }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 40, width: 420, maxWidth: '90vw' }}>
        <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: 2, color: C.gold, marginBottom: 6 }}>MOCK DRAFT SETUP</div>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, marginBottom: 32 }}>Configure your draft before starting</div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' }}>CPU Opponents</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={() => setNumCpu(n => Math.max(MIN_CPU, n - 1))}
              style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.surf3}`, background: C.surf2, color: C.text, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >−</button>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 32, color: C.gold, minWidth: 40, textAlign: 'center' }}>{numCpu}</div>
            <button
              onClick={() => setNumCpu(n => Math.min(MAX_CPU, n + 1))}
              style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.surf3}`, background: C.surf2, color: C.text, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >+</button>
            <div style={{ fontSize: 11, color: C.muted }}>
              {numCpu + 1} total teams · {(numCpu + 1) * TOTAL_ROUNDS} picks
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>Draft Order</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {teamNames.map((name, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, background: i === 0 ? `${C.gold}18` : C.surf2, border: `1px solid ${i === 0 ? C.gold + '44' : C.surf3}` }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: i === 0 ? C.gold : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: i === 0 ? C.bg : C.muted, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontSize: 12, color: i === 0 ? C.gold : C.sub }}>{name}</div>
                {i === 0 && <div style={{ fontSize: 9, color: C.gold, marginLeft: 'auto', letterSpacing: 1 }}>YOU</div>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onBack}
            style={{ flex: 1, padding: '12px 20px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.muted, cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 12, letterSpacing: 1 }}
          >← BACK</button>
          <button
            onClick={() => onStart(numCpu)}
            style={{ flex: 2, padding: '12px 20px', background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: 2, color: C.bg }}
          >START DRAFT</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MockDraftPage() {
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.id as string;

  const [setupDone, setSetupDone] = useState(false);
  const [numCpu, setNumCpu] = useState(7);

  const numTeams = numCpu + 1;
  const teamNames = ['Your Team', ...CPU_NAMES.slice(0, numCpu)];

  const [picks, setPicks] = useState<Pick[]>([]);
  const [available, setAvailable] = useState<DraftUnit[]>([]);
  const [currentPickNum, setCurrentPickNum] = useState(0);
  const [timer, setTimer] = useState(PICK_TIME);
  const [filter, setFilter] = useState<UnitType | 'ALL'>('ALL');
  const [draftComplete, setDraftComplete] = useState(false);
  const [rosters, setRosters] = useState<RosterCount[]>(
    Array.from({ length: 12 }, emptyRoster)
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [effMap, setEffMap] = useState<Record<string, TeamEfficiency>>({});

  useEffect(() => {
    const pool = [...FULL_POOL].sort((a, b) => b.projectedPoints - a.projectedPoints);
    setAvailable(pool);
    // Fetch current efficiency data for badges
    const season = new Date().getFullYear();
    fetch(`/api/efficiency?week=1&season=${season}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data) return;
        const map: Record<string, TeamEfficiency> = {};
        for (const row of json.data as TeamEfficiency[]) map[row.school] = row;
        setEffMap(map);
      })
      .catch(() => {});
  }, []);

  const currentTeam = getTeamForPick(currentPickNum, numTeams);
  const isMyTurn = currentTeam === USER_TEAM;

  const makePick = useCallback((unit: DraftUnit) => {
    if (draftComplete) return;
    const nt = numCpu + 1;
    const tp = nt * TOTAL_ROUNDS;
    const round = Math.floor(currentPickNum / nt);
    const team = getTeamForPick(currentPickNum, nt);
    const newPick: Pick = { unit, teamIdx: team, round, pickNum: currentPickNum };
    setPicks(prev => [...prev, newPick]);
    setAvailable(prev => prev.filter(u => u.id !== unit.id));
    setRosters(prev => {
      const next = prev.map(r => ({ ...r }));
      next[team][unit.unitType] = (next[team][unit.unitType] || 0) + 1;
      return next;
    });
    const next = currentPickNum + 1;
    if (next >= tp) {
      setDraftComplete(true);
    } else {
      setCurrentPickNum(next);
      setTimer(PICK_TIME);
    }
  }, [currentPickNum, draftComplete, numCpu]);

  useEffect(() => {
    if (draftComplete || !isMyTurn || available.length === 0) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          const best = available.find(u => (rosters[USER_TEAM][u.unitType] || 0) < POSITION_CAPS[u.unitType]);
          if (best) makePick(best);
          return PICK_TIME;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isMyTurn, draftComplete, available.length, makePick, rosters]);

  useEffect(() => {
    if (draftComplete || isMyTurn || available.length === 0) return;
    const delay = 600 + Math.random() * 800;
    const t = setTimeout(() => {
      const pick = aiPickUnit(available, rosters[currentTeam]);
      if (pick) makePick(pick);
    }, delay);
    return () => clearTimeout(t);
  }, [currentPickNum, isMyTurn, draftComplete, available, rosters, currentTeam, makePick]);

  function effBadgeBg(mult: number) {
    if (mult >= 1.15) return '#16a34a';
    if (mult >= 1.10) return '#15803d';
    if (mult >= 1.05) return '#a16207';
    return C.muted;
  }

  const filteredAvailable = available.filter(u => filter === 'ALL' || u.unitType === filter);
  const myPicks = picks.filter(p => p.teamIdx === USER_TEAM);
  const round = Math.floor(currentPickNum / numTeams);
  const pickInRound = (currentPickNum % numTeams) + 1;
  const timerPct = (timer / PICK_TIME) * 100;

  const restartDraft = () => {
    setPicks([]);
    setCurrentPickNum(0);
    setTimer(PICK_TIME);
    setDraftComplete(false);
    setRosters(Array.from({ length: 12 }, emptyRoster));
    const pool = [...FULL_POOL].sort((a, b) => b.projectedPoints - a.projectedPoints);
    setAvailable(pool);
    setSetupDone(false);
  };

  if (!setupDone) {
    return (
      <SetupScreen
        onStart={(n) => { setNumCpu(n); setSetupDone(true); }}
        onBack={() => router.push(`/league/${leagueId}`)}
      />
    );
  }

  if (draftComplete) return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 32, fontFamily: "'Oswald', sans-serif", color: C.text }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 28, letterSpacing: 2, color: C.gold }}>MOCK DRAFT COMPLETE</div>
          <button onClick={() => router.push(`/league/${leagueId}`)} style={{ padding: '10px 22px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.sub, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 2 }}>EXIT</button>
        </div>
        <div style={{ marginBottom: 16, fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' }}>Your Roster</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {myPicks.map((p, i) => (
            <div key={i} style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '12px 14px', borderLeft: `3px solid ${POS_COLORS[p.unit.unitType]}` }}>
              <div style={{ fontSize: 10, color: POS_COLORS[p.unit.unitType], letterSpacing: 2, marginBottom: 4 }}>{p.unit.unitType}</div>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{p.unit.school}</div>
              {p.unit.playerName && <div style={{ fontSize: 11, color: C.muted }}>{p.unit.playerName}</div>}
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Round {p.round + 1} · Pick #{p.pickNum + 1}</div>
            </div>
          ))}
        </div>
        <button onClick={restartDraft} style={{ marginTop: 24, padding: '12px 28px', background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: 2, color: C.bg }}>MOCK AGAIN</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, overflow: 'hidden', fontFamily: "'Oswald', sans-serif", color: C.text }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${C.surf}; }
        ::-webkit-scrollbar-thumb { background: ${C.surf3}; border-radius: 2px; }
        .pick-row:hover { background: ${C.surf2} !important; cursor: pointer; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
      `}</style>
      {/* Draft Board */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', background: C.surf, borderBottom: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => router.push(`/league/${leagueId}`)} style={{ background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '6px 12px', color: C.muted, cursor: 'pointer', fontSize: 11, letterSpacing: 1, fontFamily: "'Oswald', sans-serif" }}>← EXIT MOCK</button>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, letterSpacing: 2, color: C.gold }}>MOCK DRAFT</div>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1 }}>Round {round + 1} · Pick {pickInRound} of {numTeams}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 11, color: isMyTurn ? C.gold : C.muted, letterSpacing: 1 }}>{isMyTurn ? '⚡ YOUR PICK' : `${teamNames[currentTeam]} picking...`}</div>
            <div style={{ position: 'relative', width: 44, height: 44 }}>
              <svg width="44" height="44" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="22" cy="22" r="18" fill="none" stroke={C.surf3} strokeWidth="3" />
                <circle cx="22" cy="22" r="18" fill="none" stroke={isMyTurn ? C.gold : C.muted} strokeWidth="3" strokeDasharray={`${2 * Math.PI * 18}`} strokeDashoffset={`${2 * Math.PI * 18 * (1 - timerPct / 100)}`} style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Anton', sans-serif", fontSize: 13, color: isMyTurn ? C.gold : C.muted }}>{isMyTurn ? timer : ''}</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 11 }}>
            <thead>
              <tr style={{ background: C.surf2, position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '8px 12px', color: C.muted, letterSpacing: 1, fontWeight: 400, textAlign: 'left', borderRight: `1px solid ${C.surf3}`, minWidth: 50 }}>RD</th>
                {teamNames.map((name, i) => (
                  <th key={i} style={{ padding: '8px 10px', color: i === USER_TEAM ? C.gold : C.sub, letterSpacing: .5, fontWeight: i === USER_TEAM ? 700 : 400, textAlign: 'center', minWidth: 110, borderRight: `1px solid ${C.surf3}` }}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: TOTAL_ROUNDS }).map((_, r) => (
                <tr key={r} style={{ borderBottom: `1px solid ${C.surf3}` }}>
                  <td style={{ padding: '6px 12px', color: C.muted, borderRight: `1px solid ${C.surf3}`, fontFamily: "'Anton', sans-serif", fontSize: 12 }}>{r + 1}</td>
                  {Array.from({ length: numTeams }).map((_, col) => {
                    const pickNum = r % 2 === 0 ? r * numTeams + col : r * numTeams + (numTeams - 1 - col);
                    const pick = picks.find(p => p.pickNum === pickNum);
                    const isActive = pickNum === currentPickNum;
                    return (
                      <td key={col} style={{ padding: '4px 6px', borderRight: `1px solid ${C.surf3}`, background: isActive ? `${C.gold}15` : 'transparent', minWidth: 110 }}>
                        {pick ? (
                          <div style={{ padding: '4px 6px', borderRadius: 4, background: `${POS_COLORS[pick.unit.unitType]}18`, borderLeft: `2px solid ${POS_COLORS[pick.unit.unitType]}` }}>
                            <div style={{ fontSize: 10, color: POS_COLORS[pick.unit.unitType], letterSpacing: 1 }}>{pick.unit.unitType}</div>
                            <div style={{ fontSize: 11, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pick.unit.school}</div>
                          </div>
                        ) : isActive ? (
                          <div style={{ padding: '4px 6px', color: C.gold, fontSize: 10, letterSpacing: 1, animation: 'pulse 1.5s infinite' }}>ON THE CLOCK</div>
                        ) : (
                          <div style={{ padding: '4px 6px', color: C.surf3, fontSize: 10 }}>—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Player Pool */}
      <div style={{ width: 320, background: C.surf, borderLeft: `1px solid ${C.surf3}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.surf3}` }}>
          <div style={{ fontSize: 12, color: C.text, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>AVAILABLE PLAYERS</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF', 'K'] as const).map(pos => (
              <button key={pos} onClick={() => setFilter(pos)} style={{ padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 10, letterSpacing: 1, fontFamily: "'Oswald', sans-serif", background: filter === pos ? (pos === 'ALL' ? C.gold : POS_COLORS[pos as UnitType]) : C.surf2, color: filter === pos ? C.bg : C.sub }}>{pos}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!isMyTurn && (
            <div style={{ padding: '10px 16px', background: `${C.muted}22`, borderBottom: `1px solid ${C.surf3}`, fontSize: 11, color: C.muted, letterSpacing: .5 }}>Waiting for {teamNames[currentTeam]}...</div>
          )}
          {filteredAvailable.slice(0, 80).map((unit, i) => {
            const overCap = (rosters[USER_TEAM][unit.unitType] || 0) >= POSITION_CAPS[unit.unitType];
            return (
              <div key={unit.id} className="pick-row" onClick={() => isMyTurn && !overCap && makePick(unit)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${C.surf3}22`, opacity: overCap ? 0.35 : 1, background: 'transparent', transition: 'background .1s', cursor: isMyTurn && !overCap ? 'pointer' : 'default' }}>
                <div style={{ width: 20, fontSize: 10, color: C.muted, flexShrink: 0, textAlign: 'right' }}>{i + 1}</div>
                <div style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: `${POS_COLORS[unit.unitType]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: POS_COLORS[unit.unitType], letterSpacing: 1, fontWeight: 700 }}>{unit.unitType}</div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{unit.school}{unit.playerName && <span style={{ color: C.sub, fontWeight: 400 }}> · {unit.playerName}</span>}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: POS_COLORS[unit.unitType], letterSpacing: 1, padding: '1px 5px', background: `${POS_COLORS[unit.unitType]}18`, borderRadius: 3 }}>{unit.tier}</span>
                    <span style={{ fontSize: 9, color: C.muted }}>{unit.projectedPoints} pts</span>
                    {effMap[unit.school] && (() => {
                      const eff = effMap[unit.school];
                      return (
                        <>
                          <span title={`OFF ${eff.off_percentile}th percentile`} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: effBadgeBg(eff.off_multiplier), color: '#fff', fontWeight: 700, letterSpacing: .5 }}>
                            OFF {eff.off_multiplier.toFixed(2)}×
                          </span>
                          <span title={`DEF ${eff.def_percentile}th percentile`} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: effBadgeBg(eff.def_multiplier), color: '#fff', fontWeight: 700, letterSpacing: .5 }}>
                            DEF {eff.def_multiplier.toFixed(2)}×
                          </span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{unit.projectedPoints} pts</div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.surf3}`, background: C.surf2 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8 }}>MY ROSTER ({myPicks.length}/{TOTAL_ROUNDS})</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(POSITION_CAPS) as UnitType[]).map(pos => (
              <div key={pos} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: C.surf, color: rosters[USER_TEAM][pos] > 0 ? POS_COLORS[pos] : C.muted, border: `1px solid ${rosters[USER_TEAM][pos] > 0 ? POS_COLORS[pos] + '44' : C.surf3}` }}>{pos} {rosters[USER_TEAM][pos]}/{POSITION_CAPS[pos]}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
