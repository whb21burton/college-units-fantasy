'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
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
const PICK_TIME = 90;

/** Snake draft: returns 0-based team index for a given global pick number. */
function snakeIndex(pickNum: number, numTeams: number): number {
  const round = Math.floor(pickNum / numTeams);
  const pos   = pickNum % numTeams;
  return round % 2 === 0 ? pos : numTeams - 1 - pos;
}

/** Pick best available unit respecting position caps. */
function autoPick(available: DraftUnit[], rosterCount: Record<UnitType, number>): DraftUnit | null {
  for (const unit of available) {
    if ((rosterCount[unit.unitType] ?? 0) < POSITION_CAPS[unit.unitType]) return unit;
  }
  return available[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DraftPage() {
  const router   = useRouter();
  const params   = useParams();
  const leagueId = params?.id as string;

  const [userId,  setUserId]  = useState<string | null>(null);
  const [league,  setLeague]  = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);   // sorted by draft_slot
  const [picks,   setPicks]   = useState<any[]>([]);   // sorted by pick_number
  const [avail,   setAvail]   = useState<DraftUnit[]>([]);
  const [filter,  setFilter]  = useState<UnitType | 'ALL'>('ALL');
  const [timer,   setTimer]   = useState(PICK_TIME);
  const [loading, setLoading] = useState(true);

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAttempted  = useRef<Set<number>>(new Set());
  const [effMap, setEffMap] = useState<Record<string, TeamEfficiency>>({});

  // ── derived values ────────────────────────────────────────────────────────

  const numTeams       = members.length;
  const totalPicks     = numTeams * TOTAL_ROUNDS;
  const currentPickNum = picks.length;
  const teamIdx        = numTeams > 0 ? snakeIndex(currentPickNum, numTeams) : 0;
  const onClockMember  = members[teamIdx] ?? null;
  const isMyTurn       = !!userId && onClockMember?.user_id === userId;
  const isCommissioner = !!userId && league?.commissioner_id === userId;
  const draftLive      = league?.status === 'drafting';
  const draftDone      = totalPicks > 0 && currentPickNum >= totalPicks;
  const round          = numTeams > 0 ? Math.floor(currentPickNum / numTeams) : 0;
  const pickInRound    = numTeams > 0 ? (currentPickNum % numTeams) + 1 : 1;
  const timerPct       = (timer / PICK_TIME) * 100;

  const myPicks = picks.filter(p => p.user_id === userId);
  const myRoster: Record<UnitType, number> = { QB: 0, RB: 0, WR: 0, TE: 0, DEF: 0, K: 0 };
  for (const p of myPicks) {
    const t = p.player_data?.unitType as UnitType;
    if (t) myRoster[t] = (myRoster[t] ?? 0) + 1;
  }

  // ── initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      if (!cancelled) setUserId(user.id);

      const [{ data: lg }, { data: mbs }, { data: pks }] = await Promise.all([
        supabase.from('leagues').select('*').eq('id', leagueId).single(),
        supabase.from('league_members').select('*').eq('league_id', leagueId)
          .order('draft_slot', { ascending: true }),
        supabase.from('draft_picks').select('*').eq('league_id', leagueId)
          .order('pick_number', { ascending: true }),
      ]);

      if (cancelled) return;
      if (!lg) { router.push('/'); return; }

      setLeague(lg);
      setMembers((mbs ?? []).sort((a: any, b: any) => (a.draft_slot ?? 99) - (b.draft_slot ?? 99)));

      const existingPicks = pks ?? [];
      setPicks(existingPicks);

      const takenIds = new Set(existingPicks.map((p: any) => p.player_id));
      setAvail([...FULL_POOL].sort((a, b) => b.projectedPoints - a.projectedPoints).filter(u => !takenIds.has(u.id)));

      // Fetch efficiency badges
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

      setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [leagueId, router]);

  // ── realtime: new picks ───────────────────────────────────────────────────

  useEffect(() => {
    if (!leagueId) return;

    const picksCh = supabase.channel(`draft-${leagueId}-picks`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'draft_picks',
        filter: `league_id=eq.${leagueId}`,
      }, (payload) => {
        const p = payload.new as any;
        setPicks(prev => {
          if (prev.some(x => x.pick_number === p.pick_number)) return prev;
          return [...prev, p].sort((a, b) => a.pick_number - b.pick_number);
        });
        setAvail(prev => prev.filter(u => u.id !== p.player_id));
        setTimer(PICK_TIME); // reset timer for next pick
      })
      .subscribe();

    // Watch league status (draft complete → redirect all)
    const leagueCh = supabase.channel(`draft-${leagueId}-league`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'leagues',
        filter: `id=eq.${leagueId}`,
      }, (payload) => {
        setLeague((prev: any) => ({ ...prev, ...payload.new }));
        if ((payload.new as any).status === 'active') {
          router.push(`/league/${leagueId}`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(picksCh);
      supabase.removeChannel(leagueCh);
    };
  }, [leagueId, router]);

  // ── timer + auto-pick ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!draftLive || draftDone || loading) return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          // Auto-pick if it's our turn and we haven't attempted for this pick yet
          if (isMyTurn && !autoAttempted.current.has(currentPickNum)) {
            autoAttempted.current.add(currentPickNum);
            const best = autoPick(avail, myRoster);
            if (best) insertPick(best);
          }
          return PICK_TIME;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLive, draftDone, loading, isMyTurn, currentPickNum]);

  // ── draft complete: commissioner finalizes ────────────────────────────────

  useEffect(() => {
    if (draftDone && isCommissioner && league?.status === 'drafting') {
      supabase.from('leagues')
        .update({ status: 'active' })
        .eq('id', leagueId)
        .then(() => router.push(`/league/${leagueId}`));
    }
  }, [draftDone, isCommissioner, league?.status, leagueId, router]);

  // ── actions ───────────────────────────────────────────────────────────────

  async function insertPick(unit: DraftUnit) {
    if (!userId) return;
    const nt      = members.length;
    const r       = nt > 0 ? Math.floor(picks.length / nt) : 0;
    const pickNum = picks.length;

    const newPick = {
      id:          crypto.randomUUID(),
      league_id:   leagueId,
      user_id:     userId,
      player_id:   unit.id,
      player_data: unit,
      round:       r,
      pick_number: pickNum,
      picked_at:   new Date().toISOString(),
    };

    // Optimistic update — apply immediately so the UI responds even if Realtime is slow
    setPicks(prev => {
      if (prev.some(p => p.pick_number === pickNum)) return prev;
      return [...prev, newPick];
    });
    setAvail(prev => prev.filter(u => u.id !== unit.id));
    setTimer(PICK_TIME);

    const { error } = await supabase.from('draft_picks').insert({
      league_id:   leagueId,
      user_id:     userId,
      player_id:   unit.id,
      player_data: unit,
      round:       r,
      pick_number: pickNum,
    });

    if (error) {
      if (error.code === '23505') {
        // Another client beat us — roll back the optimistic pick
        setPicks(prev => prev.filter(p => p.pick_number !== pickNum));
        setAvail(prev => {
          const already = prev.some(u => u.id === unit.id);
          return already ? prev : [unit, ...prev].sort((a, b) => b.projectedPoints - a.projectedPoints);
        });
      } else {
        console.error('Pick insert error:', error);
      }
    }
  }

  function handlePickClick(unit: DraftUnit) {
    const overCap = (myRoster[unit.unitType] ?? 0) >= POSITION_CAPS[unit.unitType];
    if (!isMyTurn || overCap || draftDone) return;
    insertPick(unit);
  }

  async function startDraft() {
    if (!isCommissioner) return;
    // Assign draft slots if not yet assigned (randomize order)
    const needsSlots = members.some(m => !m.draft_slot);
    if (needsSlots) {
      const shuffled = [...members].sort(() => Math.random() - 0.5);
      await Promise.all(
        shuffled.map((m, i) =>
          supabase.from('league_members')
            .update({ draft_slot: i + 1 })
            .eq('id', m.id)
        )
      );
      setMembers(shuffled.map((m, i) => ({ ...m, draft_slot: i + 1 })));
    }
    const { error } = await supabase.from('leagues')
      .update({ status: 'drafting' })
      .eq('id', leagueId);
    if (!error) setLeague((prev: any) => ({ ...prev, status: 'drafting' }));
  }

  function effBadgeBg(mult: number) {
    if (mult >= 1.15) return '#16a34a';
    if (mult >= 1.10) return '#15803d';
    if (mult >= 1.05) return '#a16207';
    return C.muted;
  }

  const filtered = avail.filter(u => filter === 'ALL' || u.unitType === filter);

  // ── loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald', sans-serif", color: C.text }}>
        Loading draft room...
      </div>
    );
  }

  // ── pre-draft waiting room ────────────────────────────────────────────────

  if (!draftLive) {
    const totalPicks2 = members.length * TOTAL_ROUNDS;
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald', sans-serif", color: C.text }}>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 40, width: 440, maxWidth: '90vw' }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: 2, color: C.gold, marginBottom: 6 }}>DRAFT ROOM</div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, marginBottom: 32 }}>{league?.name} · {members.length} teams · {totalPicks2} total picks</div>

          {/* Draft Order section */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: C.sub, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>Draft Order</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
              {members.map((m, i) => {
                const isMe   = m.user_id === userId;
                const isComm = m.user_id === league?.commissioner_id;
                const slot   = m.draft_slot ?? i + 1;
                return (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 10px', borderRadius: 6,
                    background: isMe ? `${C.gold}18` : C.surf2,
                    border: `1px solid ${isMe ? C.gold + '44' : C.surf3}`,
                  }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, background: isMe ? C.gold : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: isMe ? C.bg : C.muted, fontWeight: 700 }}>
                      {slot}
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: isMe ? C.gold : C.sub }}>{m.team_name}</div>
                    {isMe   && <div style={{ fontSize: 9, color: C.gold, letterSpacing: 1, flexShrink: 0 }}>YOU</div>}
                    {isComm && !isMe && <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, flexShrink: 0 }}>COMM</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: C.muted, letterSpacing: .5 }}>
              🐍 Snake draft · {TOTAL_ROUNDS} rounds · slots randomized on start
            </div>
          </div>

          {isCommissioner ? (
            <button
              onClick={startDraft}
              style={{ width: '100%', padding: '14px 20px', background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 15, letterSpacing: 2, color: C.bg }}
            >
              🏈 START DRAFT
            </button>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, letterSpacing: 1, padding: '14px 0' }}>
              Waiting for commissioner to start the draft...
            </div>
          )}

          <button
            onClick={() => router.push(`/league/${leagueId}`)}
            style={{ marginTop: 10, width: '100%', padding: '10px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 1, color: C.muted }}
          >
            ← Back to League
          </button>
        </div>
      </div>
    );
  }

  // ── draft complete screen ─────────────────────────────────────────────────

  if (draftDone) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', padding: 32, fontFamily: "'Oswald', sans-serif", color: C.text }}>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 28, letterSpacing: 2, color: C.gold }}>DRAFT COMPLETE</div>
            <button onClick={() => router.push(`/league/${leagueId}`)} style={{ padding: '10px 22px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.sub, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 2 }}>
              → VIEW LEAGUE
            </button>
          </div>
          <div style={{ marginBottom: 16, fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' }}>Your Roster</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {myPicks.map((p, i) => (
              <div key={i} style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '12px 14px', borderLeft: `3px solid ${POS_COLORS[p.player_data?.unitType as UnitType] ?? C.muted}` }}>
                <div style={{ fontSize: 10, color: POS_COLORS[p.player_data?.unitType as UnitType] ?? C.muted, letterSpacing: 2, marginBottom: 4 }}>{p.player_data?.unitType}</div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{p.player_data?.school}</div>
                {p.player_data?.playerName && <div style={{ fontSize: 11, color: C.muted }}>{p.player_data.playerName}</div>}
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Round {p.round + 1} · Pick #{p.pick_number + 1}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── live draft room ───────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, overflow: 'hidden', fontFamily: "'Oswald', sans-serif", color: C.text }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${C.surf}; }
        ::-webkit-scrollbar-thumb { background: ${C.surf3}; border-radius: 2px; }
        .pick-row:hover { background: ${C.surf2} !important; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
      `}</style>

      {/* ── Draft Board ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '12px 20px', background: C.surf, borderBottom: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => router.push(`/league/${leagueId}`)} style={{ background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '6px 12px', color: C.muted, cursor: 'pointer', fontSize: 11, letterSpacing: 1, fontFamily: "'Oswald', sans-serif" }}>← EXIT</button>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, letterSpacing: 2, color: C.gold }}>
              {league?.name?.toUpperCase()} · DRAFT
            </div>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1 }}>
              Round {round + 1} · Pick {pickInRound} of {numTeams}
            </div>
          </div>

          {/* Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: isMyTurn ? C.gold : C.muted }}>
              {isMyTurn ? '⚡ YOUR PICK' : `${onClockMember?.team_name ?? '...'} picking...`}
            </div>
            <div style={{ position: 'relative', width: 44, height: 44 }}>
              <svg width="44" height="44" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="22" cy="22" r="18" fill="none" stroke={C.surf3} strokeWidth="3" />
                <circle cx="22" cy="22" r="18" fill="none"
                  stroke={isMyTurn ? C.gold : C.muted} strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 18}`}
                  strokeDashoffset={`${2 * Math.PI * 18 * (1 - timerPct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Anton', sans-serif", fontSize: 13, color: isMyTurn ? C.gold : C.muted }}>
                {timer}
              </div>
            </div>
          </div>
        </div>

        {/* Board grid */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 11 }}>
            <thead>
              <tr style={{ background: C.surf2, position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '8px 12px', color: C.muted, fontWeight: 400, letterSpacing: 1, textAlign: 'left', borderRight: `1px solid ${C.surf3}`, minWidth: 44 }}>RD</th>
                {members.map(m => (
                  <th key={m.id} style={{
                    padding: '8px 10px', textAlign: 'center', minWidth: 120,
                    borderRight: `1px solid ${C.surf3}`,
                    color: m.user_id === userId ? C.gold : C.sub,
                    fontWeight: m.user_id === userId ? 700 : 400, letterSpacing: .5,
                  }}>
                    {m.team_name}
                    {m.user_id === userId && <span style={{ fontSize: 8, marginLeft: 4, color: C.gold }}>★</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: TOTAL_ROUNDS }).map((_, r) => (
                <tr key={r} style={{ borderBottom: `1px solid ${C.surf3}` }}>
                  <td style={{ padding: '6px 12px', color: C.muted, borderRight: `1px solid ${C.surf3}`, fontFamily: "'Anton', sans-serif", fontSize: 12 }}>
                    {r + 1}
                  </td>
                  {Array.from({ length: numTeams }).map((_, col) => {
                    const pickNum = r % 2 === 0
                      ? r * numTeams + col
                      : r * numTeams + (numTeams - 1 - col);
                    const pick    = picks.find(p => p.pick_number === pickNum);
                    const isActive = pickNum === currentPickNum;
                    const isOwn   = pick?.user_id === userId;
                    return (
                      <td key={col} style={{
                        padding: '4px 6px', minWidth: 120,
                        borderRight: `1px solid ${C.surf3}`,
                        background: isActive ? `${C.gold}15` : 'transparent',
                      }}>
                        {pick ? (
                          <div style={{
                            padding: '4px 6px', borderRadius: 4,
                            background: `${POS_COLORS[pick.player_data?.unitType as UnitType] ?? C.muted}${isOwn ? '28' : '14'}`,
                            borderLeft: `2px solid ${POS_COLORS[pick.player_data?.unitType as UnitType] ?? C.muted}`,
                          }}>
                            <div style={{ fontSize: 10, letterSpacing: 1, color: POS_COLORS[pick.player_data?.unitType as UnitType] ?? C.muted }}>
                              {pick.player_data?.unitType}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: isOwn ? 700 : 400, color: isOwn ? C.text : C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {pick.player_data?.school}
                            </div>
                          </div>
                        ) : isActive ? (
                          <div style={{ padding: '4px 6px', color: C.gold, fontSize: 10, letterSpacing: 1, animation: 'pulse 1.5s infinite' }}>
                            ON THE CLOCK
                          </div>
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

      {/* ── Player Pool ─────────────────────────────────────────── */}
      <div style={{ width: 320, background: C.surf, borderLeft: `1px solid ${C.surf3}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Position filters */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.surf3}`, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: C.text, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
            AVAILABLE PLAYERS
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF', 'K'] as const).map(pos => (
              <button key={pos} onClick={() => setFilter(pos)} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 10, letterSpacing: 1, fontFamily: "'Oswald', sans-serif",
                background: filter === pos ? (pos === 'ALL' ? C.gold : POS_COLORS[pos as UnitType]) : C.surf2,
                color: filter === pos ? C.bg : C.sub,
              }}>{pos}</button>
            ))}
          </div>
        </div>

        {/* Status banner */}
        {!isMyTurn && (
          <div style={{ padding: '8px 16px', background: `${C.muted}22`, borderBottom: `1px solid ${C.surf3}`, fontSize: 11, color: C.muted, flexShrink: 0 }}>
            Waiting for {onClockMember?.team_name ?? '...'}...
          </div>
        )}
        {isMyTurn && (
          <div style={{ padding: '8px 16px', background: `${C.gold}18`, borderBottom: `1px solid ${C.gold}44`, fontSize: 11, color: C.gold, letterSpacing: .5, fontWeight: 600, flexShrink: 0 }}>
            ⚡ Your turn — {timer}s remaining
          </div>
        )}

        {/* Player list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.slice(0, 100).map((unit, i) => {
            const overCap  = (myRoster[unit.unitType] ?? 0) >= POSITION_CAPS[unit.unitType];
            const canPick  = isMyTurn && !overCap;
            return (
              <div
                key={unit.id}
                className="pick-row"
                onClick={() => handlePickClick(unit)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', borderBottom: `1px solid ${C.surf3}22`,
                  opacity: overCap ? 0.3 : 1,
                  background: 'transparent', transition: 'background .1s',
                  cursor: canPick ? 'pointer' : 'default',
                }}
              >
                <div style={{ width: 20, fontSize: 10, color: C.muted, flexShrink: 0, textAlign: 'right' }}>{i + 1}</div>
                <div style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: `${POS_COLORS[unit.unitType]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: POS_COLORS[unit.unitType], letterSpacing: 1, fontWeight: 700 }}>
                  {unit.unitType}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {unit.school}
                    {unit.playerName && <span style={{ color: C.sub, fontWeight: 400 }}> · {unit.playerName}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: POS_COLORS[unit.unitType], letterSpacing: 1, padding: '1px 5px', background: `${POS_COLORS[unit.unitType]}18`, borderRadius: 3 }}>
                      {unit.tier}
                    </span>
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

        {/* Roster summary */}
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.surf3}`, background: C.surf2, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8 }}>
            MY ROSTER ({myPicks.length}/{TOTAL_ROUNDS})
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(POSITION_CAPS) as UnitType[]).map(pos => (
              <div key={pos} style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4, background: C.surf,
                color: myRoster[pos] > 0 ? POS_COLORS[pos] : C.muted,
                border: `1px solid ${myRoster[pos] > 0 ? POS_COLORS[pos] + '44' : C.surf3}`,
              }}>
                {pos} {myRoster[pos]}/{POSITION_CAPS[pos]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
