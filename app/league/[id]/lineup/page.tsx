'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import type { DraftUnit } from '@/lib/playerPool';

function goBack(leagueId: string, router: any) {
  if (window.parent !== window) {
    // Inside my-leagues iframe — tell parent to navigate back
    window.parent.postMessage({ type: 'NAVIGATE', url: `/league/${leagueId}` }, '*');
  } else {
    router.push(`/league/${leagueId}`);
  }
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#05080f',
  lPanel:  '#0c1220',
  rPanel:  '#0a0e18',
  surf:    '#0c1220',
  surf2:   '#111d30',
  surf3:   '#1e2d47',
  gold:    '#d4a828',
  goldLt:  '#f0c94a',
  text:    '#e8edf5',
  sub:     '#7a90b0',
  muted:   '#4a5d7a',
  green:   '#2ecc71',
  orange:  '#f39c12',
  red:     '#e74c3c',
  purple:  '#8338ec',
  blue:    '#3a86ff',
  hdrBg:   '#1e2d47',
  hdrText: '#7a90b0',
};

const BUDGET = 200;

type LineupSlot = { key: string; label: string; accepts: string[] };

const SLOTS: LineupSlot[] = [
  { key: 'QB',   label: 'QB',   accepts: ['QB']             },
  { key: 'RB1',  label: 'RB',   accepts: ['RB']             },
  { key: 'RB2',  label: 'RB',   accepts: ['RB']             },
  { key: 'WR1',  label: 'WR',   accepts: ['WR']             },
  { key: 'WR2',  label: 'WR',   accepts: ['WR']             },
  { key: 'TE',   label: 'TE',   accepts: ['TE']             },
  { key: 'FLEX', label: 'FLEX', accepts: ['RB', 'WR', 'TE'] },
  { key: 'DEF',  label: 'DEF',  accepts: ['DEF']            },
  { key: 'K',    label: 'K',    accepts: ['K']              },
];

const POS_COLOR: Record<string, string> = {
  QB:   '#e05c2a',
  RB:   '#2ecc71',
  WR:   '#d4a828',
  TE:   '#f39c12',
  DEF:  '#8338ec',
  K:    '#7a90b0',
  FLEX: '#3a86ff',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function positionRankPrice(unit: DraftUnit, allUnits: DraftUnit[], isConf: boolean): number {
  const peers = allUnits
    .filter(u => u.unitType === unit.unitType)
    .sort((a, b) => (b.seasonTotal ?? b.projectedPoints) - (a.seasonTotal ?? a.projectedPoints));
  const total = peers.length;
  const rank  = peers.findIndex(u => u.id === unit.id) + 1;
  if (total === 0) return 10;
  // Divide pool into fifths — top fifth = $50, bottom fifth = $10
  const fifth = total / 5;
  if (rank <= fifth)         return 50;
  if (rank <= fifth * 2)     return 40;
  if (rank <= fifth * 3)     return 30;
  if (rank <= fifth * 4)     return 20;
  return 10;
}

function oppLabel(school: string, opponentMap: Record<string, string>, homeMap: Record<string, boolean>): string {
  const opp = opponentMap[school];
  if (!opp) return 'BYE';
  const isHome = homeMap[school] ?? true;
  const short = opp.length > 10 ? opp.slice(0, 10).toUpperCase() : opp.toUpperCase();
  return isHome ? `vs ${short}` : `@ ${short}`;
}

function fppg(unit: DraftUnit, opponentMap?: Record<string, string>): string {
  // BYE week = 0 projection
  if (opponentMap && !opponentMap[unit.school]) return '0.0';
  if ((unit.avgPerWeek ?? 0) > 0) return unit.avgPerWeek!.toFixed(1);
  return ((unit.projectedPoints ?? 0) / 4).toFixed(1);
}

function formatCountdown(isoTime: string | null): string {
  if (!isoTime) return '—';
  const diff = new Date(isoTime).getTime() - Date.now();
  if (diff <= 0) return 'LIVE';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(isoTime: string | null): string {
  if (!isoTime) return '';
  const d = new Date(isoTime);
  const mo = d.getMonth() + 1;
  const dy = d.getDate();
  const hr = d.getHours();
  const mn = d.getMinutes();
  const h12 = (hr % 12) || 12;
  const ampm = hr < 12 ? 'am' : 'pm';
  return `${mo}/${dy} • ${h12}:${String(mn).padStart(2, '0')} ${ampm}`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function LineupPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  // Core state
  const [league,        setLeague]        = useState<any>(null);
  const [memberCount,   setMemberCount]   = useState(0);
  const [userId,        setUserId]        = useState<string | null>(null);
  const [pool,          setPool]          = useState<DraftUnit[]>([]);
  const [logos,         setLogos]         = useState<Record<string, string>>({});
  const [expandedUnit,  setExpandedUnit]  = useState<string | null>(null);
  const [unitStats,     setUnitStats]     = useState<Record<string, any>>({});
  const [expandedWeek,  setExpandedWeek]  = useState<Record<string, number | null>>({});
  const [weekBreakdown, setWeekBreakdown] = useState<Record<string, any>>({});
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [editing,       setEditing]       = useState(false);
  const [firstGameTime, setFirstGameTime] = useState<string | null>(null);
  const [opponentMap,   setOpponentMap]   = useState<Record<string, string>>({});
  const [homeMap,       setHomeMap]       = useState<Record<string, boolean>>({});
  const [defRankMap,    setDefRankMap]    = useState<Record<string, number>>({});
  const [offRankMap,    setOffRankMap]    = useState<Record<string, number>>({});

  const week = league?.week ?? 1;

  // Filters
  const [search,          setSearch]          = useState('');
  const [posFilter,       setPosFilter]       = useState<string>('ALL');
  const [confPillFilter,  setConfPillFilter]  = useState<string>('all');

  // Toast
  const [toast, setToast] = useState<string>('');

  // Ticker for countdown
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Lineup state
  const [lineup, setLineup] = useState<Record<string, DraftUnit | null>>(() => {
    const init: Record<string, DraftUnit | null> = {};
    SLOTS.forEach(s => { init[s.key] = null; });
    return init;
  });

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      console.log('[lineup] load() started, params.id:', params.id);
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { console.log('[lineup] no user, redirecting'); router.push('/'); return; }
      setUserId(user.id);

      const { data: lg } = await supabase
        .from('leagues')
        .select('id, name, league_type, status, conference_filter, week, buy_in, league_size')
        .eq('id', params.id)
        .single();
      if (!lg || (lg.league_type !== 'weekly' && lg.league_type !== 'dfs')) { router.push(`/league/${params.id}`); return; }
      setLeague(lg);

      const { data: m } = await supabase
        .from('league_members')
        .select('id')
        .eq('league_id', params.id)
        .eq('user_id', user.id)
        .single();
      if (!m) { router.push('/leagues'); return; }

      // Member count
      supabase
        .from('league_members')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', params.id)
        .then(({ count }) => setMemberCount(count ?? 0));

      // Player pool
      const noFilter = !lg.conference_filter ||
        lg.conference_filter === 'ALL' ||
        lg.conference_filter === 'All D1' ||
        lg.conference_filter === 'all';
      const confParam = noFilter ? '' : `?conference=${encodeURIComponent(lg.conference_filter)}`;
      console.log('[lineup] lg.league_type:', lg.league_type, 'confParam:', confParam);
      try {
        const poolRes = await fetch(`/api/player-pool${confParam}`);
        const d = await poolRes.json();
        console.log('[lineup] pool fetch status:', poolRes.status, 'count:', Array.isArray(d) ? d.length : 'not array', 'sample:', JSON.stringify(d?.[0]));
        setPool(Array.isArray(d) ? d : []);
      } catch (err) {
        console.error('[lineup] pool fetch failed:', err);
      }
      fetch('/api/team-logos')
        .then(r => r.json())
        .then(d => setLogos(d.logos ?? {}))
        .catch(() => {});

      // Matchup context for opponent display
      // Show NEXT week's matchups for projections (current week is complete)
      const contestWeek = (lg.week ?? 1) + 1;
      fetch(`/api/matchup-context?week=${contestWeek}&season=2025`)
        .then(r => r.json())
        .then(d => {
          setOpponentMap(d.opponentMap ?? {});
          setHomeMap(d.homeMap ?? {});
          setDefRankMap(d.defRankMap ?? {});
          setOffRankMap(d.offRankMap ?? {});
          setFirstGameTime(d.firstGameTime ?? null);
        })
        .catch(() => {});

      // Load existing lineup
      const { data: existing } = await supabase
        .from('draft_picks')
        .select('*')
        .eq('league_id', params.id)
        .eq('user_id', user.id)
        .eq('week', lg.week ?? 1)
        .eq('entry_type', 'lineup');

      if (existing && existing.length > 0) {
        const restored: Record<string, DraftUnit | null> = {};
        SLOTS.forEach(s => { restored[s.key] = null; });
        for (const pick of existing) {
          const slot = pick.player_data?._slot ?? pick.slot;
          if (slot && restored[slot] !== undefined && pick.player_data) {
            const { _slot: _s, _salary: _sal, ...unitData } = pick.player_data;
            restored[slot] = unitData as DraftUnit;
          }
        }
        setLineup(restored);
        setSubmitted(true);
      }

      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isConference = !!(league?.conference_filter && league.conference_filter !== 'ALL');

  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    pool.forEach(u => { m[u.id] = positionRankPrice(u, pool, isConference); });
    return m;
  }, [pool, isConference]);

  const rankByPos = useMemo(() => {
    const groups: Record<string, DraftUnit[]> = {};
    pool.forEach(u => {
      if (!groups[u.unitType]) groups[u.unitType] = [];
      groups[u.unitType].push(u);
    });
    for (const arr of Object.values(groups)) {
      arr.sort((a, b) => (b.seasonTotal ?? 0) - (a.seasonTotal ?? 0));
    }
    const map: Record<string, number> = {};
    for (const arr of Object.values(groups)) arr.forEach((u, i) => { map[u.id] = i + 1; });
    return map;
  }, [pool]);

  const availableConfs = useMemo(() => {
    const seen: Record<string, true> = {};
    pool.forEach(u => { seen[u.conference] = true; });
    return Object.keys(seen).sort();
  }, [pool]);

  const confSchoolCounts = useMemo(() => {
    const counts: Record<string, Set<string>> = {};
    pool.forEach(u => {
      if (!counts[u.conference]) counts[u.conference] = new Set();
      counts[u.conference].add(u.school);
    });
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.size]));
  }, [pool]);

  const pickedIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(lineup).forEach(u => { if (u) s.add(u.id); });
    return s;
  }, [lineup]);

  const totalSalary = useMemo(() =>
    Object.values(lineup).reduce((sum, u) => sum + (u ? (priceMap[u.id] ?? 0) : 0), 0),
  [lineup, priceMap]);

  const remaining  = BUDGET - totalSalary;
  const filledCount = Object.values(lineup).filter(Boolean).length;
  const isComplete  = filledCount === SLOTS.length;
  const isLocked    = firstGameTime ? new Date() >= new Date(firstGameTime) : false;

  // Filtered pool for left panel
  const filteredPool = useMemo(() => {
    return pool.filter(u => {
      if (posFilter === 'FLEX') {
        if (!['RB', 'WR', 'TE'].includes(u.unitType)) return false;
      } else if (posFilter !== 'ALL') {
        if (u.unitType !== posFilter) return false;
      }
      if (confPillFilter !== 'all' && u.conference !== confPillFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!u.school.toLowerCase().includes(q) &&
            !(u.playerName ?? '').toLowerCase().includes(q) &&
            !u.conference.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // BYE weeks sort to bottom
      const aHasGame = !!opponentMap[a.school];
      const bHasGame = !!opponentMap[b.school];
      if (aHasGame && !bHasGame) return -1;
      if (!aHasGame && bHasGame) return 1;
      if (!aHasGame && !bHasGame) return 0;
      // Sort by projected points this week: avgPerWeek × upcoming opponent ODR
      const getProj = (u: DraftUnit) => {
        const avg = (u.avgPerWeek ?? 0) > 0 ? u.avgPerWeek! : (u.projectedPoints ?? 0) / 4;
        const opp = opponentMap[u.school];
        if (!opp) return 0;
        const oppRank = u.unitType === 'DEF'
          ? (offRankMap[opp] ?? 50)
          : (defRankMap[opp] ?? 50);
        const mult = oppRank <= 5 ? 1.3 : oppRank <= 10 ? 1.2 : oppRank <= 15 ? 1.1
          : oppRank <= 25 ? 1.0 : oppRank <= 35 ? 0.9 : oppRank <= 50 ? 0.8
          : oppRank <= 80 ? 0.7 : oppRank <= 100 ? 0.6 : 0.55;
        return avg * mult;
      };
      return getProj(b) - getProj(a);
    });
  }, [pool, posFilter, confPillFilter, search, opponentMap, defRankMap, offRankMap]);

  // Remaining salary color
  const remColor = remaining < 20 ? C.red : remaining < 50 ? C.orange : C.gold;

  // ── Actions ─────────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  function addUnit(unit: DraftUnit) {
    const pos = unit.unitType;
    for (const slot of SLOTS) {
      if (slot.accepts.includes(pos) && !lineup[slot.key]) {
        setLineup(prev => ({ ...prev, [slot.key]: unit }));
        return;
      }
    }
    showToast(`No available slot for ${pos}`);
  }

  function clearSlot(slotKey: string) {
    setLineup(prev => ({ ...prev, [slotKey]: null }));
  }

  function clearAll() {
    const empty: Record<string, DraftUnit | null> = {};
    SLOTS.forEach(s => { empty[s.key] = null; });
    setLineup(empty);
  }

  function randomize() {
    const newLineup: Record<string, DraftUnit | null> = {};
    SLOTS.forEach(s => { newLineup[s.key] = null; });
    let rem = BUDGET;
    const usedIds = new Set<string>();

    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const slotsLeft = SLOTS.length - i - 1;
      const maxForThis = rem - 10 * slotsLeft;

      const candidates = pool.filter(u =>
        slot.accepts.includes(u.unitType) &&
        !usedIds.has(u.id) &&
        (priceMap[u.id] ?? 0) <= maxForThis
      );

      const source = candidates.length > 0
        ? candidates
        : pool.filter(u => slot.accepts.includes(u.unitType) && !usedIds.has(u.id));

      if (source.length === 0) continue;
      const pick = source[Math.floor(Math.random() * source.length)];
      newLineup[slot.key] = pick;
      usedIds.add(pick.id);
      rem -= priceMap[pick.id] ?? 0;
    }
    setLineup(newLineup);
  }

  async function submitLineup() {
    if (!isComplete || remaining < 0) return;
    setSaving(true);
    try {
      const picks = SLOTS.map(s => ({
        unit_id:     lineup[s.key]!.id,
        slot:        s.label,
        slot_key:    s.key,
        salary_cost: priceMap[lineup[s.key]!.id] ?? 0,
        player_data: lineup[s.key],
      }));
      const res = await fetch('/api/lineup/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: params.id, week, picks }),
      });
      if (res.ok) {
        goBack(params.id, router);
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error ?? 'Failed to submit lineup.');
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 3, fontSize: 13 }}>LOADING...</div>
    </div>
  );

  // ── Submitted / read-only view ───────────────────────────────────────────────
  if (submitted && !editing) {
    const lockLabel = firstGameTime
      ? isLocked
        ? 'Games in progress — lineup locked'
        : `Editable until first kickoff · ${new Date(firstGameTime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`
      : '';
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(180deg,#0d1827,#0c1422)', borderBottom: '1px solid ' + C.surf3, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => goBack(params.id, router)} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>← Back</button>
            <div style={{ width: 1, height: 16, background: C.surf3 }} />
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, letterSpacing: 1 }}>{league?.name}</div>
          </div>
          {isLocked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'rgba(231,76,60,.12)', border: '1px solid rgba(231,76,60,.35)' }}>
              <span style={{ fontSize: 12 }}>🔒</span>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.red, textTransform: 'uppercase' }}>Lineup Locked</span>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} style={{ padding: '8px 20px', background: 'linear-gradient(135deg,#d4a828,#f0c94a)', border: 'none', borderRadius: 8, fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 1.5, color: C.bg, cursor: 'pointer', textTransform: 'uppercase' }}>✏ Edit Lineup</button>
          )}
        </div>
        {lockLabel && (
          <div style={{ padding: '7px 20px', background: isLocked ? 'rgba(231,76,60,.08)' : 'rgba(46,204,113,.07)', borderBottom: '1px solid ' + (isLocked ? 'rgba(231,76,60,.2)' : 'rgba(46,204,113,.2)'), fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: isLocked ? C.red : C.green, textAlign: 'center', textTransform: 'uppercase' }}>
            {lockLabel}
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', maxWidth: 540, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: isLocked ? C.red : C.green }} />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: isLocked ? C.red : C.green }}>{isLocked ? 'Locked' : 'Submitted'}</span>
            </div>
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.gold }}>${totalSalary} / ${BUDGET}</span>
          </div>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 100px 60px 60px', padding: '6px 12px', background: C.hdrBg, borderRadius: '6px 6px 0 0', marginBottom: 0 }}>
            {['POS', 'PLAYER', 'OPP', 'FPPG', 'SAL'].map((h, i) => (
              <div key={h} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.hdrText, textTransform: 'uppercase', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          {SLOTS.map((slot, idx) => {
            const unit = lineup[slot.key];
            const price = unit ? (priceMap[unit.id] ?? 0) : 0;
            const posColor = unit ? (POS_COLOR[unit.unitType] ?? C.sub) : C.muted;
            const opp = unit ? oppLabel(unit.school, opponentMap, homeMap) : '—';
            const fp = unit ? fppg(unit) : '—';
            return (
              <div key={slot.key} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 100px 60px 60px', alignItems: 'center', padding: '9px 12px', background: idx % 2 === 0 ? '#0c1220' : '#0a0e18', borderBottom: '1px solid rgba(30,45,71,.4)' }}>
                <div><span style={posBadge(posColor)}>{slot.label}</span></div>
                <div style={{ minWidth: 0 }}>
                  {unit ? (
                    <>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: '#7eb8f7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unit.playerName || unit.school}</div>
                      {unit.playerName && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.sub, letterSpacing: 0.5 }}>{unit.school}</div>}
                    </>
                  ) : (
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>Empty</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub }}>{opp}</div>
                <div style={{ textAlign: 'right', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.gold }}>{fp}</div>
                <div style={{ textAlign: 'right', fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.text }}>{unit ? `$${price}` : '—'}</div>
              </div>
            );
          })}
          {!isLocked && (
            <button onClick={() => setEditing(true)} style={{ width: '100%', marginTop: 16, padding: '13px 0', background: 'rgba(212,168,40,.1)', border: '1px solid rgba(212,168,40,.35)', borderRadius: 8, fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.gold, cursor: 'pointer', textTransform: 'uppercase' }}>
              ✏ Edit Lineup
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Builder view ─────────────────────────────────────────────────────────────
  const enterLabel = league?.buy_in === 0
    ? 'ENTER | FREE'
    : `ENTER | $${(league?.buy_in ?? 0).toFixed(2)}`;

  // void tick to use it (forces countdown re-render)
  void tick;
  const countdown = formatCountdown(firstGameTime);
  const dateLabel = formatDate(firstGameTime);
  const prize = (league?.buy_in ?? 0) * (league?.league_size ?? 0);

  return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── FULL-WIDTH HEADER ──────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: 'linear-gradient(180deg,#0d1827 0%,#0a1020 100%)', borderBottom: '1px solid ' + C.surf3, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>

        {/* Left: back + league info */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <button onClick={() => goBack(params.id, router)} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', paddingTop: 3 }}>← Back</button>
          <div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 5 }}>
              {league?.name ?? 'Weekly Lineup'}
            </div>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 5 }}>
              {[
                { label: 'Entries',     val: `${memberCount}/${league?.league_size ?? '?'}` },
                { label: 'Entry',       val: league?.buy_in === 0 ? 'Free' : `$${league?.buy_in?.toFixed(2)}` },
                { label: 'Prizes',      val: prize > 0 ? `$${prize.toFixed(2)}` : '—' },
                { label: 'My Entries',  val: submitted ? '1' : '0' },
                { label: 'Max Entries', val: '1' },
              ].map((item, i) => (
                <span key={i} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub }}>
                  <span style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>{item.label}: </span>
                  {item.val}
                  {i < 4 && <span style={{ marginLeft: 14, color: C.surf3 }}>|</span>}
                </span>
              ))}
            </div>
            {/* Links */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.gold, textDecoration: 'underline' }}>Full Contest Details</button>
              <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.gold, textDecoration: 'underline' }}>Share Link</button>
            </div>
          </div>
        </div>

        {/* Right: countdown */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 2 }}>
            CONTEST GOES LIVE IN
          </div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, color: C.gold, letterSpacing: 2, lineHeight: 1 }}>
            {countdown}
          </div>
          {dateLabel && (
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, letterSpacing: 0.5, marginTop: 3 }}>
              {dateLabel}
            </div>
          )}
        </div>
      </div>

      {/* ── TWO-PANEL BODY ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ══ LEFT PANEL — Player Pool (60%) ═══════════════════════════════ */}
        <div style={{ flex: '0 0 60%', background: C.lPanel, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid ' + C.surf3 }}>

          {/* Conference pills */}
          <div style={{ flexShrink: 0, padding: '10px 16px 0', borderBottom: '1px solid ' + C.surf3, display: 'flex', gap: 0, overflowX: 'auto', background: '#090e18' }}>
            {/* "All Schools" pill */}
            <button
              onClick={() => setConfPillFilter('all')}
              style={confPillStyle(confPillFilter === 'all')}
            >
              All Schools ({pool.filter((u, i, a) => a.findIndex(x => x.school === u.school) === i).length})
            </button>
            {availableConfs.map(conf => (
              <button
                key={conf}
                onClick={() => setConfPillFilter(conf)}
                style={confPillStyle(confPillFilter === conf)}
              >
                {conf} ({confSchoolCounts[conf] ?? 0})
              </button>
            ))}
          </div>

          {/* Search + Position tabs */}
          <div style={{ flexShrink: 0, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, background: '#090e18', borderBottom: '1px solid ' + C.surf3 }}>
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', background: C.surf3, borderRadius: 6, padding: '0 12px', gap: 8 }}>
              <span style={{ color: C.muted, fontSize: 14 }}>🔍</span>
              <input
                type="text"
                placeholder="Player / Unit Search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.text, padding: '8px 0' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
              )}
            </div>

            {/* Position filter tabs */}
            <div style={{ display: 'flex', gap: 3 }}>
              {['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'DEF', 'K'].map(pos => {
                const active = posFilter === pos;
                const color = POS_COLOR[pos] ?? C.gold;
                return (
                  <button
                    key={pos}
                    onClick={() => setPosFilter(pos)}
                    style={{
                      flex: 1, padding: '6px 4px',
                      background: active ? `${color}22` : 'transparent',
                      border: `1px solid ${active ? color : 'rgba(30,45,71,.6)'}`,
                      borderRadius: 4,
                      fontFamily: 'Oswald,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                      color: active ? color : C.sub,
                      cursor: 'pointer', transition: 'all .12s',
                    }}
                  >{pos}</button>
                );
              })}
            </div>
          </div>

          {/* Pool column headers */}
          <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '50px 1fr 90px 55px 40px 60px 38px', padding: '7px 16px', background: C.hdrBg, borderBottom: '1px solid ' + C.surf3 }}>
            {['POS', 'PLAYER', 'OPP', 'FPPG', 'RK', 'SALARY', ''].map((h, i) => (
              <div key={i} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1.5, color: C.hdrText, textTransform: 'uppercase', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>

          {/* Pool rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredPool.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 2 }}>No players found</div>
            ) : (
              filteredPool.map((unit, idx) => {
                const price     = priceMap[unit.id] ?? 0;
                const picked    = pickedIds.has(unit.id);
                const canAfford = price <= remaining || picked;
                const posColor  = POS_COLOR[unit.unitType] ?? C.sub;
                const opp       = oppLabel(unit.school, opponentMap, homeMap);
                const fp        = fppg(unit, opponentMap);
                const rk        = rankByPos[unit.id] ?? '—';

                return (
                  <div key={unit.id} style={{ borderBottom: '1px solid rgba(30,45,71,.35)' }}>
                    <div
                      onClick={() => {
                        if (expandedUnit === unit.id) {
                          setExpandedUnit(null);
                        } else {
                          setExpandedUnit(unit.id);
                          if (!unitStats[unit.id]) {
                            fetch(`/api/unit-stats?school=${encodeURIComponent(unit.school)}&unitType=${unit.unitType}&season=2025`)
                              .then(r => r.json())
                              .then(d => setUnitStats(prev => ({ ...prev, [unit.id]: d })))
                              .catch(() => {});
                          }
                        }
                      }}
                      style={{
                        display: 'grid', gridTemplateColumns: '50px 1fr 90px 55px 40px 60px 38px',
                        padding: '9px 16px', alignItems: 'center',
                        background: idx % 2 === 0 ? C.lPanel : '#0a101c',
                        cursor: 'pointer',
                        opacity: picked ? 0.45 : 1,
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#131d30'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? C.lPanel : '#0a101c'; }}
                    >
                      {/* POS */}
                      <div><span style={posBadge(posColor)}>{unit.unitType}</span></div>

                      {/* Player */}
                      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                        {logos[unit.school] ? (
                          <img src={logos[unit.school]} alt={unit.school}
                            style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: (POS_COLOR[unit.unitType] ?? C.sub) + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 8, color: POS_COLOR[unit.unitType] ?? C.sub, flexShrink: 0 }}>
                            {unit.school.slice(0,2).toUpperCase()}
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {unit.playerName || unit.school}
                          </div>
                          {unit.playerName && (
                            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.sub, letterSpacing: 0.3 }}>{unit.school}</div>
                          )}
                        </div>
                      </div>

                      {/* OPP */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, letterSpacing: 0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp}</div>
                        {opp !== 'BYE' && (() => {
                          const opponent = opponentMap[unit.school];
                          if (!opponent) return null;
                          const oppRank = unit.unitType === 'DEF'
                            ? (offRankMap[opponent] ?? 50)
                            : (defRankMap[opponent] ?? 50);
                          const mult = oppRank <= 5 ? 1.3 : oppRank <= 10 ? 1.2
                            : oppRank <= 15 ? 1.1 : oppRank <= 25 ? 1.0
                            : oppRank <= 35 ? 0.9 : oppRank <= 50 ? 0.8
                            : oppRank <= 80 ? 0.7 : oppRank <= 100 ? 0.6 : 0.55;
                          const color = mult >= 1.2 ? '#15c678' : mult >= 1.0 ? '#f5a623'
                            : mult >= 0.8 ? '#f08030' : '#f03a5a';
                          return (
                            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, fontWeight: 700, color, letterSpacing: 0.5 }}>
                              ×{mult.toFixed(1)}
                            </div>
                          );
                        })()}
                      </div>

                      {/* FPPG */}
                      <div style={{ textAlign: 'right', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, color: C.gold }}>{fp}</div>

                      {/* RK */}
                      <div style={{ textAlign: 'right', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>#{rk}</div>

                      {/* Salary */}
                      <div style={{ textAlign: 'right', fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.text }}>${price}</div>

                      {/* ADD button */}
                      <div style={{ textAlign: 'right' }}>
                        {picked ? (
                          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>✓</span>
                        ) : (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (canAfford && !picked) addUnit(unit);
                            }}
                            disabled={!canAfford}
                            style={{
                              padding: '4px 8px',
                              background: canAfford ? 'rgba(46,204,113,.15)' : 'transparent',
                              border: '1px solid ' + (canAfford ? 'rgba(46,204,113,.4)' : C.surf3),
                              borderRadius: 4,
                              fontFamily: 'Oswald,sans-serif', fontSize: 10, fontWeight: 700,
                              color: canAfford ? C.green : C.muted,
                              cursor: canAfford ? 'pointer' : 'not-allowed',
                            }}
                          >+</button>
                        )}
                      </div>
                    </div>
                    {expandedUnit === unit.id && (
                      <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,.3)', borderTop: '1px solid ' + C.surf3 }}>
                        {!unitStats[unit.id] ? (
                          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, padding: '8px 0' }}>Loading stats…</div>
                        ) : (() => {
                          const weeks = (unitStats[unit.id]?.weeks ?? []).filter((w: any) => w.completed);
                          const ut = unit.unitType;
                          const expandKey = unit.id;
                          const expandedWk = expandedWeek[expandKey] ?? null;

                          const colDefs: Record<string, { label: string; key: string }[]> = {
                            QB:  [{ label: 'PASS YDS', key: 'passing_YDS' }, { label: 'TD', key: 'passing_TD' }, { label: 'INT', key: 'passing_INT' }, { label: 'RUSH YDS', key: 'rushing_YDS' }],
                            RB:  [{ label: 'ATT', key: 'rushing_ATT' }, { label: 'RUSH YDS', key: 'rushing_YDS' }, { label: 'TD', key: 'rushing_TD' }, { label: 'REC', key: 'receiving_REC' }, { label: 'REC YDS', key: 'receiving_YDS' }],
                            WR:  [{ label: 'REC', key: 'receiving_REC' }, { label: 'YDS', key: 'receiving_YDS' }, { label: 'TD', key: 'receiving_TD' }],
                            TE:  [{ label: 'REC', key: 'receiving_REC' }, { label: 'YDS', key: 'receiving_YDS' }, { label: 'TD', key: 'receiving_TD' }],
                            DEF: [{ label: 'SACKS', key: 'sacks' }, { label: 'INT', key: 'ints' }, { label: 'FUM', key: 'fumRec' }, { label: 'TD', key: 'defTd' }],
                            K:   [{ label: 'PTS', key: 'kicking_PTS' }],
                          };
                          const cols = colDefs[ut] ?? [];

                          // Summary row uses sportsDataReader player[0] short keys
                          const summaryColDefs: Record<string, { label: string; key: string }[]> = {
                            QB:  [{ label: 'PASS YDS', key: 'passYd' }, { label: 'TD', key: 'passTd' }, { label: 'INT', key: 'int' }, { label: 'RUSH YDS', key: 'rushYd' }],
                            RB:  [{ label: 'ATT', key: 'rushAtt' }, { label: 'RUSH YDS', key: 'rushYd' }, { label: 'TD', key: 'rushTd' }, { label: 'REC', key: 'rec' }, { label: 'REC YDS', key: 'recYd' }],
                            WR:  [{ label: 'REC', key: 'rec' }, { label: 'YDS', key: 'recYd' }, { label: 'TD', key: 'recTd' }],
                            TE:  [{ label: 'REC', key: 'rec' }, { label: 'YDS', key: 'recYd' }, { label: 'TD', key: 'recTd' }],
                            DEF: [{ label: 'SACKS', key: 'sacks' }, { label: 'INT', key: 'ints' }, { label: 'FUM', key: 'fumRec' }, { label: 'TD', key: 'defTd' }],
                            K:   [{ label: 'PTS', key: 'pts' }],
                          };
                          const summaryCols = summaryColDefs[ut] ?? [];

                          const thStyle: React.CSSProperties = { fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1.5, color: '#4a5d7a', textTransform: 'uppercase', padding: '4px 6px', fontWeight: 400, whiteSpace: 'nowrap' };
                          const tdBase: React.CSSProperties = { fontFamily: 'Oswald,sans-serif', fontSize: 11, padding: '6px 6px', borderTop: '1px solid rgba(30,45,71,.4)', whiteSpace: 'nowrap' };

                          return (
                            <div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <thead>
                                  <tr>
                                    <th style={{ ...thStyle, textAlign: 'left', width: '5%' }}>WK</th>
                                    <th style={{ ...thStyle, textAlign: 'left', width: '22%' }}>OPP</th>
                                    <th style={{ ...thStyle, textAlign: 'right', width: '10%' }}>FPTS</th>
                                    <th style={{ ...thStyle, textAlign: 'right', width: '12%' }}>ODR</th>
                                    {summaryCols.map(c => (
                                      <th key={c.key} style={{ ...thStyle, textAlign: 'right' }}>{c.label}</th>
                                    ))}
                                    <th style={{ ...thStyle, width: '4%' }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {weeks.map((wk: any) => {
                                    const mult = wk.multiplier ?? 1.0;
                                    const multColor = mult >= 1.2 ? '#15c678' : mult >= 1.0 ? '#f5a623' : mult >= 0.8 ? '#f08030' : '#f03a5a';
                                    const player0 = wk.players?.[0] ?? {};
                                    const oppShort = wk.opponent
                                      ? (wk.opponent.length > 12 ? wk.opponent.slice(0, 12) + '…' : wk.opponent)
                                      : '—';
                                    const isExpanded = expandedWk === wk.week;
                                    const bdKey = `${unit.id}_w${wk.week}`;
                                    const bd = weekBreakdown[bdKey];

                                    return (
                                      <React.Fragment key={wk.week}>
                                        {/* Week summary row — clickable */}
                                        <tr
                                          onClick={() => {
                                            const newWk = isExpanded ? null : wk.week;
                                            setExpandedWeek(prev => ({ ...prev, [expandKey]: newWk }));
                                            if (!isExpanded && !bd) {
                                              // Fetch breakdown for this specific week
                                              fetch(`/api/unit-stats?school=${encodeURIComponent(unit.school)}&unitType=${unit.unitType}&season=2025&week=${wk.week}`)
                                                .then(r => r.json())
                                                .then(d => setWeekBreakdown(prev => ({ ...prev, [bdKey]: d })))
                                                .catch(() => {});
                                            }
                                          }}
                                          style={{ cursor: 'pointer', background: isExpanded ? 'rgba(245,166,35,.05)' : 'transparent' }}
                                        >
                                          <td style={{ ...tdBase, textAlign: 'left', color: '#4a5d7a' }}>{wk.week}</td>
                                          <td style={{ ...tdBase, textAlign: 'left', color: '#7a90b0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                              {logos[wk.opponent] && (
                                                <img src={logos[wk.opponent]} alt={wk.opponent}
                                                  style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }}
                                                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                              )}
                                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                                                {wk.isBye ? '🛌 BYE' : `vs ${oppShort}`}
                                              </span>
                                            </div>
                                          </td>
                                          <td style={{ ...tdBase, textAlign: 'right', color: '#f0c94a', fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
                                            {bd?.fpts != null
                                              ? bd.fpts.toFixed(2)
                                              : (wk.fpts ?? wk.fantasyPoints)?.toFixed(2) ?? '—'}
                                          </td>
                                          <td style={{ ...tdBase, textAlign: 'right', color: multColor, fontFamily: 'Oswald,sans-serif', fontWeight: 700 }}>
                                            ×{mult.toFixed(2)}
                                          </td>
                                          {summaryCols.map(c => (
                                            <td key={c.key} style={{ ...tdBase, textAlign: 'right', color: '#7a90b0' }}>
                                              {player0[c.key] ?? '—'}
                                            </td>
                                          ))}
                                          <td style={{ ...tdBase, textAlign: 'right', color: '#4a5d7a', fontSize: 10 }}>
                                            {isExpanded ? '▲' : '▼'}
                                          </td>
                                        </tr>

                                        {/* Expanded player breakdown */}
                                        {isExpanded && (
                                          <tr>
                                            <td colSpan={4 + cols.length + 1} style={{ padding: 0 }}>
                                              {!bd ? (
                                                <div style={{ padding: '8px 12px', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>Loading breakdown…</div>
                                              ) : (
                                                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'rgba(0,0,0,.2)' }}>
                                                  <thead>
                                                    <tr>
                                                      <th style={{ ...thStyle, textAlign: 'left', width: '28%' }}>PLAYER</th>
                                                      <th style={{ ...thStyle, textAlign: 'left', width: '10%' }}>ROLE</th>
                                                      {cols.map(c => (
                                                        <th key={c.key} style={{ ...thStyle, textAlign: 'right' }}>{c.label}</th>
                                                      ))}
                                                      <th style={{ ...thStyle, textAlign: 'right', width: '10%' }}>PTS</th>
                                                      <th style={{ ...thStyle, textAlign: 'right', width: '10%' }}>MULT</th>
                                                      <th style={{ ...thStyle, textAlign: 'right', width: '10%', color: '#15c678' }}>WPTS</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {(bd?.bdRows ?? []).map((row: any, i: number) => (
                                                      <tr key={i}>
                                                        <td style={{ ...tdBase, textAlign: 'left', color: '#7eb8f7', fontSize: 10 }}>
                                                          {row.playerName ?? 'Team'}
                                                        </td>
                                                        <td style={{ ...tdBase, textAlign: 'left', color: '#4a5d7a', fontSize: 9 }}>
                                                          {row.role}
                                                        </td>
                                                        {cols.map(c => (
                                                          <td key={c.key} style={{ ...tdBase, textAlign: 'right', color: '#7a90b0', fontSize: 10 }}>
                                                            {row.stats?.[c.key] ?? '—'}
                                                          </td>
                                                        ))}
                                                        <td style={{ ...tdBase, textAlign: 'right', color: '#f0c94a', fontFamily: 'Anton,sans-serif', fontSize: 11 }}>
                                                          {row.rawPts?.toFixed(2) ?? '—'}
                                                        </td>
                                                        <td style={{ ...tdBase, textAlign: 'right', color: '#7a90b0', fontSize: 10 }}>
                                                          ×{(row.multiplier ?? 1).toFixed(2)}
                                                        </td>
                                                        <td style={{ ...tdBase, textAlign: 'right', color: '#15c678', fontFamily: 'Anton,sans-serif', fontSize: 11 }}>
                                                          {row.weightedPts?.toFixed(2) ?? '—'}
                                                        </td>
                                                      </tr>
                                                    ))}
                                                    {/* Unit total row */}
                                                    <tr style={{ borderTop: '1px solid rgba(245,166,35,.3)', background: 'rgba(0,0,0,.2)' }}>
                                                      <td colSpan={2 + cols.length} style={{ ...tdBase, textAlign: 'left', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#f5a623', letterSpacing: 1, paddingTop: 8 }}>
                                                        UNIT TOTAL
                                                      </td>
                                                      <td style={{ ...tdBase, textAlign: 'right', paddingTop: 8 }} colSpan={3}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                                          <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: '#15c678' }}>
                                                            {bd?.unitTotal?.toFixed(2) ?? '—'} WPTS
                                                          </span>
                                                          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: '#f03a5a', letterSpacing: 0.5 }}>
                                                            × ODR {(bd?.odrMult ?? wk.multiplier ?? 1).toFixed(2)}
                                                          </span>
                                                          <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: '#f0c94a', borderTop: '1px solid rgba(245,166,35,.4)', paddingTop: 2 }}>
                                                            {bd?.fpts?.toFixed(2) ?? '—'} FPTS
                                                          </span>
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
                                    <tr>
                                      <td colSpan={4 + cols.length + 1} style={{ ...tdBase, textAlign: 'center', color: '#4a5d7a' }}>No games played yet</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#4a5d7a', marginTop: 6 }}>
                                {(unit.avgPerWeek ?? 0) > 0 ? `${unit.avgPerWeek!.toFixed(2)} avg/wk · ` : ''}
                                {unit.weeksPlayed ?? 0} games played
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ══ RIGHT PANEL — Lineup (40%) ════════════════════════════════════ */}
        <div style={{ flex: '0 0 40%', background: C.rPanel, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Lineup header */}
          <div style={{ flexShrink: 0, padding: '12px 16px', background: '#06090f', borderBottom: '1px solid ' + C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 2, textTransform: 'uppercase' }}>Lineup</div>
            <div>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginRight: 6 }}>Rem. Salary:</span>
              <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: remColor, letterSpacing: 1 }}>${remaining}</span>
            </div>
          </div>

          {/* Lineup slot headers */}
          <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '44px 1fr 80px 50px 50px 28px', padding: '6px 14px', background: C.hdrBg, borderBottom: '1px solid ' + C.surf3 }}>
            {['POS', 'PLAYER', 'OPP', 'FPPG', 'SAL', ''].map((h, i) => (
              <div key={i} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1.5, color: C.hdrText, textTransform: 'uppercase', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>

          {/* Lineup slot rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {SLOTS.map((slot, idx) => {
              const unit = lineup[slot.key];
              const price = unit ? (priceMap[unit.id] ?? 0) : 0;
              const posColor = POS_COLOR[slot.label] ?? POS_COLOR[unit?.unitType ?? ''] ?? C.muted;
              const opp = unit ? oppLabel(unit.school, opponentMap, homeMap) : '—';
              const fp  = unit ? fppg(unit) : '—';

              return (
                <div
                  key={slot.key}
                  style={{
                    display: 'grid', gridTemplateColumns: '44px 1fr 80px 50px 50px 28px',
                    padding: '10px 14px', alignItems: 'center',
                    background: idx % 2 === 0 ? C.rPanel : '#090d16',
                    borderBottom: '1px solid rgba(30,45,71,.4)',
                    minHeight: 52,
                  }}
                >
                  {/* POS */}
                  <div><span style={posBadge(posColor)}>{slot.label}</span></div>

                  {/* Player or placeholder */}
                  <div style={{ minWidth: 0 }}>
                    {unit ? (
                      <>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: '#7eb8f7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unit.playerName || unit.school}</div>
                        {unit.playerName && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.sub }}>{unit.school}</div>}
                      </>
                    ) : (
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Select {slot.label}</div>
                    )}
                  </div>

                  {/* OPP */}
                  <div style={{ textAlign: 'right', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp}</div>

                  {/* FPPG */}
                  <div style={{ textAlign: 'right', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: unit ? C.gold : C.muted }}>{fp}</div>

                  {/* Salary */}
                  <div style={{ textAlign: 'right', fontFamily: 'Anton,sans-serif', fontSize: 12, color: unit ? C.text : C.muted }}>{unit ? `$${price}` : '—'}</div>

                  {/* Remove */}
                  <div style={{ textAlign: 'right' }}>
                    {unit && (
                      <button
                        onClick={() => clearSlot(slot.key)}
                        style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: '50%', background: 'rgba(231,76,60,.12)', border: '1px solid rgba(231,76,60,.3)', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.red, fontSize: 12, padding: 0, lineHeight: 1 }}
                      >✕</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom actions */}
          <div style={{ flexShrink: 0, padding: '12px 14px', borderTop: '1px solid ' + C.surf3, background: '#06090f', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Salary bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>{filledCount}/{SLOTS.length} filled</span>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>${totalSalary} / $200 used</span>
            </div>
            <div style={{ height: 4, background: C.surf3, borderRadius: 2, marginBottom: 4 }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(1, totalSalary / BUDGET) * 100}%`, background: remaining < 0 ? C.red : totalSalary / BUDGET > 0.85 ? C.orange : C.green, transition: 'width .3s' }} />
            </div>

            {/* Clear + Randomize */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={clearAll} style={{ flex: 1, padding: '9px 0', background: C.surf3, border: '1px solid rgba(30,45,71,.8)', borderRadius: 5, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase', transition: 'all .12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#263a58'; e.currentTarget.style.color = C.text; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.surf3; e.currentTarget.style.color = C.sub; }}>
                Clear
              </button>
              <button onClick={randomize} style={{ flex: 1, padding: '9px 0', background: C.surf3, border: '1px solid rgba(30,45,71,.8)', borderRadius: 5, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase', transition: 'all .12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#263a58'; e.currentTarget.style.color = C.text; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.surf3; e.currentTarget.style.color = C.sub; }}>
                Randomize
              </button>
            </div>

            {/* Enter button */}
            <button
              onClick={submitLineup}
              disabled={!isComplete || remaining < 0 || saving}
              style={{
                width: '100%', padding: '14px 0',
                background: (!isComplete || remaining < 0) ? C.surf3 : 'linear-gradient(135deg,#27ae60,#2ecc71)',
                border: 'none', borderRadius: 6,
                cursor: (!isComplete || remaining < 0) ? 'not-allowed' : 'pointer',
                fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 2, textTransform: 'uppercase',
                color: (!isComplete || remaining < 0) ? C.muted : '#fff',
                boxShadow: isComplete && remaining >= 0 ? '0 0 24px rgba(46,204,113,.3)' : 'none',
                opacity: saving ? 0.7 : 1,
                transition: 'all .15s',
              }}
            >
              {saving ? 'Submitting…' : !isComplete ? `${filledCount}/${SLOTS.length} Slots Filled` : remaining < 0 ? 'Over Budget' : enterLabel}
            </button>
          </div>
        </div>
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1e2d47', border: '1px solid rgba(212,168,40,.4)', borderRadius: 8, padding: '10px 20px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.text, boxShadow: '0 4px 20px rgba(0,0,0,.5)', zIndex: 2000, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────
function posBadge(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 34, padding: '2px 5px', borderRadius: 3,
    background: `${color}22`, border: `1px solid ${color}55`,
    fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 1,
    color, textTransform: 'uppercase' as const,
  };
}

function confPillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? '#d4a828' : 'transparent'}`,
    fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const,
    color: active ? '#d4a828' : '#7a90b0',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'all .12s',
    marginBottom: -1,
  };
}
