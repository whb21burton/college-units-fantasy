'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { ROSTER_SLOTS, sortByVORP, type DraftUnit, type UnitType } from '@/lib/playerPool';
import { generateSchedule } from '@/lib/scheduleEngine';
import type { TeamEfficiency } from '@/types';

function goBack(leagueId: string, router: any) {
  if (typeof window !== 'undefined' && window.parent !== window) {
    window.parent.postMessage({ type: 'NAVIGATE', url: `/league/${leagueId}` }, '*');
  } else {
    router.push(`/league/${leagueId}`);
  }
}

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a', text: '#e8edf5', sub: '#7a90b0', muted: '#4a5d7a',
  green: '#2ecc71', red: '#e74c3c', blue: '#3b82f6', orange: '#f39c12',
};

const POS_COLORS: Record<UnitType, string> = {
  QB: '#3b82f6', RB: '#2ecc71', WR: '#d4a828', TE: '#f39c12', DEF: '#e74c3c', K: '#7a90b0',
};

const TOTAL_ROUNDS  = ROSTER_SLOTS.starters.length + ROSTER_SLOTS.bench.length;
const PICK_TIME     = 90;
const SALARY_BUDGET = 200;

/** Price a unit by its position rank in the full original pool (stable throughout draft). */
function positionRankPrice(unit: DraftUnit, allUnits: DraftUnit[], isConference = false): number {
  const peers = [...allUnits]
    .filter(u => u.unitType === unit.unitType)
    .sort((a, b) => (b.seasonTotal ?? b.projectedPoints) - (a.seasonTotal ?? a.projectedPoints));
  const rank = peers.findIndex(u => u.id === unit.id) + 1; // 1-based
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

const IDEAL_ROSTER: Record<UnitType, number> = { QB: 1, RB: 2, WR: 2, TE: 1, DEF: 1, K: 1 };
const MAX_ROSTER:   Record<UnitType, number> = { QB: 3, RB: 4, WR: 4, TE: 2, DEF: 3, K: 3 };

function autoPick(
  available: DraftUnit[],
  rosterCount: Record<UnitType, number>,
  lastPickPos?: UnitType | null,
): DraftUnit | null {
  const byPos: Partial<Record<UnitType, DraftUnit[]>> = {};
  for (const u of available) {
    if (!byPos[u.unitType]) byPos[u.unitType] = [];
    byPos[u.unitType]!.push(u);
  }
  const positions = Object.keys(IDEAL_ROSTER) as UnitType[];
  for (const pos of positions) byPos[pos]?.sort((a, b) => b.projectedPoints - a.projectedPoints);

  // Find positions below ideal minimum, sorted by most urgent need
  const needy = positions
    .filter(pos => (rosterCount[pos] ?? 0) < IDEAL_ROSTER[pos] && (byPos[pos]?.length ?? 0) > 0)
    .sort((a, b) => ((rosterCount[a] ?? 0) / IDEAL_ROSTER[a]) - ((rosterCount[b] ?? 0) / IDEAL_ROSTER[b]));

  if (needy.length > 0) {
    // Avoid back-to-back same position unless it's the only needy option
    if (lastPickPos && needy.length > 1) {
      const nonRepeat = needy.filter(p => p !== lastPickPos);
      if (nonRepeat.length > 0) return byPos[nonRepeat[0]]![0];
    }
    return byPos[needy[0]]![0] ?? null;
  }

  // All minimums met — pick best available under position max cap
  const candidates = available
    .filter(u => (rosterCount[u.unitType] ?? 0) < MAX_ROSTER[u.unitType])
    .sort((a, b) => b.projectedPoints - a.projectedPoints);
  if (lastPickPos) {
    const nonRepeat = candidates.filter(u => u.unitType !== lastPickPos);
    if (nonRepeat.length > 0) return nonRepeat[0];
  }
  return candidates[0] ?? available.sort((a, b) => b.projectedPoints - a.projectedPoints)[0] ?? null;
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

function CountdownTimer({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Opening now...'); clearInterval(interval); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);
  return (
    <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 36, color: C.gold, marginTop: 16, letterSpacing: 2 }}>
      {timeLeft}
    </div>
  );
}

function nilEstimate(tier: string, rank: number, total: number): string {
  const pct = total > 1 ? 1 - (rank - 1) / (total - 1) : 1;
  if (tier === 'Elite') return `$${(1 + pct * 2).toFixed(1)}M NIL`;
  if (tier === 'Solid') return `$${Math.round((200 + pct * 600))}K NIL`;
  return `$${Math.round((10 + pct * 90))}K NIL`;
}

export default function DraftPage() {
  const router   = useRouter();
  const params   = useParams();
  const leagueId = params?.id as string;

  const [userId,       setUserId]       = useState<string | null>(null);
  const [league,       setLeague]       = useState<any>(null);
  const [members,      setMembers]      = useState<any[]>([]);
  const [allTeams,     setAllTeams]     = useState<DraftTeam[]>([]);
  const [picks,        setPicks]        = useState<any[]>([]);
  const [avail,        setAvail]        = useState<DraftUnit[]>([]);
  const [filter,       setFilter]       = useState<UnitType | 'ALL'>('ALL');
  const [timer,        setTimer]        = useState(PICK_TIME);
  const [loading,      setLoading]      = useState(true);
  const [effMap,       setEffMap]       = useState<Record<string, TeamEfficiency>>({});
  const [viewingUnit,  setViewingUnit]  = useState<DraftUnit | null>(null);
  const [unitStats,    setUnitStats]    = useState<any | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [fullPool,     setFullPool]     = useState<DraftUnit[]>([]); // original pool, never filtered
  const [cpuPicking,   setCpuPicking]   = useState(false);
  const [poolOpen,     setPoolOpen]     = useState(true);
  const [logos,        setLogos]        = useState<Record<string, string>>({});

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAttempted = useRef<Set<number>>(new Set());
  const pickTimeRef   = useRef(PICK_TIME); // kept in sync with isSalaryDraft below

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

  const isSalaryDraft  = league?.draft_type === 'salary';
  const isConference   = !!(league?.conference_filter && league.conference_filter !== 'ALL');
  const pickTime      = isSalaryDraft ? 60 : PICK_TIME;
  // Keep ref in sync so timer callbacks (closures) always see the current pickTime
  pickTimeRef.current = pickTime;
  const timerPct      = (timer / pickTime) * 100;

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

  // Budget: sum of salary_cost on picks that belong to my draft slot
  const mySpent = mySlotPicks.reduce((s, p) => s + (p.salary_cost ?? 0), 0);
  const myBudgetLeft = SALARY_BUDGET - mySpent;

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
        fetch(`/api/player-pool?_t=${Date.now()}`).then(r => r.json()).catch(() => []),
      ]);

      if (cancelled) return;
      if (!lg) { router.push('/'); return; }

      const membersArr = mbs ?? [];
      setLeague(lg);
      setMembers(membersArr);
      setAllTeams(buildAllTeams(lg, membersArr));

      const existingPicks = pks ?? [];
      setPicks(existingPicks);

      const rawPool: DraftUnit[] = Array.isArray(poolRes) ? poolRes : [];
      const allowedSchools: string[] | null = Array.isArray(lg?.settings?.allowed_schools)
        ? lg.settings.allowed_schools as string[]
        : null;
      const conferenceFilter: string = lg?.conference_filter ?? '';
      const NO_CONF_FILTER = new Set(['', 'all', 'ALL', 'All D1', 'all d1']);
      let livePool = rawPool;
      if (allowedSchools && allowedSchools.length > 0) {
        // Use school whitelist — ignore conference filter
        livePool = rawPool.filter(u => allowedSchools.includes(u.school));
      } else if (conferenceFilter && !NO_CONF_FILTER.has(conferenceFilter)) {
        // No school whitelist — filter by conference (supports comma-separated list)
        const confs = conferenceFilter.split(',').map((c: string) => c.trim());
        livePool = rawPool.filter(u => confs.includes(u.conference));
      }
      if (!cancelled) setFullPool(livePool); // store original pool for stable salary pricing
      const takenIds = new Set(existingPicks.map((p: any) => p.player_id));
      setAvail(sortByVORP(livePool).filter(u => !takenIds.has(u.id)));

      // Non-blocking logo fetch
      fetch('/api/team-logos').then(r => r.json())
        .then(d => { if (!cancelled) setLogos(d.logos ?? (typeof d === 'object' && !Array.isArray(d) ? d : {})); })
        .catch(() => {});

      const season = 2026;
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

    init().catch(err => {
      console.error('[draft-pool] init() threw:', err);
      if (!cancelled) setLoading(false);
    });
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
        setTimer(pickTimeRef.current);
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
          goBack(leagueId, router);
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
          return pickTimeRef.current;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLive, draftDone, loading, isMyTurn, currentPickNum, isCpuTurn]);

  // ── CPU auto-pick ─────────────────────────────────────────────────────────
  // Fires immediately after any pick when the next team on the clock is CPU.
  // Chains: if multiple consecutive CPU teams are in a row, they all pick back
  // to back with no delay until it's a human's turn.

  useEffect(() => {
    if (!draftLive || draftDone || !isCpuTurn || !userId) {
      if (!isCpuTurn) setCpuPicking(false);
      return;
    }
    if (autoAttempted.current.has(currentPickNum)) return;
    autoAttempted.current.add(currentPickNum);

    setCpuPicking(true);

    // Build this CPU team's roster from picks at its slot
    const cpuRoster: Record<UnitType, number> = { QB: 0, RB: 0, WR: 0, TE: 0, DEF: 0, K: 0 };
    let lastPickPos: UnitType | null = null;
    let lastPickNum = -1;
    for (const pick of picks) {
      if (numTeams > 0 && snakeIndex(pick.pick_number, numTeams) === teamIdx) {
        const t = pick.player_data?.unitType as UnitType;
        if (t) {
          cpuRoster[t] = (cpuRoster[t] ?? 0) + 1;
          if (pick.pick_number > lastPickNum) { lastPickNum = pick.pick_number; lastPickPos = t; }
        }
      }
    }

    const best = autoPick(avail, cpuRoster, lastPickPos);
    if (best) setTimeout(() => insertPick(best), 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPickNum, draftLive, draftDone, userId, isCpuTurn, teamIdx]);

  // ── Draft complete ────────────────────────────────────────────────────────

  useEffect(() => {
    const canFinalize = isCommissioner || league?.is_public;
    if (draftDone && canFinalize && league?.status === 'drafting') {
      const teamIds = allTeams.map(t => t.userId ?? t.teamName);
      const schedule = generateSchedule(teamIds, 11);
      supabase.from('leagues')
        .update({ status: 'active', settings: { ...league.settings, schedule } })
        .eq('id', leagueId)
        .then(() => goBack(leagueId, router));
    }
  }, [draftDone, isCommissioner, league?.status, leagueId, router]);

  // ── Stats panel fetch ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!viewingUnit) { setUnitStats(null); return; }
    setStatsLoading(true);
    setUnitStats(null);
    fetch(`/api/unit-stats?school=${encodeURIComponent(viewingUnit.school)}&unitType=${viewingUnit.unitType}&season=2026`)
      .then(r => r.json())
      .then(d => { setUnitStats(d); setStatsLoading(false); })
      .catch(() => setStatsLoading(false));
  }, [viewingUnit?.school, viewingUnit?.unitType]);

  // ── Insert pick ───────────────────────────────────────────────────────────

  async function insertPick(unit: DraftUnit) {
    if (!userId) return;
    const nt      = numTeams || members.length;
    const r       = nt > 0 ? Math.floor(picks.length / nt) : 0;
    const pickNum = picks.length;
    const cost    = isSalaryDraft ? positionRankPrice(unit, fullPool, isConference) : null;

    const newPick = {
      id: crypto.randomUUID(), league_id: leagueId, user_id: userId,
      player_id: unit.id, player_data: unit, round: r,
      pick_number: pickNum, picked_at: new Date().toISOString(),
      salary_cost: cost,
    };

    setPicks(prev => {
      if (prev.some(p => p.pick_number === pickNum)) return prev;
      return [...prev, newPick];
    });
    setAvail(prev => prev.filter(u => u.id !== unit.id));
    setTimer(pickTimeRef.current);

    const { error } = await supabase.from('draft_picks').insert({
      league_id: leagueId, user_id: userId,
      player_id: unit.id, player_data: unit, round: r, pick_number: pickNum,
      salary_cost: cost,
    });

    if (error) {
      if (error.code === '23505') {
        setPicks(prev => prev.filter(p => p.pick_number !== pickNum));
        setAvail(prev => {
          if (prev.some(u => u.id === unit.id)) return prev;
          return [unit, ...prev].sort((a, b) => (b.vorp ?? 0) - (a.vorp ?? 0));
        });
      } else {
        console.error('Pick insert error:', error);
      }
    }
  }

  function handlePickClick(unit: DraftUnit) {
    if (!isMyTurn || draftDone) return;
    if (isSalaryDraft && positionRankPrice(unit, fullPool, isConference) > myBudgetLeft) return;
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

  // Position rank map from the full (never-filtered) pool — stable throughout draft
  const posRankMap = useMemo(() => {
    const m: Record<string, number> = {};
    const groups: Record<string, string[]> = {};
    for (const u of fullPool) {
      if (!groups[u.unitType]) groups[u.unitType] = [];
      groups[u.unitType].push(u.id);
    }
    for (const ids of Object.values(groups)) ids.forEach((id, i) => { m[id] = i + 1; });
    return m;
  }, [fullPool]);
  const posTotalMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of fullPool) m[u.unitType] = (m[u.unitType] ?? 0) + 1;
    return m;
  }, [fullPool]);

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
    const scheduledAt    = league?.settings?.draft_scheduled_at ? new Date(league.settings.draft_scheduled_at) : null;
    const oneHourBefore  = scheduledAt ? new Date(scheduledAt.getTime() - 60 * 60 * 1000) : null;
    const draftRoomOpen  = !scheduledAt || new Date() >= oneHourBefore! || league?.status === 'drafting';

    if (!draftRoomOpen && scheduledAt && oneHourBefore) {
      return (
        <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald', sans-serif", color: C.text }}>
          <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 48, width: 440, maxWidth: '90vw', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🏟️</div>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: 2, color: C.text, marginBottom: 8 }}>
              Draft Room Opens Soon
            </div>
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 20, letterSpacing: 0.5 }}>
              Draft scheduled for {scheduledAt.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: 0.5 }}>
              Draft room opens 1 hour before: {oneHourBefore.toLocaleString()}
            </div>
            <CountdownTimer targetDate={oneHourBefore} />
            <button
              onClick={() => goBack(leagueId, router)}
              style={{ marginTop: 28, padding: '10px 24px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 1, color: C.muted }}
            >← Back to League</button>
          </div>
        </div>
      );
    }

    const cpuTeamNames   = (league?.settings?.cpu_teams as string[]) ?? [];
    const totalOccupied  = members.length + cpuTeamNames.length;
    const leagueIsFull   = totalOccupied >= (league?.league_size ?? 999);
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
              {league?.draft_type === 'salary'
                ? `💰 Salary cap · $${SALARY_BUDGET} budget · ${TOTAL_ROUNDS} picks`
                : `🐍 Snake draft · ${TOTAL_ROUNDS} rounds · order randomized on start`}
            </div>
            {scheduledAt && (
              <div style={{ marginTop: 8, fontSize: 11, color: C.gold, letterSpacing: 0.5 }}>
                📅 Draft scheduled for {scheduledAt.toLocaleString()}
              </div>
            )}
          </div>

          {isCommissioner ? (
            <button
              onClick={startDraft}
              disabled={!leagueIsFull}
              title={!leagueIsFull ? `Waiting for ${(league?.league_size ?? 0) - members.length} more members` : ''}
              style={{ width: '100%', padding: '14px 20px', background: leagueIsFull ? `linear-gradient(135deg, ${C.gold}, ${C.goldLight})` : C.surf3, border: 'none', borderRadius: 8, cursor: leagueIsFull ? 'pointer' : 'not-allowed', fontFamily: "'Anton', sans-serif", fontSize: 15, letterSpacing: 2, color: leagueIsFull ? C.bg : C.muted }}
            >
              {leagueIsFull ? '🏈 START DRAFT' : `Waiting for members (${members.length}/${league?.league_size})`}
            </button>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, letterSpacing: 1, padding: '14px 0' }}>
              Waiting for commissioner to start the draft...
            </div>
          )}

          <button
            onClick={() => goBack(leagueId, router)}
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
            <button onClick={() => goBack(leagueId, router)} style={{ padding: '10px 22px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.sub, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 2 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, overflow: 'hidden', fontFamily: "'Oswald', sans-serif", color: C.text }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${C.surf}; }
        ::-webkit-scrollbar-thumb { background: ${C.surf3}; border-radius: 2px; }
        .pick-row:hover { background: ${C.surf2} !important; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        @keyframes goldPulse { 0%,100% { outline-color: ${C.gold}88; } 50% { outline-color: ${C.gold}ff; } }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ padding: '10px 16px', background: C.surf, borderBottom: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => goBack(leagueId, router)} style={{ background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '5px 10px', color: C.muted, cursor: 'pointer', fontSize: 11, letterSpacing: 1, fontFamily: "'Oswald', sans-serif" }}>← EXIT</button>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 15, letterSpacing: 2, color: C.gold }}>{league?.name?.toUpperCase()} · DRAFT</div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1 }}>R{round + 1} · P{pickInRound}/{numTeams}</div>
          <div style={{ fontSize: 11, letterSpacing: 1, color: isCpuTurn ? C.blue : isMyTurn ? C.gold : C.muted }}>
            {isCpuTurn ? `${onClockTeam?.teamName} (CPU) picking…` : isMyTurn ? '⚡ YOUR PICK' : `${onClockTeam?.teamName ?? '…'} picking…`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isSalaryDraft && (
            <span style={{ fontSize: 11, color: myBudgetLeft < 20 ? C.red : C.gold, fontFamily: "'Anton', sans-serif", letterSpacing: 1 }}>${myBudgetLeft}<span style={{ color: C.muted, fontSize: 9 }}>/200</span></span>
          )}
          {!isCpuTurn && (
            <div style={{ position: 'relative', width: 38, height: 38 }}>
              <svg width="38" height="38" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="19" cy="19" r="15" fill="none" stroke={C.surf3} strokeWidth="3" />
                <circle cx="19" cy="19" r="15" fill="none" stroke={isMyTurn ? C.gold : C.muted} strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 15}`}
                  strokeDashoffset={`${2 * Math.PI * 15 * (1 - timerPct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Anton', sans-serif", fontSize: 12, color: isMyTurn ? C.gold : C.muted }}>{timer}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Draft Board — full width, auto-fit columns ───────────── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.surf2, position: 'sticky', top: 0, zIndex: 10 }}>
              <th style={{ width: 32, padding: '7px 8px', color: C.muted, fontWeight: 400, letterSpacing: 1, textAlign: 'center', borderRight: `1px solid ${C.surf3}` }}>R</th>
              {allTeams.map((t, i) => {
                const isMe = t.userId === userId;
                return (
                  <th key={i} style={{
                    padding: '7px 4px', textAlign: 'center',
                    borderRight: `1px solid ${C.surf3}`,
                    borderBottom: isMe ? `2px solid ${C.gold}` : `1px solid ${C.surf3}`,
                    background: isMe ? `${C.gold}0a` : 'transparent',
                    color: t.type === 'cpu' ? C.blue : isMe ? C.gold : C.sub,
                    fontWeight: isMe ? 700 : 400,
                    fontSize: 10, letterSpacing: .3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.teamName.length > 12 ? t.teamName.slice(0, 11) + '…' : t.teamName}
                    {isMe && <span style={{ color: C.gold }}> ★</span>}
                    {t.type === 'cpu' && <span style={{ color: C.blue, fontSize: 8 }}> CPU</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: TOTAL_ROUNDS }).map((_, r) => (
              <tr key={r} style={{ borderBottom: `1px solid ${C.surf3}22` }}>
                <td style={{ padding: '4px 6px', color: C.muted, borderRight: `1px solid ${C.surf3}`, fontFamily: "'Anton', sans-serif", fontSize: 11, textAlign: 'center' }}>{r + 1}</td>
                {Array.from({ length: numTeams }).map((_, col) => {
                  const pickNum  = r % 2 === 0 ? r * numTeams + col : r * numTeams + (numTeams - 1 - col);
                  const pick     = picks.find(p => p.pick_number === pickNum);
                  const isActive = pickNum === currentPickNum;
                  const colTeam  = allTeams[col];
                  const isOwn    = colTeam?.userId === userId;
                  const isCpuCol = colTeam?.type === 'cpu';
                  const posColor  = POS_COLORS[pick?.player_data?.unitType as UnitType] ?? C.muted;
                  const pickLogo  = pick ? logos[pick.player_data?.school] : null;
                  return (
                    <td key={col} style={{
                      padding: '3px 4px',
                      borderRight: `1px solid ${C.surf3}22`,
                      background: isActive
                        ? (isCpuCol ? 'rgba(58,130,246,.1)' : `${C.gold}12`)
                        : isOwn ? `${C.gold}06` : 'transparent',
                      outline: isActive && !isCpuCol ? `1px solid ${C.gold}88` : 'none',
                      outlineOffset: '-1px',
                      animation: isActive && !isCpuCol ? 'goldPulse 1.2s ease-in-out infinite' : undefined,
                    }}>
                      {pick ? (
                        <div style={{ padding: '3px 5px', borderRadius: 3, background: `${posColor}${isOwn ? '28' : '12'}`, borderLeft: `2px solid ${posColor}` }}>
                          <div style={{ fontSize: 8, letterSpacing: .5, color: posColor, lineHeight: 1.2 }}>{pick.player_data?.unitType}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            {pickLogo && <img src={pickLogo} alt="" style={{ width: 10, height: 10, objectFit: 'contain', flexShrink: 0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                            <span style={{ fontSize: 10, fontWeight: isOwn ? 700 : 400, color: isOwn ? C.text : C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {(pick.player_data?.school ?? '').length > 9 ? pick.player_data.school.slice(0, 9) + '…' : pick.player_data?.school}
                            </span>
                          </div>
                        </div>
                      ) : isActive ? (
                        <div style={{ padding: '3px 5px', color: isCpuCol ? C.blue : C.gold, fontSize: 9, letterSpacing: .5, animation: 'pulse 1.5s infinite' }}>
                          {isCpuCol ? 'CPU…' : '⚡ PICK'}
                        </div>
                      ) : (
                        <div style={{ padding: '3px 5px', color: C.surf3, fontSize: 9 }}>—</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── My Roster strip ─────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '5px 14px', background: C.surf2, borderTop: `1px solid ${C.surf3}`, display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, marginRight: 4, textTransform: 'uppercase' }}>Roster</span>
        {(Object.keys(POS_COLORS) as UnitType[]).map(pos => (
          <div key={pos} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: myRoster[pos] > 0 ? `${POS_COLORS[pos]}22` : C.surf, color: myRoster[pos] > 0 ? POS_COLORS[pos] : C.muted, border: `1px solid ${myRoster[pos] > 0 ? POS_COLORS[pos] + '44' : C.surf3}` }}>
            {pos} {myRoster[pos] ?? 0}
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: C.muted }}>{mySlotPicks.length}/{TOTAL_ROUNDS} picked</span>
      </div>

      {/* ── Collapsible Pool Panel ───────────────────────────────── */}
      <div style={{ flexShrink: 0, height: poolOpen ? '40vh' : 40, transition: 'height .2s ease', display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.surf3}`, background: C.surf, minHeight: 0, overflow: 'hidden' }}>

        {/* Panel header / toggle */}
        <div
          onClick={() => setPoolOpen(o => !o)}
          style={{ flexShrink: 0, height: 40, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: poolOpen ? `1px solid ${C.surf3}` : 'none', background: C.surf2, userSelect: 'none' }}
        >
          <span style={{ fontSize: 10, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase' as const }}>Available Players</span>
          {(isCpuTurn || cpuPicking) && (
            <span style={{ fontSize: 10, color: C.blue, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.blue, animation: 'pulse 0.8s ease-in-out infinite' }} />
              {onClockTeam?.teamName} (CPU) picking…
            </span>
          )}
          {isMyTurn && !isCpuTurn && (
            <span style={{ fontSize: 10, color: C.gold, fontWeight: 700 }}>⚡ Your pick</span>
          )}
          {/* pos filters */}
          {poolOpen && (
            <div style={{ display: 'flex', gap: 5, marginLeft: 8 }} onClick={e => e.stopPropagation()}>
              {(['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF', 'K'] as const).map(pos => (
                <button key={pos} onClick={() => setFilter(pos)} style={{
                  padding: '3px 8px', borderRadius: 3, border: 'none', cursor: 'pointer',
                  fontSize: 9, letterSpacing: .5, fontFamily: "'Oswald', sans-serif",
                  background: filter === pos ? (pos === 'ALL' ? C.gold : POS_COLORS[pos as UnitType]) : C.surf3,
                  color: filter === pos ? C.bg : C.sub,
                }}>{pos}</button>
              ))}
            </div>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 14, color: C.muted, lineHeight: 1 }}>{poolOpen ? '▼' : '▲'}</span>
        </div>

        {/* Player list */}
        {poolOpen && (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {filtered.slice(0, 100).map((unit) => {
              const unitPrice  = isSalaryDraft ? positionRankPrice(unit, fullPool, isConference) : null;
              const overBudget = isSalaryDraft && (unitPrice ?? 0) > myBudgetLeft;
              const canPick    = isMyTurn && !draftDone && !overBudget;
              const posRank    = posRankMap[unit.id] ?? 0;
              const posTotal   = posTotalMap[unit.unitType] ?? 1;
              const rankBarPct = posRank > 0 ? Math.max(0, 1 - (posRank - 1) / Math.max(posTotal - 1, 1)) : 0;
              const posColor   = POS_COLORS[unit.unitType];
              const tierBg     = unit.tier === 'Elite'
                ? `rgba(212,168,40,.07)` : unit.tier === 'Solid'
                ? `rgba(58,130,246,.04)` : 'transparent';
              const logo       = logos[unit.school];
              const isSelected = viewingUnit?.id === unit.id;
              return (
                <div
                  key={unit.id}
                  className="pick-row"
                  onClick={() => setViewingUnit(unit)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 22px 1fr 50px 36px',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 10px',
                    borderBottom: `1px solid ${C.surf3}22`,
                    opacity: overBudget ? 0.35 : 1,
                    cursor: 'pointer',
                    background: isSelected ? C.surf2 : tierBg,
                    transition: 'transform .1s, background .1s',
                  }}
                >
                  {/* POS badge */}
                  <div style={{ width: 28, height: 20, borderRadius: 4, background: `${posColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: posColor, fontWeight: 700, letterSpacing: .5, flexShrink: 0 }}>{unit.unitType}</div>

                  {/* Logo */}
                  <div style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {logo
                      ? <img src={logo} alt={unit.school} style={{ width: 20, height: 20, objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      : <div style={{ width: 18, height: 18, borderRadius: '50%', background: `${posColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: posColor, fontWeight: 700 }}>{unit.school.slice(0, 2).toUpperCase()}</div>
                    }
                  </div>

                  {/* Info: name + rank bar + NIL */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
                      {unit.school}
                      {unit.playerName ? <span style={{ color: C.sub, fontWeight: 400 }}> · {unit.playerName}</span> : null}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      {posRank > 0 && (
                        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 8, color: posColor, letterSpacing: .5, flexShrink: 0 }}>#{posRank} {unit.unitType}</span>
                      )}
                      <div style={{ flex: 1, height: 2, background: C.surf3, borderRadius: 1, overflow: 'hidden', minWidth: 20 }}>
                        <div style={{ height: '100%', width: `${rankBarPct * 100}%`, background: unit.tier === 'Elite' ? C.gold : unit.tier === 'Solid' ? '#3b82f6' : C.muted, borderRadius: 1 }} />
                      </div>
                      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 8, color: C.muted, letterSpacing: .3, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {nilEstimate(unit.tier, posRank, posTotal)}
                      </span>
                    </div>
                    {isSalaryDraft && unitPrice != null && (
                      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 8, color: overBudget ? C.red : C.gold, marginTop: 1 }}>${unitPrice}</div>
                    )}
                  </div>

                  {/* Projected */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, color: C.gold, lineHeight: 1 }}>
                      {(unit.avgFpts ?? unit.avgPerWeek ?? 0) > 0 ? (unit.avgFpts ?? unit.avgPerWeek ?? 0).toFixed(1) : '—'}
                    </div>
                    <div style={{ fontSize: 7, color: C.muted, letterSpacing: .5 }}>PROJ</div>
                  </div>

                  {/* Draft button */}
                  <button
                    onClick={e => { e.stopPropagation(); if (canPick) insertPick(unit); }}
                    disabled={!canPick}
                    style={{
                      padding: '5px 6px', borderRadius: 4, flexShrink: 0,
                      border: canPick ? `1px solid ${C.gold}88` : `1px solid ${C.surf3}`,
                      background: canPick ? `${C.gold}18` : 'transparent',
                      color: canPick ? C.gold : C.surf3,
                      fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 1,
                      cursor: canPick ? 'pointer' : 'default',
                      transition: 'background .12s',
                    }}
                  >+</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Unit Stats Panel (overlay) ───────────────────────────── */}
      {viewingUnit && (() => {
        const S = { passYd: 0.05, passTd: 4, int: -2, rushYd: 0.05, rushTd: 6, recYd: 0.05, recTd: 6 };
        const ut = viewingUnit.unitType;
        const price        = isSalaryDraft ? positionRankPrice(viewingUnit, fullPool, isConference) : null;
        const canPickPanel = isMyTurn && !draftDone
          && (!isSalaryDraft || (price ?? 0) <= myBudgetLeft);
        const weeks: any[] = unitStats?.weeks ?? [];
        const completedWeeks = weeks.filter(w => w.completed);
        const seasonTotal = completedWeeks.reduce((s: number, w: any) => s + (w.fantasyPoints ?? 0), 0);

        // Aggregate named player season totals for Top Contributors
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
                      onClick={() => { if (canPickPanel) { insertPick(viewingUnit); setViewingUnit(null); } }}
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
    </div>
  );
}
