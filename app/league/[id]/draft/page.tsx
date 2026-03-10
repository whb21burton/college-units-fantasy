'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
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
const PICK_TIME = 90;

type DraftTeam = {
  type: 'human' | 'cpu';
  userId?: string;
  teamName: string;
  slot: number;
};

function snakeIndex(pickNum: number, numTeams: number): number {
  const round = Math.floor(pickNum / numTeams);
  const pos   = pickNum % numTeams;
  return round % 2 === 0 ? pos : numTeams - 1 - pos;
}

function autoPick(available: DraftUnit[], rosterCount: Record<UnitType, number>): DraftUnit | null {
  const sorted = [...available].sort((a, b) => b.projectedPoints - a.projectedPoints);
  for (const unit of sorted) {
    if ((rosterCount[unit.unitType] ?? 0) < POSITION_CAPS[unit.unitType]) return unit;
  }
  return sorted[0] ?? null;
}

function buildAllTeams(lg: any, mbs: any[]): DraftTeam[] {
  const draftOrder = lg?.settings?.draft_order as DraftTeam[] | undefined;
  if (draftOrder?.length) return draftOrder;
  // Pre-draft: human members only (slots not yet assigned)
  return [...mbs]
    .sort((a, b) => (a.draft_slot ?? 99) - (b.draft_slot ?? 99))
    .map((m, i) => ({ type: 'human' as const, userId: m.user_id, teamName: m.team_name, slot: m.draft_slot ?? i + 1 }));
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DraftPage() {
  const router   = useRouter();
  const params   = useParams();
  const leagueId = params?.id as string;

  const [userId,   setUserId]   = useState<string | null>(null);
  const [league,   setLeague]   = useState<any>(null);
  const [members,  setMembers]  = useState<any[]>([]);
  const [allTeams, setAllTeams] = useState<DraftTeam[]>([]);
  const [picks,    setPicks]    = useState<any[]>([]);
  const [avail,    setAvail]    = useState<DraftUnit[]>([]);
  const [filter,   setFilter]   = useState<UnitType | 'ALL'>('ALL');
  const [timer,    setTimer]    = useState(PICK_TIME);
  const [loading,  setLoading]  = useState(true);
  const [effMap,   setEffMap]   = useState<Record<string, TeamEfficiency>>({});

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAttempted = useRef<Set<number>>(new Set());

  // ── Derived ────────────────────────────────────────────────────────────────

  const numTeams      = allTeams.length;
  const totalPicks    = numTeams * TOTAL_ROUNDS;
  const currentPickNum = picks.length;
  const teamIdx       = numTeams > 0 ? snakeIndex(currentPickNum, numTeams) : 0;
  const onClockTeam   = allTeams[teamIdx] ?? null;
  const isMyTurn      = !!userId && onClockTeam?.type === 'human' && onClockTeam.userId === userId;
  const isCpuTurn     = onClockTeam?.type === 'cpu';
  const isCommissioner = !!userId && league?.commissioner_id === userId;
  const draftLive     = league?.status === 'drafting';
  const draftDone     = totalPicks > 0 && currentPickNum >= totalPicks;
  const round         = numTeams > 0 ? Math.floor(currentPickNum / numTeams) : 0;
  const pickInRound   = numTeams > 0 ? (currentPickNum % numTeams) + 1 : 1;
  const timerPct      = (timer / PICK_TIME) * 100;

  // Picks that belong to MY draft slots (correct even when commissioner inserts CPU picks)
  const mySlotPicks = picks.filter(p => {
    if (numTeams === 0) return false;
    return allTeams[snakeIndex(p.pick_number, numTeams)]?.userId === userId;
  });

  const myRoster: Record<UnitType, number> = { QB: 0, RB: 0, WR: 0, TE: 0, DEF: 0, K: 0 };
  for (const p of mySlotPicks) {
    const t = p.player_data?.unitType as UnitType;
    if (t) myRoster[t] = (myRoster[t] ?? 0) + 1;
  }

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      if (!cancelled) setUserId(user.id);

      const [{ data: lg }, { data: mbs }, { data: pks }, poolRes] = await Promise.all([
        supabase.from('leagues').select('*').eq('id', leagueId).single(),
        supabase.from('league_members').select('*').eq('league_id', leagueId)
          .order('draft_slot', { ascending: true }),
        supabase.from('draft_picks').select('*').eq('league_id', leagueId)
          .order('pick_number', { ascending: true }),
        fetch('/api/player-pool').then(r => r.json()).catch(() => []),
      ]);

      if (cancelled) return;
      if (!lg) { router.push('/'); return; }

      const membersArr = mbs ?? [];
      setLeague(lg);
      setMembers(membersArr);
      setAllTeams(buildAllTeams(lg, membersArr));

      const existingPicks = pks ?? [];
      setPicks(existingPicks);

      const livePool: DraftUnit[] = Array.isArray(poolRes) ? poolRes : [];
      const takenIds = new Set(existingPicks.map((p: any) => p.player_id));
      setAvail([...livePool].sort((a, b) => b.projectedPoints - a.projectedPoints).filter(u => !takenIds.has(u.id)));

      const season = new Date().getFullYear();
      fetch(`/api/efficiency?week=1&season=${season}`)
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (!json?.data) return;
          const map: Record<string, TeamEfficiency> = {};
          for (const row of json.data as TeamEfficiency[]) map[row.school] = row;
          if (!cancelled) setEffMap(map);
        })
        .catch(() => {});

      if (!cancelled) setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, [leagueId, router]);

  // ── Realtime ──────────────────────────────────────────────────────────────

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
        setTimer(PICK_TIME);
      })
      .subscribe();

    const leagueCh = supabase.channel(`draft-${leagueId}-league`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'leagues',
        filter: `id=eq.${leagueId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setLeague((prev: any) => ({ ...prev, ...updated }));
        if (updated.settings?.draft_order?.length) {
          setAllTeams(updated.settings.draft_order);
        }
        if (updated.status === 'active') {
          router.push(`/league/${leagueId}`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(picksCh);
      supabase.removeChannel(leagueCh);
    };
  }, [leagueId, router]);

  // ── Human pick timer ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!draftLive || draftDone || loading || isCpuTurn) return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
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
  }, [draftLive, draftDone, loading, isMyTurn, currentPickNum, isCpuTurn]);

  // ── CPU auto-pick (commissioner handles all CPU picks) ─────────────────────

  useEffect(() => {
    if (!draftLive || draftDone || !isCommissioner || !isCpuTurn) return;

    const timeout = setTimeout(() => {
      if (autoAttempted.current.has(currentPickNum)) return;
      autoAttempted.current.add(currentPickNum);

      // Build this CPU team's roster from picks at its slot
      const cpuRoster: Record<UnitType, number> = { QB: 0, RB: 0, WR: 0, TE: 0, DEF: 0, K: 0 };
      for (const pick of picks) {
        if (numTeams > 0 && snakeIndex(pick.pick_number, numTeams) === teamIdx) {
          const t = pick.player_data?.unitType as UnitType;
          if (t) cpuRoster[t] = (cpuRoster[t] ?? 0) + 1;
        }
      }

      const best = autoPick(avail, cpuRoster);
      if (best) insertPick(best);
    }, 700);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPickNum, draftLive, draftDone, isCommissioner, isCpuTurn, teamIdx]);

  // ── Draft complete ────────────────────────────────────────────────────────

  useEffect(() => {
    if (draftDone && isCommissioner && league?.status === 'drafting') {
      supabase.from('leagues')
        .update({ status: 'active' })
        .eq('id', leagueId)
        .then(() => router.push(`/league/${leagueId}`));
    }
  }, [draftDone, isCommissioner, league?.status, leagueId, router]);

  // ── Insert pick ───────────────────────────────────────────────────────────

  async function insertPick(unit: DraftUnit) {
    if (!userId) return;
    const nt     = numTeams || members.length;
    const r      = nt > 0 ? Math.floor(picks.length / nt) : 0;
    const pickNum = picks.length;

    const newPick = {
      id: crypto.randomUUID(), league_id: leagueId, user_id: userId,
      player_id: unit.id, player_data: unit, round: r,
      pick_number: pickNum, picked_at: new Date().toISOString(),
    };

    setPicks(prev => {
      if (prev.some(p => p.pick_number === pickNum)) return prev;
      return [...prev, newPick];
    });
    setAvail(prev => prev.filter(u => u.id !== unit.id));
    setTimer(PICK_TIME);

    const { error } = await supabase.from('draft_picks').insert({
      league_id: leagueId, user_id: userId,
      player_id: unit.id, player_data: unit, round: r, pick_number: pickNum,
    });

    if (error) {
      if (error.code === '23505') {
        setPicks(prev => prev.filter(p => p.pick_number !== pickNum));
        setAvail(prev => {
          if (prev.some(u => u.id === unit.id)) return prev;
          return [unit, ...prev].sort((a, b) => b.projectedPoints - a.projectedPoints);
        });
      } else {
        console.error('Pick insert error:', error);
      }
    }
  }

  function handlePickClick(unit: DraftUnit) {
    if (!isMyTurn || (myRoster[unit.unitType] ?? 0) >= POSITION_CAPS[unit.unitType] || draftDone) return;
    insertPick(unit);
  }

  // ── Start draft ───────────────────────────────────────────────────────────

  async function startDraft() {
    if (!isCommissioner) return;

    const cpuTeamNames = (league?.settings?.cpu_teams as string[]) ?? [];

    const humanObjs: DraftTeam[] = members.map(m => ({
      type: 'human' as const, userId: m.user_id, teamName: m.team_name, slot: 0,
    }));
    const cpuObjs: DraftTeam[] = cpuTeamNames.map(name => ({
      type: 'cpu' as const, teamName: name, slot: 0,
    }));

    const shuffled = [...humanObjs, ...cpuObjs].sort(() => Math.random() - 0.5);
    const ordered: DraftTeam[] = shuffled.map((t, i) => ({ ...t, slot: i + 1 }));

    // Update draft_slot for each human (self-update allowed; commissioner updates own slot)
    await Promise.all(
      ordered
        .filter(t => t.type === 'human')
        .map(t =>
          supabase.from('league_members')
            .update({ draft_slot: t.slot })
            .eq('league_id', leagueId)
            .eq('user_id', t.userId!)
        )
    );

    // Store full draft_order in settings and set status → drafting
    const { error } = await supabase.from('leagues').update({
      status: 'drafting',
      settings: { ...league.settings, draft_order: ordered },
    }).eq('id', leagueId);

    if (!error) {
      setLeague((prev: any) => ({
        ...prev, status: 'drafting',
        settings: { ...prev.settings, draft_order: ordered },
      }));
      setAllTeams(ordered);
    }
  }

  function effBadgeBg(mult: number) {
    if (mult >= 1.15) return '#16a34a';
    if (mult >= 1.10) return '#15803d';
    if (mult >= 1.05) return '#a16207';
    return C.muted;
  }

  const filtered = avail.filter(u => filter === 'ALL' || u.unitType === filter);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald', sans-serif", color: C.text }}>
        Loading draft room...
      </div>
    );
  }

  // ── Pre-draft lobby ───────────────────────────────────────────────────────

  if (!draftLive) {
    const cpuTeamNames = (league?.settings?.cpu_teams as string[]) ?? [];
    const lobbyTeams = [
      ...members.map(m => ({ name: m.team_name, type: 'human' as const, isMe: m.user_id === userId })),
      ...cpuTeamNames.map(name => ({ name, type: 'cpu' as const, isMe: false })),
    ];

    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald', sans-serif", color: C.text }}>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 40, width: 440, maxWidth: '90vw' }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: 2, color: C.gold, marginBottom: 6 }}>DRAFT ROOM</div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1, marginBottom: 32 }}>
            {league?.name} · {lobbyTeams.length} teams · {lobbyTeams.length * TOTAL_ROUNDS} total picks
          </div>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: C.sub, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>Draft Order</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
              {lobbyTeams.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6,
                  background: t.isMe ? `${C.gold}18` : t.type === 'cpu' ? 'rgba(58,130,246,.08)' : C.surf2,
                  border: `1px solid ${t.isMe ? C.gold + '44' : t.type === 'cpu' ? 'rgba(58,130,246,.3)' : C.surf3}`,
                }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, background: t.isMe ? C.gold : t.type === 'cpu' ? 'rgba(58,130,246,.3)' : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: t.isMe ? C.bg : t.type === 'cpu' ? C.blue : C.muted, fontWeight: 700 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: t.isMe ? C.gold : t.type === 'cpu' ? C.blue : C.sub }}>{t.name}</div>
                  {t.isMe   && <div style={{ fontSize: 9, color: C.gold, letterSpacing: 1, flexShrink: 0 }}>YOU</div>}
                  {t.type === 'cpu' && <div style={{ fontSize: 9, color: C.blue, letterSpacing: 1, flexShrink: 0 }}>CPU</div>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: C.muted, letterSpacing: .5 }}>
              🐍 Snake draft · {TOTAL_ROUNDS} rounds · order randomized on start
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

  // ── Draft complete ────────────────────────────────────────────────────────

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
            {mySlotPicks.map((p, i) => (
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

  // ── Live draft room ───────────────────────────────────────────────────────

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: isCpuTurn ? C.blue : isMyTurn ? C.gold : C.muted }}>
              {isCpuTurn
                ? `${onClockTeam?.teamName} (CPU) picking...`
                : isMyTurn
                ? '⚡ YOUR PICK'
                : `${onClockTeam?.teamName ?? '...'} picking...`}
            </div>
            {!isCpuTurn && (
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
            )}
          </div>
        </div>

        {/* Board grid */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 11 }}>
            <thead>
              <tr style={{ background: C.surf2, position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '8px 12px', color: C.muted, fontWeight: 400, letterSpacing: 1, textAlign: 'left', borderRight: `1px solid ${C.surf3}`, minWidth: 44 }}>RD</th>
                {allTeams.map((t, i) => (
                  <th key={i} style={{
                    padding: '8px 10px', textAlign: 'center', minWidth: 110,
                    borderRight: `1px solid ${C.surf3}`,
                    color: t.type === 'cpu' ? C.blue : t.userId === userId ? C.gold : C.sub,
                    fontWeight: t.userId === userId ? 700 : 400, letterSpacing: .5,
                  }}>
                    {t.teamName}
                    {t.userId === userId && <span style={{ fontSize: 8, marginLeft: 4, color: C.gold }}>★</span>}
                    {t.type === 'cpu' && <span style={{ fontSize: 8, marginLeft: 4, color: C.blue }}>CPU</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: TOTAL_ROUNDS }).map((_, r) => (
                <tr key={r} style={{ borderBottom: `1px solid ${C.surf3}` }}>
                  <td style={{ padding: '6px 12px', color: C.muted, borderRight: `1px solid ${C.surf3}`, fontFamily: "'Anton', sans-serif", fontSize: 12 }}>{r + 1}</td>
                  {Array.from({ length: numTeams }).map((_, col) => {
                    const pickNum  = r % 2 === 0 ? r * numTeams + col : r * numTeams + (numTeams - 1 - col);
                    const pick     = picks.find(p => p.pick_number === pickNum);
                    const isActive = pickNum === currentPickNum;
                    const colTeam  = allTeams[col];
                    const isOwn    = colTeam?.userId === userId;
                    const isCpuCol = colTeam?.type === 'cpu';
                    return (
                      <td key={col} style={{
                        padding: '4px 6px', minWidth: 110,
                        borderRight: `1px solid ${C.surf3}`,
                        background: isActive ? (isCpuCol ? 'rgba(58,130,246,.12)' : `${C.gold}15`) : 'transparent',
                      }}>
                        {pick ? (
                          <div style={{ padding: '4px 6px', borderRadius: 4, background: `${POS_COLORS[pick.player_data?.unitType as UnitType] ?? C.muted}${isOwn ? '28' : '14'}`, borderLeft: `2px solid ${POS_COLORS[pick.player_data?.unitType as UnitType] ?? C.muted}` }}>
                            <div style={{ fontSize: 10, letterSpacing: 1, color: POS_COLORS[pick.player_data?.unitType as UnitType] ?? C.muted }}>{pick.player_data?.unitType}</div>
                            <div style={{ fontSize: 11, fontWeight: isOwn ? 700 : 400, color: isOwn ? C.text : C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pick.player_data?.school}</div>
                          </div>
                        ) : isActive ? (
                          <div style={{ padding: '4px 6px', color: isCpuCol ? C.blue : C.gold, fontSize: 10, letterSpacing: 1, animation: 'pulse 1.5s infinite' }}>
                            {isCpuCol ? 'CPU...' : 'ON THE CLOCK'}
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

        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.surf3}`, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: C.text, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>AVAILABLE PLAYERS</div>
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

        {isCpuTurn && (
          <div style={{ padding: '8px 16px', background: 'rgba(58,130,246,.12)', borderBottom: `1px solid rgba(58,130,246,.3)`, fontSize: 11, color: C.blue, letterSpacing: .5, flexShrink: 0 }}>
            {onClockTeam?.teamName} (CPU) is picking...
          </div>
        )}
        {!isCpuTurn && !isMyTurn && (
          <div style={{ padding: '8px 16px', background: `${C.muted}22`, borderBottom: `1px solid ${C.surf3}`, fontSize: 11, color: C.muted, flexShrink: 0 }}>
            Waiting for {onClockTeam?.teamName ?? '...'}...
          </div>
        )}
        {isMyTurn && (
          <div style={{ padding: '8px 16px', background: `${C.gold}18`, borderBottom: `1px solid ${C.gold}44`, fontSize: 11, color: C.gold, letterSpacing: .5, fontWeight: 600, flexShrink: 0 }}>
            ⚡ Your turn — {timer}s remaining
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.slice(0, 100).map((unit, i) => {
            const overCap = (myRoster[unit.unitType] ?? 0) >= POSITION_CAPS[unit.unitType];
            const canPick = isMyTurn && !overCap;
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
                    {unit.school}{unit.playerName && <span style={{ color: C.sub, fontWeight: 400 }}> · {unit.playerName}</span>}
                  </div>
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

        <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.surf3}`, background: C.surf2, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8 }}>
            MY ROSTER ({mySlotPicks.length}/{TOTAL_ROUNDS})
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(POSITION_CAPS) as UnitType[]).map(pos => (
              <div key={pos} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: C.surf, color: myRoster[pos] > 0 ? POS_COLORS[pos] : C.muted, border: `1px solid ${myRoster[pos] > 0 ? POS_COLORS[pos] + '44' : C.surf3}` }}>
                {pos} {myRoster[pos]}/{POSITION_CAPS[pos]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
