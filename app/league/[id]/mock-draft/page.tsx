'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FULL_POOL, POSITION_CAPS, ROSTER_SLOTS, CONFERENCES,
  type DraftUnit, type UnitType,
} from '@/lib/playerPool';

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

// Default pool: SEC + Big Ten
const ACTIVE_SCHOOLS = new Set([...CONFERENCES.SEC, ...CONFERENCES['Big Ten']]);
const POOL = FULL_POOL
  .filter(u => ACTIVE_SCHOOLS.has(u.school))
  .sort((a, b) => a.adp - b.adp);

// ── Draft math ─────────────────────────────────────────────────────────────────
function teamForPick(pickNum: number): number {
  const round = Math.floor(pickNum / NUM_TEAMS);
  const pos   = pickNum % NUM_TEAMS;
  return round % 2 === 0 ? pos : NUM_TEAMS - 1 - pos;
}

function pickForCell(round: number, teamCol: number): number {
  return round * NUM_TEAMS + (round % 2 === 0 ? teamCol : NUM_TEAMS - 1 - teamCol);
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

// ── Helpers ────────────────────────────────────────────────────────────────────
function shortLabel(unit: DraftUnit, max = 15): string {
  const s = unit.playerName ?? unit.school;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
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

function DraftSummary({ rosters, onExit }: { rosters: Rosters; onExit: () => void }) {
  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'Inter', sans-serif", padding: '32px 20px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🏈</div>
          <div style={{
            fontFamily: "'Anton', sans-serif", fontSize: 38,
            letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8,
          }}>
            Draft Complete!
          </div>
          <div style={{
            fontFamily: "'Oswald', sans-serif", fontSize: 14,
            color: C.sub, letterSpacing: 1,
          }}>
            Mock Draft 2026 · {NUM_TEAMS} Teams · {TOTAL_ROUNDS} Rounds
          </div>
        </div>

        {/* Roster grid */}
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
                    <div style={{
                      fontFamily: "'Anton', sans-serif", fontSize: 20, color: C.text,
                    }}>{totalProj}</div>
                    <div style={{
                      fontFamily: "'Oswald', sans-serif", fontSize: 9,
                      color: C.muted, letterSpacing: 1,
                    }}>PROJ PTS</div>
                  </div>
                </div>

                <div style={{ padding: '6px 0' }}>
                  {roster.map((unit, i) => {
                    const pc = POS_COLOR[unit.unitType];
                    return (
                      <div key={unit.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
                      }}>
                        <span style={{
                          fontFamily: "'Anton', sans-serif", fontSize: 10,
                          color: C.muted, width: 16,
                        }}>{i + 1}</span>
                        <span style={{
                          fontFamily: "'Oswald', sans-serif", fontSize: 10,
                          color: pc.text, background: pc.bg,
                          padding: '2px 5px', borderRadius: 3,
                          flexShrink: 0, letterSpacing: .5,
                        }}>{unit.unitType}</span>
                        <span style={{
                          fontFamily: "'Oswald', sans-serif", fontSize: 12,
                          color: C.text, flex: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{unit.playerName ?? `${unit.school} Unit`}</span>
                        <span style={{
                          fontFamily: "'Anton', sans-serif", fontSize: 12,
                          color: C.sub, flexShrink: 0,
                        }}>{unit.projectedPoints}</span>
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
          }}>
            ← Back to League Dashboard
          </button>
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

  const [picks,        setPicks]        = useState<(DraftUnit | null)[]>(Array(TOTAL_PICKS).fill(null));
  const [available,    setAvailable]    = useState<DraftUnit[]>(POOL);
  const [currentPick,  setCurrentPick]  = useState(0);
  const [filterPos,    setFilterPos]    = useState<UnitType | null>(null);
  const [timer,        setTimer]        = useState(60);
  const [complete,     setComplete]     = useState(false);
  const [rosters,      setRosters]      = useState<Rosters>(
    Object.fromEntries(Array.from({ length: NUM_TEAMS }, (_, i) => [i, [] as Roster]))
  );

  // Refs for stale-closure safety inside callbacks and effects
  const availRef   = useRef(available);
  const rostersRef = useRef(rosters);
  const pickRef    = useRef(currentPick);
  useEffect(() => { availRef.current   = available;   }, [available]);
  useEffect(() => { rostersRef.current = rosters;     }, [rosters]);
  useEffect(() => { pickRef.current    = currentPick; }, [currentPick]);

  const isUserTurn = !complete && teamForPick(currentPick) === USER_TEAM;

  // Core pick executor — works for both user and AI
  const executePick = useCallback((unit: DraftUnit) => {
    const idx     = pickRef.current;
    const teamIdx = teamForPick(idx);

    const nextAvail   = availRef.current.filter(u => u.id !== unit.id);
    const nextRosters = {
      ...rostersRef.current,
      [teamIdx]: [...rostersRef.current[teamIdx], unit],
    };

    // Sync refs immediately so next AI pick sees updated state
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
      setTimer(60);
    }
  }, []);

  // Countdown timer — only active on user's turn
  useEffect(() => {
    if (!isUserTurn || complete) return;
    if (timer <= 0) {
      const pick = aiPickUnit(rostersRef.current[USER_TEAM], availRef.current);
      if (pick) executePick(pick);
      return;
    }
    const id = setTimeout(() => setTimer(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [timer, isUserTurn, complete, executePick]);

  // AI auto-pick — fires whenever current pick belongs to an AI team
  useEffect(() => {
    if (complete) return;
    const team = teamForPick(currentPick);
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
  const currentTeam  = teamForPick(currentPick);
  const userCounts   = countPos(rosters[USER_TEAM]);
  const filteredPool = filterPos ? available.filter(u => u.unitType === filterPos) : available;

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

        <div style={{
          fontFamily: "'Oswald', sans-serif", fontSize: 11,
          color: C.muted, letterSpacing: 1, textAlign: 'right',
        }}>
          <div style={{ color: C.sub }}>{NUM_TEAMS} Teams · {TOTAL_ROUNDS} Rounds</div>
          <div>Overall Pick {currentPick + 1} / {TOTAL_PICKS}</div>
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

            {/* Team header row */}
            <div /> {/* round-label corner */}
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

            {/* Round rows — flattened to avoid keyed Fragment */}
            {Array.from({ length: TOTAL_ROUNDS }, (_, r) => [
              // Round label
              <div key={`rl${r}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Anton', sans-serif", fontSize: 11,
                color: C.muted, letterSpacing: 1, paddingTop: 2,
              }}>
                R{r + 1}
              </div>,

              // Team cells
              ...Array.from({ length: NUM_TEAMS }, (_, t) => {
                const pickIdx = pickForCell(r, t);
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
                        color: isUser ? C.gold : C.sub,
                        animation: 'pulse 1.3s ease infinite',
                      }}>
                        {isUser ? 'ON CLOCK' : 'AI…'}
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
          {/* Panel header */}
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: `1px solid ${C.surf3}`, flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10,
            }}>
              <div style={{
                fontFamily: "'Anton', sans-serif", fontSize: 13,
                letterSpacing: 2, color: C.text, textTransform: 'uppercase',
              }}>
                Available
              </div>
              <div style={{
                fontFamily: "'Oswald', sans-serif", fontSize: 11,
                color: C.muted, letterSpacing: 1,
              }}>
                ({filteredPool.length})
              </div>
            </div>

            {/* Position filters */}
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

          {/* Column header row */}
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

          {/* Scrollable pool list */}
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
              const canDraft = isUserTurn && !atCap;

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
                  {/* ADP */}
                  <div style={{
                    fontFamily: "'Anton', sans-serif", fontSize: 11,
                    color: C.muted, textAlign: 'right',
                  }}>
                    {Math.round(unit.adp)}
                  </div>

                  {/* Tier badge */}
                  <div style={{
                    width: 16, height: 16, borderRadius: 3,
                    background: TIER_COLOR[unit.tier],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Anton', sans-serif", fontSize: 9,
                    color: '#05080f',
                    flexShrink: 0,
                  }}>
                    {unit.tier[0]}
                  </div>

                  {/* Position badge */}
                  <div style={{
                    fontFamily: "'Oswald', sans-serif", fontSize: 10,
                    letterSpacing: .5, color: pc.text,
                    background: pc.bg, padding: '2px 4px', borderRadius: 3,
                    textAlign: 'center',
                  }}>
                    {unit.unitType}
                  </div>

                  {/* Player name + school */}
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
                    }}>
                      {unit.school} · {unit.conference}
                    </div>
                  </div>

                  {/* Projected points */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontFamily: "'Anton', sans-serif", fontSize: 14, color: C.text,
                    }}>
                      {unit.projectedPoints}
                    </div>
                    <div style={{
                      fontFamily: "'Oswald', sans-serif", fontSize: 9, color: C.muted,
                    }}>
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
        {/* On the clock */}
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

        {/* User roster counts vs caps */}
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
        <div style={{
          width: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isUserTurn ? (
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
