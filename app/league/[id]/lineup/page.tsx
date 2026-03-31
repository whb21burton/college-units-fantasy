'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import type { DraftUnit } from '@/lib/playerPool';

const C = {
  bg:    '#070a12',
  surf:  '#0c1422',
  surf2: '#111d30',
  surf3: '#1a2b40',
  gold:  '#f5a623',
  text:  '#e4edf7',
  sub:   '#7a92aa',
  muted: '#3e5470',
  green: '#15c678',
  red:   '#f03a5a',
};

const BUDGET = 200;

type LineupSlot = {
  key: string;
  label: string;
  accepts: string[];
};

const SLOTS: LineupSlot[] = [
  { key: 'QB',   label: 'QB',   accepts: ['QB']            },
  { key: 'RB1',  label: 'RB',   accepts: ['RB']            },
  { key: 'RB2',  label: 'RB',   accepts: ['RB']            },
  { key: 'WR1',  label: 'WR',   accepts: ['WR']            },
  { key: 'WR2',  label: 'WR',   accepts: ['WR']            },
  { key: 'TE',   label: 'TE',   accepts: ['TE']            },
  { key: 'FLEX', label: 'FLEX', accepts: ['RB', 'WR', 'TE'] },
  { key: 'DEF',  label: 'DEF',  accepts: ['DEF']           },
  { key: 'K',    label: 'K',    accepts: ['K']             },
];

const POS_COLOR: Record<string, string> = {
  QB:  '#e05c2a',
  RB:  '#2a9d8f',
  WR:  '#3a86ff',
  TE:  '#8338ec',
  DEF: '#2b9348',
  K:   '#e9c46a',
};

function positionRankPrice(unit: DraftUnit, allUnits: DraftUnit[], isConference = false): number {
  const peers = [...allUnits]
    .filter(u => u.unitType === unit.unitType)
    .sort((a, b) => (b.seasonTotal ?? b.projectedPoints) - (a.seasonTotal ?? a.projectedPoints));
  const rank = peers.findIndex(u => u.id === unit.id) + 1;
  if (isConference) {
    if (rank <= 3)  return 50;
    if (rank <= 6)  return 40;
    if (rank <= 9)  return 30;
    if (rank <= 12) return 20;
    return 10;
  }
  if (rank <= 10) return 50;
  if (rank <= 20) return 40;
  if (rank <= 30) return 30;
  if (rank <= 40) return 20;
  return 10;
}

function pillStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: 20,
    background: bg, color,
    fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
  };
}

export default function LineupPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  const [league,        setLeague]        = useState<any>(null);
  const [userId,        setUserId]        = useState<string | null>(null);
  const [pool,          setPool]          = useState<DraftUnit[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [submitted,     setSubmitted]     = useState(false);  // has a saved lineup
  const [editing,       setEditing]       = useState(false);  // editing an existing lineup
  const [firstGameTime, setFirstGameTime] = useState<string | null>(null);
  // week is always locked to the league's contest week — no user choice
  const week = league?.week ?? 1;
  const [search,    setSearch]    = useState('');
  const [posFilter, setPosFilter] = useState<string>('ALL');

  // slot key → picked unit
  const [lineup, setLineup] = useState<Record<string, DraftUnit | null>>(() => {
    const init: Record<string, DraftUnit | null> = {};
    SLOTS.forEach(s => { init[s.key] = null; });
    return init;
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      setUserId(user.id);

      const { data: lg } = await supabase
        .from('leagues')
        .select('id, name, league_type, status, conference_filter, week')
        .eq('id', params.id)
        .single();
      if (!lg || lg.league_type !== 'weekly') { router.push(`/league/${params.id}`); return; }
      setLeague(lg);

      // Check membership
      const { data: m } = await supabase
        .from('league_members')
        .select('id')
        .eq('league_id', params.id)
        .eq('user_id', user.id)
        .single();
      if (!m) { router.push(`/leagues`); return; }

      // Load player pool
      const confParam = lg.conference_filter && lg.conference_filter !== 'ALL'
        ? `?conference=${encodeURIComponent(lg.conference_filter)}`
        : '';
      const poolRes = await fetch(`/api/player-pool${confParam}`);
      if (poolRes.ok) {
        const data = await poolRes.json();
        setPool(Array.isArray(data) ? data : []);
      }

      // Load existing lineup for this league's contest week
      const contestWeek = lg.week ?? 1;
      const { data: existing } = await supabase
        .from('draft_picks')
        .select('*')
        .eq('league_id', params.id)
        .eq('user_id', user.id)
        .eq('week', contestWeek)
        .eq('entry_type', 'lineup');

      if (existing && existing.length > 0) {
        const restored: Record<string, DraftUnit | null> = {};
        SLOTS.forEach(s => { restored[s.key] = null; });
        for (const pick of existing) {
          // slot is stored inside player_data._slot (avoids PostgREST schema cache issues)
          const slot = pick.player_data?._slot ?? pick.slot;
          if (slot && restored[slot] !== undefined && pick.player_data) {
            const { _slot: _s, _salary: _sal, ...unitData } = pick.player_data;
            restored[slot] = unitData as DraftUnit;
          }
        }
        setLineup(restored);
        setSubmitted(true); // already have a submitted lineup → show view mode
      }

      // Fetch first game time for lock logic
      const contestWeek2 = lg.week ?? 1;
      fetch(`/api/matchup-context?week=${contestWeek2}&season=2025`)
        .then(r => r.json())
        .then(d => setFirstGameTime(d.firstGameTime ?? null))
        .catch(() => {});

      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Prices computed once for the full pool
  const isConference = !!(league?.conference_filter && league.conference_filter !== 'ALL');
  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    pool.forEach(u => { m[u.id] = positionRankPrice(u, pool, isConference); });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, isConference]);

  // IDs already in lineup (to gray out in pool)
  const pickedIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(lineup).forEach(u => { if (u) s.add(u.id); });
    return s;
  }, [lineup]);

  const totalSalary = useMemo(() =>
    Object.values(lineup).reduce((sum, u) => sum + (u ? (priceMap[u.id] ?? 0) : 0), 0),
  [lineup, priceMap]);

  const remaining = BUDGET - totalSalary;
  const filledCount = Object.values(lineup).filter(Boolean).length;
  const isComplete = filledCount === SLOTS.length;

  // Filtered pool for the right panel
  const filteredPool = useMemo(() => {
    return pool.filter(u => {
      if (posFilter !== 'ALL' && u.unitType !== posFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!u.school.toLowerCase().includes(q) &&
            !(u.playerName ?? '').toLowerCase().includes(q) &&
            !u.conference.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pool, posFilter, search]);

  function pickUnit(slotKey: string, unit: DraftUnit) {
    setLineup(prev => ({ ...prev, [slotKey]: unit }));
    setSaved(false);
  }

  function clearSlot(slotKey: string) {
    setLineup(prev => ({ ...prev, [slotKey]: null }));
    setSaved(false);
  }

  // Auto-assign to best empty matching slot
  function autoAdd(unit: DraftUnit) {
    const pos = unit.unitType;
    // Find first matching slot that's empty, respecting slot order
    for (const slot of SLOTS) {
      if (slot.accepts.includes(pos) && !lineup[slot.key]) {
        pickUnit(slot.key, unit);
        return;
      }
    }
  }

  async function submitLineup() {
    if (!isComplete) return;
    setSaving(true);
    try {
      // slot (s.label) = position label used for validation counts (RB, RB, WR, WR…)
      // slot_key (s.key) = unique slot identifier for restoration (RB1, RB2, WR1, WR2…)
      const picks = SLOTS.map(s => ({
        unit_id:     lineup[s.key]!.id,
        slot:        s.label,      // QB / RB / WR / TE / FLEX / DEF / K — for count validation
        slot_key:    s.key,        // RB1 / RB2 / WR1 / WR2 etc — stored in _slot for restoration
        salary_cost: priceMap[lineup[s.key]!.id] ?? 0,
        player_data: lineup[s.key],
      }));

      const res = await fetch('/api/lineup/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ league_id: params.id, week, picks }),
      });

      if (res.ok) {
        router.push(`/league/${params.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? 'Failed to submit lineup.');
      }
    } finally {
      setSaving(false);
    }
  }

  const isLocked    = firstGameTime ? new Date() >= new Date(firstGameTime) : false;
  const showBuilder = !submitted || editing;

  // ── Submitted view (read-only dashboard) ─────────────────────────────────
  if (!loading && submitted && !editing) {
    const lockLabel = firstGameTime
      ? isLocked
        ? 'Games in progress — lineup locked'
        : `Locks at first kickoff: ${new Date(firstGameTime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`
      : '';

    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{ background: 'linear-gradient(180deg,#0d1827,#0c1422)', borderBottom: '1px solid ' + C.surf3, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push(`/league/${params.id}`)} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>← Back</button>
            <div style={{ width: 1, height: 16, background: C.surf3 }} />
            <div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, letterSpacing: 1 }}>{league?.name}</div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Weekly DFS · Week {week}</div>
            </div>
          </div>
          {isLocked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'rgba(240,58,90,.12)', border: '1px solid rgba(240,58,90,.35)' }}>
              <span style={{ fontSize: 12 }}>🔒</span>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.red, textTransform: 'uppercase' }}>Lineup Locked</span>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} style={{ padding: '8px 20px', background: 'linear-gradient(135deg,#f5a623,#ffd166)', border: 'none', borderRadius: 8, fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 1.5, color: C.bg, cursor: 'pointer', textTransform: 'uppercase' }}>
              ✏ Edit Lineup
            </button>
          )}
        </div>

        {/* Lock info banner */}
        {lockLabel && (
          <div style={{ padding: '8px 20px', background: isLocked ? 'rgba(240,58,90,.08)' : 'rgba(21,198,120,.07)', borderBottom: '1px solid ' + (isLocked ? 'rgba(240,58,90,.2)' : 'rgba(21,198,120,.2)'), fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: isLocked ? C.red : C.green, textAlign: 'center', textTransform: 'uppercase' }}>
            {lockLabel}
          </div>
        )}

        {/* Submitted lineup */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', maxWidth: 520, margin: '0 auto', width: '100%' }}>
          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: isLocked ? C.red : C.green }} />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: isLocked ? C.red : C.green }}>
                {isLocked ? 'Locked' : 'Submitted'}
              </span>
            </div>
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.gold }}>${totalSalary} / ${BUDGET}</span>
          </div>

          {/* Slot rows */}
          {SLOTS.map(slot => {
            const unit     = lineup[slot.key];
            const price    = unit ? (priceMap[unit.id] ?? 0) : 0;
            const posColor = unit ? (POS_COLOR[unit.unitType] ?? C.sub) : C.muted;
            return (
              <div key={slot.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 4, background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 8 }}>
                <div style={{ width: 36, flexShrink: 0, fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: posColor }}>{slot.label}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {unit ? (
                    <>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: '#7eb8f7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unit.playerName || unit.school}</div>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.sub, letterSpacing: 0.5, marginTop: 1 }}>{unit.school} · {unit.conference}</div>
                    </>
                  ) : (
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>Empty</div>
                  )}
                </div>
                <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.gold, flexShrink: 0 }}>${price}</span>
              </div>
            );
          })}

          {/* Edit button at bottom if not locked */}
          {!isLocked && (
            <button onClick={() => setEditing(true)} style={{ width: '100%', marginTop: 16, padding: '13px 0', background: 'rgba(245,166,35,.12)', border: '1px solid rgba(245,166,35,.4)', borderRadius: 8, fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.gold, cursor: 'pointer', textTransform: 'uppercase' }}>
              ✏ Edit Lineup
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 3, fontSize: 13 }}>Loading...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{
        background: 'linear-gradient(180deg, #0d1827 0%, #0c1422 100%)',
        borderBottom: '1px solid ' + C.surf3,
        padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push(`/league/${params.id}`)}
            style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ← Back
          </button>
          <div style={{ width: 1, height: 16, background: C.surf3 }} />
          <div>
            <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 16, color: C.text, letterSpacing: 1 }}>
              {league?.name}
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>
              Weekly DFS Lineup
            </div>
          </div>
        </div>

        {/* Contest week (locked — set when league was created) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Contest Week</span>
          <div style={{
            padding: '5px 14px', borderRadius: 8,
            background: 'rgba(245,166,35,.15)', border: '1px solid ' + C.gold,
            fontFamily: "'Anton',sans-serif", fontSize: 14, color: C.gold, letterSpacing: 1,
          }}>Week {week}</div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>

        {/* LEFT — Lineup slots + budget */}
        <div style={{
          width: 340, flexShrink: 0,
          background: C.surf,
          borderRight: '1px solid ' + C.surf3,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* Budget bar */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid ' + C.surf3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>
                Salary Used
              </span>
              <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 14, color: remaining < 0 ? C.red : C.gold }}>
                ${totalSalary} / ${BUDGET}
              </span>
            </div>
            <div style={{ height: 6, background: C.surf3, borderRadius: 3 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: remaining < 0 ? C.red : totalSalary / BUDGET > 0.85
                  ? 'linear-gradient(90deg,#f5a623,#ffd166)' : C.green,
                width: `${Math.min(1, totalSalary / BUDGET) * 100}%`,
                transition: 'width .3s',
              }} />
            </div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>
                {filledCount}/{SLOTS.length} spots filled
              </span>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: remaining < 0 ? C.red : C.green, letterSpacing: 1 }}>
                ${remaining} remaining
              </span>
            </div>
          </div>

          {/* Slots */}
          <div style={{ flex: 1, padding: '8px 12px' }}>
            {SLOTS.map(slot => {
              const unit = lineup[slot.key];
              const price = unit ? (priceMap[unit.id] ?? 0) : null;
              const posColor = unit ? (POS_COLOR[unit.unitType] ?? C.sub) : C.muted;

              return (
                <div
                  key={slot.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', marginBottom: 4,
                    background: unit ? C.surf2 : 'transparent',
                    border: `1px solid ${unit ? C.surf3 : 'rgba(62,84,112,.4)'}`,
                    borderRadius: 8,
                    transition: 'all .15s',
                  }}
                >
                  {/* Slot label */}
                  <div style={{
                    width: 36, flexShrink: 0,
                    fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700,
                    letterSpacing: 1.5, textTransform: 'uppercase',
                    color: unit ? posColor : C.muted,
                  }}>{slot.label}</div>

                  {/* Player info or empty */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {unit ? (
                      <>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {unit.playerName || unit.school}
                        </div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.sub, letterSpacing: 0.5, marginTop: 1 }}>
                          {unit.school} · {unit.conference}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>
                        Empty — pick from right panel
                      </div>
                    )}
                  </div>

                  {/* Price + clear */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {price !== null && (
                      <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 13, color: C.gold }}>${price}</span>
                    )}
                    {unit && (
                      <button
                        onClick={() => clearSlot(slot.key)}
                        style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'rgba(240,58,90,.15)', border: '1px solid rgba(240,58,90,.3)',
                          cursor: 'pointer', color: C.red,
                          fontFamily: 'Oswald,sans-serif', fontSize: 11, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >×</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Submit button */}
          <div style={{ padding: 14, borderTop: '1px solid ' + C.surf3 }}>
            {saved ? (
              <div style={{
                padding: '12px 16px', borderRadius: 8,
                background: 'rgba(21,198,120,.1)', border: '1px solid rgba(21,198,120,.3)',
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
                color: C.green, textAlign: 'center',
              }}>
                ✓ Lineup saved for Week {week}
              </div>
            ) : (
              <button
                onClick={submitLineup}
                disabled={!isComplete || remaining < 0 || saving}
                style={{
                  width: '100%', padding: '13px 0',
                  background: !isComplete || remaining < 0
                    ? C.surf3
                    : 'linear-gradient(135deg,#f5a623,#ffd166)',
                  border: 'none', borderRadius: 8,
                  cursor: !isComplete || remaining < 0 ? 'not-allowed' : 'pointer',
                  fontFamily: "'Anton',sans-serif", fontSize: 14, letterSpacing: 2, textTransform: 'uppercase',
                  color: !isComplete || remaining < 0 ? C.muted : C.bg,
                  opacity: saving ? 0.7 : 1,
                  transition: 'all .15s',
                }}
              >
                {saving ? 'Saving...' : !isComplete ? `Fill All Slots (${filledCount}/${SLOTS.length})` : remaining < 0 ? 'Over Budget' : `Submit Lineup — Wk ${week}`}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — Player pool */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Pool toolbar */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid ' + C.surf3,
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            background: C.surf,
          }}>
            {/* Position filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF', 'K'].map(pos => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  style={{
                    padding: '5px 10px', borderRadius: 6,
                    background: posFilter === pos ? `${POS_COLOR[pos] ?? C.gold}22` : 'transparent',
                    border: `1px solid ${posFilter === pos ? (POS_COLOR[pos] ?? C.gold) : C.surf3}`,
                    color: posFilter === pos ? (POS_COLOR[pos] ?? C.gold) : C.sub,
                    fontFamily: 'Oswald,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 1,
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                >{pos}</button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search school, player..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: 140, padding: '7px 12px',
                background: C.surf2, border: '1px solid ' + C.surf3,
                borderRadius: 8, color: C.text,
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 12,
                outline: 'none',
              }}
            />
          </div>

          {/* Pool column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 60px',
            padding: '6px 16px',
            background: C.surf2,
            borderBottom: '1px solid ' + C.surf3,
          }}>
            {['POS', 'PLAYER / SCHOOL', 'PROJ', 'SALARY', ''].map((h, i) => (
              <div key={i} style={{
                fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2,
                color: C.muted, textTransform: 'uppercase',
                textAlign: i >= 2 ? 'right' : 'left',
              }}>{h}</div>
            ))}
          </div>

          {/* Pool list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredPool.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 2 }}>
                No players found
              </div>
            ) : (
              filteredPool.map(unit => {
                const price   = priceMap[unit.id] ?? 0;
                const proj    = (unit.projectedPoints ?? 0).toFixed(1);
                const picked  = pickedIds.has(unit.id);
                const posColor = POS_COLOR[unit.unitType] ?? C.sub;
                const canAfford = price <= remaining || picked;

                return (
                  <div
                    key={unit.id}
                    onClick={() => { if (!picked && canAfford) autoAdd(unit); }}
                    style={{
                      display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 60px',
                      padding: '9px 16px', alignItems: 'center',
                      borderBottom: '1px solid ' + C.surf3,
                      cursor: picked ? 'default' : canAfford ? 'pointer' : 'not-allowed',
                      opacity: picked ? 0.45 : canAfford ? 1 : 0.5,
                      background: 'transparent',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!picked && canAfford) (e.currentTarget as HTMLElement).style.background = C.surf2; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {/* Pos badge */}
                    <div>
                      <span style={pillStyle(`${posColor}22`, posColor)}>{unit.unitType}</span>
                    </div>

                    {/* Name */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {unit.playerName || unit.school}
                      </div>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.sub, letterSpacing: 0.5 }}>
                        {unit.school} · {unit.conference}
                      </div>
                    </div>

                    {/* Proj */}
                    <div style={{ textAlign: 'right', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub }}>
                      {proj}
                    </div>

                    {/* Salary */}
                    <div style={{ textAlign: 'right', fontFamily: "'Anton',sans-serif", fontSize: 13, color: C.gold }}>
                      ${price}
                    </div>

                    {/* Add button */}
                    <div style={{ textAlign: 'right' }}>
                      {picked ? (
                        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.green, letterSpacing: 1 }}>✓</span>
                      ) : (
                        <span style={{
                          fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 1,
                          color: canAfford ? C.gold : C.muted, textTransform: 'uppercase',
                        }}>
                          {canAfford ? '+ ADD' : 'N/A'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
