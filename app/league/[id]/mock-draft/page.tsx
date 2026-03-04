'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FULL_POOL, POSITION_CAPS, ROSTER_SLOTS, CONFERENCES,
  type DraftUnit, type UnitType,
} from '@/lib/playerPool';
import type { TeamEfficiency } from '@/types';

function multiplierFromPercentile(p: number): number {
  if (p >= 95) return 1.20;
  if (p >= 90) return 1.15;
  if (p >= 80) return 1.10;
  if (p >= 60) return 1.05;
  return 1.00;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const NUM_TEAMS    = 8;
const TOTAL_ROUNDS = ROSTER_SLOTS.starters.length + ROSTER_SLOTS.bench.length; // 15
const TOTAL_PICKS  = NUM_TEAMS * TOTAL_ROUNDS;                                   // 120
const USER_TEAM    = 0;

const TEAM_NAMES = [
  'Your Team', 'Buckeye Ballers', 'Crimson Crushers', 'Dawg Pack',
  'Longhorn Legion', 'Bayou Bengals', 'Lion Den', 'Duck Dynasty',
];

const POS_COLOR: Record<UnitType, { text: string; bg: string; border: string }> = {
  QB:  { text: '#7ab3e8', bg: 'rgba(74,144,217,0.18)',  border: 'rgba(74,144,217,0.45)'  },
  RB:  { text: '#5dca85', bg: 'rgba(39,174,96,0.18)',   border: 'rgba(39,174,96,0.45)'   },
  WR:  { text: '#d4a828', bg: 'rgba(212,168,40,0.18)',  border: 'rgba(212,168,40,0.45)'  },
  TE:  { text: '#e8914a', bg: 'rgba(230,126,34,0.18)',  border: 'rgba(230,126,34,0.45)'  },
  DEF: { text: '#e8614a', bg: 'rgba(231,76,60,0.18)',   border: 'rgba(231,76,60,0.45)'   },
  K:   { text: '#95a5b5', bg: 'rgba(127,140,141,0.18)', border: 'rgba(127,140,141,0.45)' },
};

const TIER_COLOR: Record<string, string> = {
  Elite: '#d4a828',
  Solid: '#7a90b0',
  Depth: '#4a5d7a',
};

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a', muted: '#4a5d7a',
  text: '#e8edf5', sub: '#7a90b0', red: '#e74c3c', green: '#2ecc71',
};

// Pool: all 5 supported conferences
const ACTIVE_SCHOOLS = new Set([
  ...CONFERENCES.SEC,
  ...CONFERENCES['Big Ten'],
  ...CONFERENCES['Big 12'],
  ...CONFERENCES.ACC,
  ...CONFERENCES['FBS Independents'],
]);
const POOL = FULL_POOL
  .filter(u => ACTIVE_SCHOOLS.has(u.school))
  .sort((a, b) => a.adp - b.adp);

// ── Settings ───────────────────────────────────────────────────────────────────
type DraftType     = 'snake' | 'linear';
type DraftSettings = { draftType: DraftType; timerSeconds: number; autoPick: boolean };
const DEFAULT_SETTINGS: DraftSettings = { draftType: 'snake', timerSeconds: 60, autoPick: false };

// ── Draft math ─────────────────────────────────────────────────────────────────
function teamForPick(pickNum: number, dt: DraftType = 'snake'): number {
  const round = Math.floor(pickNum / NUM_TEAMS);
  const pos   = pickNum % NUM_TEAMS;
  return (dt === 'linear' || round % 2 === 0) ? pos : NUM_TEAMS - 1 - pos;
}

function pickForCell(round: number, col: number, dt: DraftType = 'snake'): number {
  return round * NUM_TEAMS + (dt === 'snake' && round % 2 === 1 ? NUM_TEAMS - 1 - col : col);
}

// ── AI helpers ─────────────────────────────────────────────────────────────────
type Roster  = DraftUnit[];
type Rosters = Record<number, Roster>;

function countPos(roster: Roster): Record<UnitType, number> {
  const c: Record<UnitType, number> = { QB: 0, RB: 0, WR: 0, TE: 0, DEF: 0, K: 0 };
  for (const u of roster) c[u.unitType]++;
  return c;
}

function aiPickUnit(roster: Roster, available: DraftUnit[]): DraftUnit | null {
  if (!available.length) return null;
  const c     = countPos(roster);
  const valid = available.filter(u => c[u.unitType] < POSITION_CAPS[u.unitType]);
  const pool  = (valid.length ? valid : available).slice(0, 3);
  return pool[Math.floor(Math.random() * pool.length)];
}

function shortLabel(unit: DraftUnit, max = 15): string {
  const s = unit.playerName ?? unit.school;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ── FilterBtn ──────────────────────────────────────────────────────────────────
function FilterBtn({
  active, onClick, color, children,
}: {
  active: boolean; onClick: () => void; color: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        background: active ? `${color}28` : 'transparent',
        border:     `1px solid ${active ? color : C.surf3}`,
        borderRadius: 4, cursor: 'pointer',
        fontFamily: "'Oswald', sans-serif", fontSize: 10,
        letterSpacing: 1, textTransform: 'uppercase',
        color: active ? color : C.muted,
        transition: 'all .15s',
      }}
    >
      {children}
    </button>
  );
}

// ── SettingsModal ──────────────────────────────────────────────────────────────
function SettingsModal({
  settings, onSave, onClose, draftStarted,
}: {
  settings: DraftSettings;
  onSave: (s: DraftSettings, restart: boolean) => void;
  onClose: () => void;
  draftStarted: boolean;
}) {
  const [local, setLocal] = useState<DraftSettings>(settings);
  const typeChanged = draftStarted && local.draftType !== settings.draftType;

  const TIMER_OPTS = [
    { label: '15s', value: 15 },
    { label: '30s', value: 30 },
    { label: '60s', value: 60 },
    { label: '90s', value: 90 },
    { label: '∞',   value: 0  },
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surf, border: `1px solid ${C.surf3}`,
          borderRadius: 14, padding: '28px 28px 24px', width: 430, maxWidth: '94vw',
        }}
      >
        {/* Title */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 26,
        }}>
          <div style={{
            fontFamily: "'Anton', sans-serif", fontSize: 17,
            letterSpacing: 3, color: C.text, textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Draft Settings
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.muted, fontSize: 17, lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {/* Draft Type */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontSize: 10,
            letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10,
          }}>Draft Type</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['snake', 'linear'] as DraftType[]).map(t => (
              <button
                key={t}
                onClick={() => setLocal(d => ({ ...d, draftType: t }))}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, cursor: 'pointer',
                  fontFamily: "'Oswald', sans-serif", fontSize: 12,
                  letterSpacing: 1, textTransform: 'uppercase',
                  background: local.draftType === t ? `${C.gold}1a` : C.surf2,
                  border: `1px solid ${local.draftType === t ? C.gold : C.surf3}`,
                  color: local.draftType === t ? C.gold : C.sub,
                  transition: 'all .15s',
                }}
              >
                {t === 'snake' ? '🐍 Snake' : '→ Linear'}
                <div style={{
                  fontFamily: "'Oswald', sans-serif", fontSize: 9,
                  color: local.draftType === t ? `${C.gold}99` : C.muted,
                  marginTop: 3, textTransform: 'none', letterSpacing: .3,
                }}>
                  {t === 'snake' ? 'Serpentine order' : 'Same order every round'}
                </div>
              </button>
            ))}
          </div>
          {typeChanged && (
            <div style={{
              marginTop: 8, padding: '6px 10px', borderRadius: 6,
              background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.3)',
              fontFamily: "'Oswald', sans-serif", fontSize: 10, color: C.red, letterSpacing: .3,
            }}>⚠ Changing draft type will restart the draft</div>
          )}
        </div>

        {/* Pick Timer */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontSize: 10,
            letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10,
          }}>Pick Timer</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TIMER_OPTS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setLocal(d => ({ ...d, timerSeconds: opt.value }))}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                  fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: .5,
                  background: local.timerSeconds === opt.value ? `${C.gold}1a` : C.surf2,
                  border: `1px solid ${local.timerSeconds === opt.value ? C.gold : C.surf3}`,
                  color: local.timerSeconds === opt.value ? C.gold : C.sub,
                  transition: 'all .15s',
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Auto Pick */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontSize: 10,
            letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10,
          }}>Auto Pick</div>
          <button
            onClick={() => setLocal(d => ({ ...d, autoPick: !d.autoPick }))}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: local.autoPick ? 'rgba(46,204,113,0.08)' : C.surf2,
              border: `1px solid ${local.autoPick ? C.green : C.surf3}`,
              transition: 'all .15s',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontFamily: "'Oswald', sans-serif", fontSize: 12, letterSpacing: .5,
                color: local.autoPick ? C.green : C.sub,
              }}>
                {local.autoPick ? 'Enabled — AI picks for you' : 'Disabled — You pick manually'}
              </div>
              <div style={{
                fontFamily: "'Oswald', sans-serif", fontSize: 10, color: C.muted, marginTop: 2,
              }}>
                Simulate a fully automated draft
              </div>
            </div>
            {/* Toggle pill */}
            <div style={{
              width: 38, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
              background: local.autoPick ? C.green : C.surf3, transition: 'background .2s',
            }}>
              <div style={{
                position: 'absolute', top: 2, borderRadius: '50%',
                width: 16, height: 16, background: '#fff',
                left: local.autoPick ? 20 : 2, transition: 'left .2s',
              }} />
            </div>
          </button>
        </div>

        {/* Save */}
        <button
          onClick={() => onSave(local, typeChanged)}
          style={{
            width: '100%', padding: '13px 0',
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: "'Anton', sans-serif", fontSize: 14,
            letterSpacing: 2, textTransform: 'uppercase', color: C.bg,
          }}
        >
          {typeChanged ? 'Save & Restart Draft' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ── DraftSummary ───────────────────────────────────────────────────────────────
function DraftSummary({ rosters, onExit }: { rosters: Rosters; onExit: () => void }) {
  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'Inter', sans-serif", padding: '32px 20px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🏈</div>
          <div style={{
            fontFamily: "'Anton', sans-serif", fontSize: 38,
            letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8,
          }}>Draft Complete!</div>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontSize: 14,
            color: C.sub, letterSpacing: 1,
          }}>Mock Draft 2026 · {NUM_TEAMS} Teams · {TOTAL_ROUNDS} Rounds</div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: 16, marginBottom: 36,
        }}>
          {Array.from({ length: NUM_TEAMS }, (_, t) => {
            const roster    = rosters[t] ?? [];
            const totalProj = roster.reduce((s, u) => s + u.projectedPoints, 0);
            const isUser    = t === USER_TEAM;
            return (
              <div key={t} style={{
                background: C.surf,
                border:     `1px solid ${isUser ? C.gold : C.surf3}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '12px 14px',
                  background:   isUser ? 'rgba(212,168,40,0.1)' : C.surf2,
                  borderBottom: `1px solid ${isUser ? C.gold : C.surf3}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{
                      fontFamily: "'Anton', sans-serif", fontSize: 14,
                      letterSpacing: 1, color: isUser ? C.gold : C.text,
                      textTransform: 'uppercase',
                    }}>{TEAM_NAMES[t]}</div>
                    {isUser && (
                      <div style={{
                        fontFamily: "'Oswald', sans-serif", fontSize: 9,
                        color: C.gold, letterSpacing: 2, textTransform: 'uppercase',
                      }}>★ Your Team</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 20, color: C.text }}>{totalProj}</div>
                    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 9, color: C.muted, letterSpacing: 1 }}>PROJ PTS</div>
                  </div>
                </div>

                <div style={{ padding: '6px 0' }}>
                  {roster.map((unit, i) => {
                    const pc = POS_COLOR[unit.unitType];
                    return (
                      <div key={unit.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px' }}>
                        <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 10, color: C.muted, width: 16 }}>{i + 1}</span>
                        <span style={{
                          fontFamily: "'Oswald', sans-serif", fontSize: 10,
                          color: pc.text, background: pc.bg,
                          padding: '2px 5px', borderRadius: 3, flexShrink: 0, letterSpacing: .5,
                        }}>{unit.unitType}</span>
                        <span style={{
                          fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.text, flex: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{unit.playerName ?? `${unit.school} Unit`}</span>
                        <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 12, color: C.sub, flexShrink: 0 }}>{unit.projectedPoints}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button onClick={onExit} style={{
            padding: '14px 40px',
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: "'Anton', sans-serif", fontSize: 15,
            letterSpacing: 2, textTransform: 'uppercase', color: C.bg,
          }}>← Back to League Dashboard</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MockDraftPage() {
  const params   = useParams();
  const router   = useRouter();
  const leagueId = params.id as string;

  const [settings,       setSettings]     = useState<DraftSettings>(DEFAULT_SETTINGS);
  const [showSettings,   setShowSettings] = useState(false);
  const [efficiencyMap,  setEfficiencyMap] = useState<Record<string, TeamEfficiency>>({});
  const [picks,          setPicks]        = useState<(DraftUnit | null)[]>(Array(TOTAL_PICKS).fill(null));
  const [available,    setAvailable]    = useState<DraftUnit[]>(POOL);
  const [currentPick,  setCurrentPick]  = useState(0);
  const [filterPos,    setFilterPos]    = useState<UnitType | null>(null);
  const [timer,        setTimer]        = useState(DEFAULT_SETTINGS.timerSeconds);
  const [complete,     setComplete]     = useState(false);
  const [rosters,      setRosters]      = useState<Rosters>(
    Object.fromEntries(Array.from({ length: NUM_TEAMS }, (_, i) => [i, [] as Roster]))
  );

  const availRef    = useRef(available);
  const rostersRef  = useRef(rosters);
  const pickRef     = useRef(currentPick);
  const settingsRef = useRef(settings);
  useEffect(() => { availRef.current    = available;   }, [available]);
  useEffect(() => { rostersRef.current  = rosters;     }, [rosters]);
  useEffect(() => { pickRef.current     = currentPick; }, [currentPick]);
  useEffect(() => { settingsRef.current = settings;    }, [settings]);

  // Fetch current-week efficiency data on mount (best-effort; no error shown if unavailable)
  useEffect(() => {
    const season = new Date().getFullYear();
    const week = 1; // Replace with current week from league once weekly tracking is live
    fetch(`/api/efficiency?week=${week}&season=${season}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data?.length) return;
        const map: Record<string, TeamEfficiency> = {};
        for (const row of json.data as TeamEfficiency[]) map[row.school] = row;
        setEfficiencyMap(map);
      })
      .catch(() => {/* silently ignore — efficiency badges are non-critical */});
  }, []);

  const isUserTurn = !complete && teamForPick(currentPick, settings.draftType) === USER_TEAM;

  // ── Restart draft ─────────────────────────────────────────────────────────────
  const restartDraft = useCallback((newSettings: DraftSettings) => {
    const emptyRosters = Object.fromEntries(Array.from({ length: NUM_TEAMS }, (_, i) => [i, [] as Roster]));
    setSettings(newSettings);
    settingsRef.current = newSettings;
    setPicks(Array(TOTAL_PICKS).fill(null));
    setAvailable(POOL);
    availRef.current = POOL;
    setCurrentPick(0);
    pickRef.current = 0;
    setTimer(newSettings.timerSeconds || 60);
    setComplete(false);
    setRosters(emptyRosters);
    rostersRef.current = emptyRosters;
    setShowSettings(false);
  }, []);

  // ── Handle settings save ──────────────────────────────────────────────────────
  const handleSaveSettings = useCallback((newSettings: DraftSettings, restart: boolean) => {
    if (restart) {
      restartDraft(newSettings);
    } else {
      setSettings(newSettings);
      if (newSettings.timerSeconds !== settingsRef.current.timerSeconds) {
        setTimer(newSettings.timerSeconds || 60);
      }
      setShowSettings(false);
    }
  }, [restartDraft]);

  // ── Core pick executor ────────────────────────────────────────────────────────
  const executePick = useCallback((unit: DraftUnit) => {
    const idx     = pickRef.current;
    const teamIdx = teamForPick(idx, settingsRef.current.draftType);

    const nextAvail   = availRef.current.filter(u => u.id !== unit.id);
    const nextRosters = {
      ...rostersRef.current,
      [teamIdx]: [...rostersRef.current[teamIdx], unit],
    };

    availRef.current   = nextAvail;
    rostersRef.current = nextRosters;

    setPicks(prev => { const n = [...prev]; n[idx] = unit; return n; });
    setAvailable(nextAvail);
    setRosters(nextRosters);

    const next = idx + 1;
    if (next >= TOTAL_PICKS) {
      setComplete(true);
    } else {
      pickRef.current = next;
      setCurrentPick(next);
      setTimer(settingsRef.current.timerSeconds || 60);
    }
  }, []);

  // ── Countdown timer (user turn only, skipped when timerSeconds === 0) ─────────
  useEffect(() => {
    if (!isUserTurn || complete || settings.timerSeconds === 0) return;
    if (timer <= 0) {
      const pick = aiPickUnit(rostersRef.current[USER_TEAM], availRef.current);
      if (pick) executePick(pick);
      return;
    }
    const id = setTimeout(() => setTimer(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [timer, isUserTurn, complete, executePick, settings.timerSeconds]);

  // ── Auto-pick for user when autoPick is enabled ───────────────────────────────
  useEffect(() => {
    if (complete || !isUserTurn || !settings.autoPick) return;
    const delay = 700 + Math.random() * 700;
    const id = setTimeout(() => {
      const pick = aiPickUnit(rostersRef.current[USER_TEAM], availRef.current);
      if (pick) executePick(pick);
    }, delay);
    return () => clearTimeout(id);
  }, [currentPick, isUserTurn, complete, executePick, settings.autoPick]);

  // ── AI auto-pick for AI teams ─────────────────────────────────────────────────
  useEffect(() => {
    if (complete) return;
    const team = teamForPick(currentPick, settingsRef.current.draftType);
    if (team === USER_TEAM) return;
    const delay = 600 + Math.random() * 900;
    const id = setTimeout(() => {
      const pick = aiPickUnit(rostersRef.current[team], availRef.current);
      if (pick) executePick(pick);
    }, delay);
    return () => clearTimeout(id);
  }, [currentPick, complete, executePick]);

  if (complete) {
    return (
      <DraftSummary
        rosters={rosters}
        onExit={() => router.push(`/league/${leagueId}`)}
      />
    );
  }

  const round        = Math.floor(currentPick / NUM_TEAMS) + 1;
  const slotInRound  = (currentPick % NUM_TEAMS) + 1;
  const currentTeam  = teamForPick(currentPick, settings.draftType);
  const userCounts   = countPos(rosters[USER_TEAM]);
  const filteredPool = filterPos ? available.filter(u => u.unitType === filterPos) : available;
  const draftStarted = currentPick > 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif",
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.55} }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background:${C.surf}; }
        ::-webkit-scrollbar-thumb { background:${C.surf3}; border-radius:3px; }
        ::-webkit-scrollbar-thumb:hover { background:${C.muted}; }
      `}</style>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
          draftStarted={draftStarted}
        />
      )}

      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 58, flexShrink: 0,
        background: C.surf, borderBottom: `1px solid ${C.surf3}`,
      }}>
        <button
          onClick={() => router.push(`/league/${leagueId}`)}
          style={{
            padding: '7px 16px', background: 'transparent',
            border: `1px solid ${C.surf3}`, borderRadius: 6, cursor: 'pointer',
            fontFamily: "'Oswald', sans-serif", fontSize: 11,
            letterSpacing: 2, textTransform: 'uppercase', color: C.sub,
            transition: 'all .15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = C.muted;
            (e.currentTarget as HTMLElement).style.color = C.text;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = C.surf3;
            (e.currentTarget as HTMLElement).style.color = C.sub;
          }}
        >
          ← Exit Mock Draft
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Anton', sans-serif", fontSize: 17,
            letterSpacing: 3, color: C.gold, textTransform: 'uppercase',
          }}>
            Mock Draft 2026
          </div>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontSize: 11,
            color: C.sub, letterSpacing: 1,
          }}>
            Round {round} of {TOTAL_ROUNDS} · Pick {slotInRound} of {NUM_TEAMS}
          </div>
        </div>

        {/* Right: info + gear icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontSize: 11,
            color: C.muted, letterSpacing: 1, textAlign: 'right',
          }}>
            <div style={{ color: C.sub }}>{NUM_TEAMS} Teams · {TOTAL_ROUNDS} Rounds</div>
            <div>Overall Pick {currentPick + 1} / {TOTAL_PICKS}</div>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            title="Draft Settings"
            style={{
              width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${C.surf3}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.muted, transition: 'all .15s', flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.gold;
              (e.currentTarget as HTMLElement).style.color = C.gold;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.surf3;
              (e.currentTarget as HTMLElement).style.color = C.muted;
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Draft Board ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `44px repeat(${NUM_TEAMS}, minmax(110px, 1fr))`,
            gap: 2,
            minWidth: NUM_TEAMS * 112 + 48,
          }}>

            <div />
            {Array.from({ length: NUM_TEAMS }, (_, t) => (
              <div key={`h${t}`} style={{
                padding: '6px 4px', textAlign: 'center',
                fontFamily: "'Oswald', sans-serif", fontSize: 10,
                letterSpacing: 1, textTransform: 'uppercase',
                color:      t === USER_TEAM ? C.gold : C.sub,
                background: t === USER_TEAM ? 'rgba(212,168,40,0.07)' : 'transparent',
                borderRadius: '4px 4px 0 0',
                borderBottom: `2px solid ${t === USER_TEAM ? C.gold : C.surf3}`,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {TEAM_NAMES[t]}
              </div>
            ))}

            {Array.from({ length: TOTAL_ROUNDS }, (_, r) => [
              <div key={`rl${r}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Anton', sans-serif", fontSize: 11,
                color: C.muted, letterSpacing: 1, paddingTop: 2,
              }}>
                R{r + 1}
              </div>,

              ...Array.from({ length: NUM_TEAMS }, (_, t) => {
                const pickIdx = pickForCell(r, t, settings.draftType);
                const unit    = picks[pickIdx];
                const isCur   = pickIdx === currentPick;
                const isPast  = pickIdx < currentPick;
                const isUser  = t === USER_TEAM;
                const pc      = unit ? POS_COLOR[unit.unitType] : null;

                return (
                  <div key={`${r}-${t}`} style={{
                    minHeight: 52, padding: '5px 6px', position: 'relative',
                    background: isCur
                      ? (isUser ? 'rgba(212,168,40,0.12)' : 'rgba(122,144,176,0.06)')
                      : (unit ? pc!.bg : C.surf),
                    border: `1px solid ${
                      isCur
                        ? (isUser ? C.gold : C.surf3)
                        : (unit ? pc!.border : C.surf3)
                    }`,
                    borderRadius: 4,
                    transition: 'background .2s, border-color .2s',
                    opacity: (!unit && isPast) ? 0.3 : 1,
                  }}>
                    {unit ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                          <span style={{
                            fontFamily: "'Oswald', sans-serif", fontSize: 9,
                            letterSpacing: .5, color: pc!.text,
                            background: pc!.bg, padding: '1px 4px', borderRadius: 3,
                          }}>
                            {unit.unitType}
                          </span>
                          <span style={{
                            fontFamily: "'Oswald', sans-serif", fontSize: 8,
                            color: TIER_COLOR[unit.tier],
                          }}>
                            {unit.tier[0]}
                          </span>
                        </div>
                        <div style={{
                          fontFamily: "'Oswald', sans-serif", fontSize: 11,
                          color: C.text, lineHeight: 1.25,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {shortLabel(unit)}
                        </div>
                        {unit.playerName && (
                          <div style={{
                            fontFamily: "'Oswald', sans-serif", fontSize: 9,
                            color: C.muted, marginTop: 1,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {unit.school}
                          </div>
                        )}
                      </>
                    ) : isCur ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '100%', minHeight: 40,
                        fontFamily: "'Oswald', sans-serif", fontSize: 9,
                        letterSpacing: 1.5, textTransform: 'uppercase',
                        color: isUser && !settings.autoPick ? C.gold : C.sub,
                        animation: 'pulse 1.3s ease infinite',
                      }}>
                        {isUser && !settings.autoPick ? 'ON CLOCK' : 'AI…'}
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '100%', minHeight: 40,
                        fontFamily: "'Anton', sans-serif", fontSize: 10,
                        color: C.surf3,
                      }}>
                        {pickIdx + 1}
                      </div>
                    )}
                  </div>
                );
              }),
            ]).flat()}
          </div>
        </div>

        {/* ── Player Pool Panel ── */}
        <div style={{
          width: 358, borderLeft: `1px solid ${C.surf3}`,
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          background: C.surf,
        }}>
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: `1px solid ${C.surf3}`, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <div style={{
                fontFamily: "'Anton', sans-serif", fontSize: 13,
                letterSpacing: 2, color: C.text, textTransform: 'uppercase',
              }}>Available</div>
              <div style={{
                fontFamily: "'Oswald', sans-serif", fontSize: 11,
                color: C.muted, letterSpacing: 1,
              }}>({filteredPool.length})</div>
            </div>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <FilterBtn active={filterPos === null} onClick={() => setFilterPos(null)} color={C.gold}>
                All
              </FilterBtn>
              {(['QB', 'RB', 'WR', 'TE', 'DEF', 'K'] as UnitType[]).map(pos => (
                <FilterBtn
                  key={pos}
                  active={filterPos === pos}
                  onClick={() => setFilterPos(p => p === pos ? null : pos)}
                  color={POS_COLOR[pos].text}
                >
                  {pos}
                </FilterBtn>
              ))}
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '28px 16px 34px 1fr 50px',
            gap: 8, padding: '6px 14px',
            borderBottom: `1px solid ${C.surf3}`, flexShrink: 0,
          }}>
            {(['ADP', '', 'POS', 'PLAYER', 'PROJ'] as const).map(h => (
              <div key={h} style={{
                fontFamily: "'Oswald', sans-serif", fontSize: 9,
                letterSpacing: 1, color: C.muted, textTransform: 'uppercase',
                textAlign: h === 'PROJ' ? 'right' : 'left',
              }}>
                {h}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredPool.length === 0 ? (
              <div style={{
                padding: 24, textAlign: 'center',
                fontFamily: "'Oswald', sans-serif", fontSize: 12,
                color: C.muted, letterSpacing: 1,
              }}>
                No units available
              </div>
            ) : filteredPool.map(unit => {
              const pc       = POS_COLOR[unit.unitType];
              const atCap    = userCounts[unit.unitType] >= POSITION_CAPS[unit.unitType];
              const canDraft = isUserTurn && !atCap && !settings.autoPick;

              return (
                <div
                  key={unit.id}
                  onClick={() => canDraft && executePick(unit)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 16px 34px 1fr 50px',
                    alignItems: 'center', gap: 8,
                    padding: '8px 14px',
                    borderBottom: `1px solid ${C.surf3}`,
                    cursor:  canDraft ? 'pointer' : 'default',
                    opacity: atCap ? 0.36 : 1,
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => {
                    if (canDraft)
                      (e.currentTarget as HTMLElement).style.background = C.surf2;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <div style={{
                    fontFamily: "'Anton', sans-serif", fontSize: 11,
                    color: C.muted, textAlign: 'right',
                  }}>
                    {Math.round(unit.adp)}
                  </div>

                  <div style={{
                    width: 16, height: 16, borderRadius: 3,
                    background: TIER_COLOR[unit.tier],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Anton', sans-serif", fontSize: 9,
                    color: '#05080f', flexShrink: 0,
                  }}>
                    {unit.tier[0]}
                  </div>

                  <div style={{
                    fontFamily: "'Oswald', sans-serif", fontSize: 10,
                    letterSpacing: .5, color: pc.text,
                    background: pc.bg, padding: '2px 4px', borderRadius: 3,
                    textAlign: 'center',
                  }}>
                    {unit.unitType}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Oswald', sans-serif", fontSize: 13,
                      color: canDraft ? C.text : C.sub,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {unit.playerName ?? `${unit.school} Unit`}
                    </div>
                    <div style={{
                      fontFamily: "'Oswald', sans-serif", fontSize: 10,
                      color: C.muted, letterSpacing: .3,
                      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                    }}>
                      <span>{unit.school} · {unit.conference}</span>
                      {(() => {
                        const eff = efficiencyMap[unit.school];
                        if (!eff) return null;
                        const isOff = unit.unitType !== 'DEF';
                        const pct = isOff ? eff.off_percentile : eff.def_percentile;
                        const mult = isOff ? eff.off_multiplier : eff.def_multiplier;
                        if (mult === 1.00) return null;
                        const bg = mult >= 1.15 ? '#16a34a' : mult >= 1.10 ? '#15803d' : '#a16207';
                        return (
                          <span title={`${isOff ? 'OFF' : 'DEF'} ${pct}th percentile`} style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: .5,
                            background: bg, color: '#fff',
                            padding: '1px 4px', borderRadius: 3,
                          }}>
                            {isOff ? 'OFF' : 'DEF'} {mult.toFixed(2)}×
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 14, color: C.text }}>
                      {unit.projectedPoints}
                    </div>
                    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 9, color: C.muted }}>
                      pts
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom Bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 20px', height: 68, flexShrink: 0,
        background: C.surf, borderTop: `1px solid ${C.surf3}`,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontSize: 9,
            color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2,
          }}>
            On the Clock
          </div>
          <div style={{
            fontFamily: "'Anton', sans-serif", fontSize: 19,
            letterSpacing: 1, color: currentTeam === USER_TEAM ? C.gold : C.text,
            display: 'flex', alignItems: 'baseline', gap: 10,
          }}>
            {TEAM_NAMES[currentTeam]}
            <span style={{
              fontFamily: "'Oswald', sans-serif", fontSize: 11,
              color: C.sub, letterSpacing: 1, fontWeight: 400,
            }}>
              Rd {round} · Pk {slotInRound}
            </span>
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '0 16px',
          borderLeft: `1px solid ${C.surf3}`, borderRight: `1px solid ${C.surf3}`,
        }}>
          {(['QB', 'RB', 'WR', 'TE', 'DEF', 'K'] as UnitType[]).map(pos => {
            const count = userCounts[pos];
            const cap   = POSITION_CAPS[pos];
            const full  = count >= cap;
            return (
              <div key={pos} style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: "'Anton', sans-serif", fontSize: 14,
                  color: full ? C.muted : (count > 0 ? POS_COLOR[pos].text : C.surf3),
                }}>
                  {count}
                  <span style={{ color: C.surf3, fontSize: 10 }}>/{cap}</span>
                </div>
                <div style={{
                  fontFamily: "'Oswald', sans-serif", fontSize: 9,
                  color: C.muted, letterSpacing: .5,
                }}>
                  {pos}
                </div>
              </div>
            );
          })}
        </div>

        {/* Timer / AI indicator */}
        <div style={{ width: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isUserTurn && !settings.autoPick ? (
            settings.timerSeconds === 0 ? (
              <div style={{
                width: 68, height: 52, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(212,168,40,0.1)', border: `2px solid ${C.gold}`,
              }}>
                <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, color: C.gold }}>∞</div>
              </div>
            ) : (
              <div style={{
                width: 68, height: 52, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: timer <= 10 ? 'rgba(231,76,60,0.15)' : 'rgba(212,168,40,0.1)',
                border: `2px solid ${timer <= 10 ? C.red : C.gold}`,
                animation: timer <= 10 ? 'blink .7s ease infinite' : 'none',
              }}>
                <div style={{
                  fontFamily: "'Anton', sans-serif", fontSize: 30,
                  color: timer <= 10 ? C.red : C.gold,
                  letterSpacing: -1, lineHeight: 1,
                }}>
                  {timer}
                </div>
              </div>
            )
          ) : (
            <div style={{
              fontFamily: "'Oswald', sans-serif", fontSize: 10,
              color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase',
              textAlign: 'center', animation: 'pulse 1.5s ease infinite',
            }}>
              AI<br />Picking…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
