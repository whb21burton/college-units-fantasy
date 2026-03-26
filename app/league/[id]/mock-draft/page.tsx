'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { POSITION_CAPS, ROSTER_SLOTS, type DraftUnit, type UnitType } from '@/lib/playerPool';
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
  const [effMap,       setEffMap]       = useState<Record<string, TeamEfficiency>>({});
  const [poolData,     setPoolData]     = useState<DraftUnit[]>([]);
  const [viewingUnit,  setViewingUnit]  = useState<DraftUnit | null>(null);
  const [unitStats,    setUnitStats]    = useState<any | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    // Fetch real player pool from CFBD API
    fetch('/api/player-pool')
      .then(r => r.json())
      .then((data: DraftUnit[]) => {
        const sorted = [...(Array.isArray(data) ? data : [])].sort((a, b) => b.projectedPoints - a.projectedPoints);
        setPoolData(sorted);
        setAvailable(sorted);
      })
      .catch(() => {});
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

  useEffect(() => {
    if (!viewingUnit) { setUnitStats(null); return; }
    setStatsLoading(true);
    setUnitStats(null);
    fetch(`/api/unit-stats?school=${encodeURIComponent(viewingUnit.school)}&unitType=${viewingUnit.unitType}&season=2025`)
      .then(r => r.json())
      .then(d => { setUnitStats(d); setStatsLoading(false); })
      .catch(() => setStatsLoading(false));
  }, [viewingUnit?.school, viewingUnit?.unitType]);

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
    setAvailable([...poolData].sort((a, b) => b.projectedPoints - a.projectedPoints));
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
      {/* ── Unit Stats Panel ────────────────────────────────────── */}
      {viewingUnit && (() => {
        const S = { passYd: 0.05, passTd: 4, int: -2, rushYd: 0.05, rushTd: 6, recYd: 0.05, recTd: 6 };
        const ut = viewingUnit.unitType;
        const canPickPanel = isMyTurn && !draftComplete && (rosters[USER_TEAM][ut] || 0) < POSITION_CAPS[ut];
        const weeks: any[] = unitStats?.weeks ?? [];
        const completedWeeks = weeks.filter(w => w.completed);
        const seasonTotal = completedWeeks.reduce((s: number, w: any) => s + (w.fantasyPoints ?? 0), 0);

        const playerTotals: Record<string, any> = {};
        for (const wk of completedWeeks) {
          for (const p of wk.players ?? []) {
            if (!p.name) continue;
            if (!playerTotals[p.name]) playerTotals[p.name] = { name: p.name, fpts: 0, ...Object.fromEntries(Object.keys(p).filter(k => k !== 'name').map(k => [k, 0])) };
            let wkFpts = 0;
            if (ut === 'QB') wkFpts = (p.passYd||0)*S.passYd + (p.passTd||0)*S.passTd + (p.int||0)*S.int + (p.rushYd||0)*S.rushYd + (p.rushTd||0)*S.rushTd;
            else if (ut === 'RB') wkFpts = (p.rushYd||0)*S.rushYd + (p.rushTd||0)*S.rushTd + (p.recYd||0)*S.recYd;
            else if (ut === 'WR' || ut === 'TE') wkFpts = (p.recYd||0)*S.recYd + (p.recTd||0)*S.recTd;
            playerTotals[p.name].fpts += wkFpts;
            for (const k of Object.keys(p)) { if (k !== 'name' && typeof p[k] === 'number') playerTotals[p.name][k] = (playerTotals[p.name][k] || 0) + p[k]; }
          }
        }
        const topPlayers = Object.values(playerTotals).sort((a: any, b: any) => b.fpts - a.fpts).slice(0, 3);

        const statCols: { key: string; label: string }[] = ut === 'QB'
          ? [{ key: 'passYd', label: 'PASS YDS' }, { key: 'passTd', label: 'TD' }, { key: 'int', label: 'INT' }, { key: 'rushYd', label: 'RSH YDS' }]
          : ut === 'RB'
          ? [{ key: 'rushAtt', label: 'ATT' }, { key: 'rushYd', label: 'YDS' }, { key: 'rushTd', label: 'TD' }, { key: 'rec', label: 'REC' }, { key: 'recYd', label: 'REC YDS' }]
          : ut === 'WR' || ut === 'TE'
          ? [{ key: 'rec', label: 'REC' }, { key: 'recYd', label: 'YDS' }, { key: 'recTd', label: 'TD' }]
          : ut === 'DEF'
          ? [{ key: 'sacks', label: 'SACK' }, { key: 'ints', label: 'INT' }, { key: 'fumRec', label: 'FUM' }, { key: 'defTd', label: 'TD' }]
          : [{ key: 'pts', label: 'PTS' }];

        const accentColors = [C.gold, C.sub, C.muted];

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5,8,15,0.65)' }} onClick={() => setViewingUnit(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              position: 'absolute', top: 0, right: 0, width: 420, height: '100vh',
              background: C.surf, borderLeft: `1px solid ${C.surf3}`,
              display: 'flex', flexDirection: 'column', overflowY: 'hidden',
            }}>
              {/* Header */}
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.surf3}`, flexShrink: 0, background: C.surf2 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ padding: '2px 8px', borderRadius: 4, background: `${POS_COLORS[ut]}22`, color: POS_COLORS[ut], fontSize: 9, fontWeight: 700, letterSpacing: 1, flexShrink: 0 }}>{ut}</div>
                      <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 15, letterSpacing: 1, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {viewingUnit.school}{viewingUnit.playerName ? ` · ${viewingUnit.playerName}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: C.sub, letterSpacing: .5 }}>{viewingUnit.conference} · {viewingUnit.tier} · {viewingUnit.projectedPoints} proj pts/season</div>
                    {completedWeeks.length > 0 && <div style={{ fontSize: 10, color: C.gold, marginTop: 3 }}>{seasonTotal.toFixed(1)} actual pts · {completedWeeks.length} games</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                    <button onClick={() => setViewingUnit(null)} style={{ background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '4px 10px', color: C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                    <button
                      onClick={() => { if (canPickPanel) { makePick(viewingUnit); setViewingUnit(null); } }}
                      disabled={!canPickPanel}
                      style={{
                        padding: '6px 14px', borderRadius: 6, fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 1,
                        border: canPickPanel ? `1px solid ${C.gold}88` : `1px solid ${C.surf3}`,
                        background: canPickPanel ? `${C.gold}22` : 'transparent',
                        color: canPickPanel ? C.gold : C.surf3,
                        cursor: canPickPanel ? 'pointer' : 'default',
                        boxShadow: canPickPanel ? `0 0 10px ${C.gold}33` : 'none',
                      }}
                    >DRAFT</button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                {statsLoading && (
                  <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontSize: 11, letterSpacing: 1 }}>Loading stats...</div>
                )}

                {!statsLoading && unitStats && (
                  <>
                    {/* Game Log */}
                    <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>Game Log</div>
                    <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                        <thead>
                          <tr style={{ background: C.surf2 }}>
                            {['WK', 'OPP', 'FPTS', 'ODR', ...statCols.map(c => c.label)].map(h => (
                              <th key={h} style={{ padding: '5px 6px', color: C.muted, fontWeight: 400, letterSpacing: 1, textAlign: 'right', borderBottom: `1px solid ${C.surf3}`, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {weeks.map((wk: any) => {
                            const p0 = wk.players?.[0];
                            const odr = wk.multiplier != null ? wk.multiplier.toFixed(2) : '—';
                            return (
                              <tr key={wk.week} style={{ borderBottom: `1px solid ${C.surf3}22`, opacity: wk.completed ? 1 : 0.4 }}>
                                <td style={{ padding: '5px 6px', color: C.muted, textAlign: 'right' }}>{wk.week}</td>
                                <td style={{ padding: '5px 6px', color: C.sub, textAlign: 'right', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wk.opponent ? (wk.opponent.length > 10 ? wk.opponent.slice(0, 10) + '…' : wk.opponent) : '—'}</td>
                                <td style={{ padding: '5px 6px', color: wk.completed ? C.gold : C.muted, textAlign: 'right', fontWeight: 700 }}>{wk.completed ? (wk.fantasyPoints ?? 0).toFixed(1) : '—'}</td>
                                <td style={{ padding: '5px 6px', color: C.sub, textAlign: 'right' }}>{wk.completed ? odr + '×' : '—'}</td>
                                {statCols.map(col => (
                                  <td key={col.key} style={{ padding: '5px 6px', color: C.text, textAlign: 'right' }}>
                                    {wk.completed && p0 != null ? (p0[col.key] ?? 0) : '—'}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Top Contributors */}
                    {topPlayers.length > 0 && ut !== 'DEF' && ut !== 'K' && (
                      <>
                        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>Top Contributors</div>
                        {topPlayers.map((p: any, idx: number) => {
                          const accent = accentColors[idx];
                          const statLine = ut === 'QB'
                            ? `${Math.round(p.passYd||0)} pass yds · ${Math.round(p.passTd||0)} TD · ${Math.round(p.rushYd||0)} rush yds`
                            : ut === 'RB'
                            ? `${Math.round(p.rushYd||0)} rush yds · ${Math.round(p.rushTd||0)} TD · ${Math.round(p.recYd||0)} rec yds`
                            : `${Math.round(p.recYd||0)} rec yds · ${Math.round(p.recTd||0)} TD`;
                          return (
                            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 7, marginBottom: 6, borderLeft: `3px solid ${accent}` }}>
                              <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, color: accent, flexShrink: 0, width: 22, textAlign: 'right' }}>#{idx + 1}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{statLine}</div>
                              </div>
                              <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, color: accent, flexShrink: 0 }}>{p.fpts.toFixed(1)}</div>
                            </div>
                          );
                        })}
                      </>
                    )}

                    {completedWeeks.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontSize: 11 }}>No games played yet this season.</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
            const canPick = isMyTurn && !overCap && !draftComplete;
            return (
              <div key={unit.id} className="pick-row" onClick={() => setViewingUnit(unit)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${C.surf3}22`, opacity: overCap ? 0.35 : 1, background: viewingUnit?.id === unit.id ? C.surf2 : 'transparent', transition: 'background .1s', cursor: 'pointer' }}>
                {/* DRAFT button — LEFT */}
                <button
                  onClick={e => { e.stopPropagation(); if (canPick) makePick(unit); }}
                  disabled={!canPick}
                  style={{
                    padding: '5px 7px', borderRadius: 5, flexShrink: 0, minWidth: 46,
                    border: canPick ? `1px solid ${C.gold}88` : `1px solid ${C.surf3}`,
                    background: canPick ? `${C.gold}18` : 'transparent',
                    color: canPick ? C.gold : C.surf3,
                    fontFamily: "'Anton', sans-serif", fontSize: 9, letterSpacing: 1,
                    cursor: canPick ? 'pointer' : 'default',
                    boxShadow: canPick ? `0 0 8px ${C.gold}33` : 'none',
                    transition: 'all .15s',
                  }}
                >DRAFT</button>
                <div style={{ width: 18, fontSize: 10, color: C.muted, flexShrink: 0, textAlign: 'right' }}>{i + 1}</div>
                <div style={{ width: 26, height: 26, borderRadius: 5, flexShrink: 0, background: `${POS_COLORS[unit.unitType]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: POS_COLORS[unit.unitType], letterSpacing: 1, fontWeight: 700 }}>{unit.unitType}</div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{unit.school}{unit.playerName && <span style={{ color: C.sub, fontWeight: 400 }}> · {unit.playerName}</span>}</div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: POS_COLORS[unit.unitType], letterSpacing: 1, padding: '1px 5px', background: `${POS_COLORS[unit.unitType]}18`, borderRadius: 3 }}>{unit.tier}</span>
                    <span style={{ fontSize: 9, color: C.muted }}>{unit.projectedPoints} pts</span>
                    {effMap[unit.school] && (() => {
                      const eff = effMap[unit.school];
                      return (
                        <>
                          <span title={`OFF ${eff.off_percentile}th percentile`} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: effBadgeBg(eff.off_multiplier), color: '#fff', fontWeight: 700, letterSpacing: .5 }}>OFF {eff.off_multiplier.toFixed(2)}×</span>
                          <span title={`DEF ${eff.def_percentile}th percentile`} style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: effBadgeBg(eff.def_multiplier), color: '#fff', fontWeight: 700, letterSpacing: .5 }}>DEF {eff.def_multiplier.toFixed(2)}×</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
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
