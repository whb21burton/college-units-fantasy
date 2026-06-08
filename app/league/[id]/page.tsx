'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import type { DraftUnit } from '@/lib/playerPool';
import DraftOrderEditor from '@/components/league/DraftOrderEditor';
import { useWallet } from '@/context/WalletContext';
import UnitExpansion from '@/components/UnitExpansion';
function odrLabelFromMult(m: number) { return m >= 1.15 ? 'Elite' : m >= 1.05 ? 'Good' : m >= 0.95 ? 'Avg' : m >= 0.85 ? 'Weak' : 'Poor' }
function getODRColor(m: number) { return m >= 1.15 ? '#15c678' : m >= 1.05 ? '#7fc97f' : m >= 0.95 ? '#f5a623' : m >= 0.85 ? '#f08030' : '#f03a5a' }

type SettingsSection = 'league' | 'team' | 'roster' | 'draft' | 'danger';

const C = {
  bg:    '#070a12',   // deep navy-black
  surf:  '#0c1422',   // card surface
  surf2: '#111d30',   // elevated card
  surf3: '#1a2b40',   // border / divider
  gold:  '#f5a623',   // vibrant amber gold
  text:  '#e4edf7',   // crisp blue-white
  sub:   '#7a92aa',   // steel secondary
  muted: '#3e5470',   // placeholder / muted
  green: '#15c678',   // emerald green
  red:   '#f03a5a',   // rose red
};

const SEASON_GAMES = 14;
function weeklyProj(seasonPts: number): number {
  return seasonPts / SEASON_GAMES;
}

function poolUrl(unitType: string, allowedSchools?: string[] | null): string {
  const params = new URLSearchParams();
  if (unitType !== 'ALL') params.set('unitType', unitType);
  if (allowedSchools && Array.isArray(allowedSchools) && allowedSchools.length > 0) {
    params.set('schools', allowedSchools.join(','));
  }
  const qs = params.toString();
  return `/api/player-pool${qs ? '?' + qs : ''}`;
}

type MatchupCtx = {
  opponentMap: Record<string, string>;
  rankMap:     Record<string, number>; // Elo rank (display only)
  multMap:     Record<string, number>; // stored game_mult from cached_stats
  defRankMap:  Record<string, number>; // SP+ defensive rank (1 = best defense)
  offRankMap:  Record<string, number>; // SP+ offensive rank (1 = best offense)
} | null;

/**
 * Convert an SP+ rank to a projection multiplier.
 * Used for both ODR (opponent's defensive rank → offensive units)
 * and OOR (opponent's offensive rank → DEF unit).
 */
function rankMult(rank: number): number {
  if (rank <=   5) return 1.3;
  if (rank <=  10) return 1.2;
  if (rank <=  15) return 1.1;
  if (rank <=  25) return 1.0;
  if (rank <=  35) return 0.9;
  if (rank <=  50) return 0.8;
  if (rank <=  80) return 0.7;
  if (rank <= 100) return 0.6;
  return 0.5;
}

/**
 * Weekly projection with ODR/OOR multiplier applied.
 *
 * ODR (Opponent Defensive Rank) → applied to QB, RB, WR, TE, K
 *   Higher opponent def rank = weaker defense = easier matchup (higher mult)
 * OOR (Opponent Offensive Rank) → applied to DEF only
 *   Higher opponent off rank = weaker offense = easier matchup for defense (higher mult)
 *
 * Formula:
 *   QB/RB/WR/TE/K: finalProjection = base × odrMult(opponent defRank)
 *   DEF:           finalProjection = base × oorMult(opponent offRank)
 */
function matchupProj(
  avgPerWeek: number, school: string, unitType: string, ctx: MatchupCtx
): { pts: number; mult: number; opponent: string | null } {
  const opponent = ctx?.opponentMap[school] ?? null;
  if (!opponent || !ctx) return { pts: avgPerWeek, mult: 1.0, opponent };

  // Use upcoming opponent's defensive rank for skill units, offensive rank for DEF
  const rank = unitType === 'DEF'
    ? (ctx.offRankMap[opponent] ?? 999)
    : (ctx.defRankMap[opponent] ?? 999);
  const mult = rankMult(rank);
  return { pts: avgPerWeek * mult, mult, opponent };
}

/** Higher multiplier = harder opponent (rank 1 defense/offense is toughest). */
function multLabel(mult: number): { label: string; color: string } {
  return { label: odrLabelFromMult(mult), color: getODRColor(mult) };
}

/** Ranks all schools per unit type by projectedPoints desc (rank 1 = best). */
function buildUnitRankMaps(picks: any[]): Record<string, Record<string, number>> {
  const byType: Record<string, { school: string; pts: number }[]> = {};
  for (const p of picks) {
    const school = p.player_data?.school;
    const ut     = p.player_data?.unitType;
    const pts    = p.player_data?.projectedPoints ?? 0;
    if (!school || !ut) continue;
    if (!byType[ut]) byType[ut] = [];
    byType[ut].push({ school, pts });
  }
  const maps: Record<string, Record<string, number>> = {};
  for (const [ut, units] of Object.entries(byType)) {
    const sorted = [...units].sort((a, b) => b.pts - a.pts);
    maps[ut] = {};
    sorted.forEach(({ school }, idx) => { maps[ut][school] = idx + 1; });
  }
  return maps;
}

/** Build global unit rank maps from player-pool API data (all schools, all unit types).
 *  Ranks by seasonTotal (actual cached_stats sum) so live teams rank above projection-only teams. */
function buildPoolRankMaps(pool: { school: string; unitType: string; projectedPoints: number; seasonTotal?: number }[]): Record<string, Record<string, number>> {
  const byType: Record<string, { school: string; pts: number }[]> = {};
  for (const p of pool) {
    if (!p.school || !p.unitType) continue;
    if (!byType[p.unitType]) byType[p.unitType] = [];
    byType[p.unitType].push({ school: p.school, pts: p.seasonTotal ?? 0 });
  }
  const maps: Record<string, Record<string, number>> = {};
  for (const [ut, units] of Object.entries(byType)) {
    const sorted = [...units].sort((a, b) => b.pts - a.pts);
    maps[ut] = {};
    sorted.forEach(({ school }, idx) => { maps[ut][school] = idx + 1; });
  }
  return maps;
}

/** School logo with fallback initials circle. */
function SchoolLogo({ school, posColor, logos, size = 32 }: { school: string; posColor: string; logos: Record<string, string>; size?: number }) {
  const url = logos[school];
  return url ? (
    <img src={url} alt={school} style={{ width: size, height: size, objectFit: 'contain' }}
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: posColor + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 10, color: posColor }}>
      {school.slice(0, 2).toUpperCase()}
    </div>
  );
}

/** Renders the 3-line player info block used in every roster/matchup row. */
function PlayerInfoLines({
  school, unitType, playerName, ctx, ep, align, seasonPts, unitRankMaps,
}: {
  school: string; unitType: string; playerName?: string;
  ctx: MatchupCtx; ep: { pts: number; isActual: boolean; base: number; storedMult: number | null };
  align?: 'left' | 'right';
  seasonPts?: number;
  unitRankMaps?: Record<string, Record<string, number>>;
}) {
  const opponent   = ctx?.opponentMap[school] ?? null;
  // School's rank within its own unit type; opponent's rank within DEF
  const schoolRank = unitRankMaps?.[unitType]?.[school] ?? null;
  const oppRank    = opponent ? (unitRankMaps?.['DEF']?.[opponent] ?? null) : null;

  const storedMult = ctx?.multMap?.[school] ?? null;
  const mult = storedMult ?? 1.0;
  const { label: diffLabel, color: diffColor } = multLabel(mult);

  // Team units show "School UnitType Unit"; QB/K show player name
  const name = playerName ? playerName : `${school} ${unitType} Unit`;

  // Line 2: show matchup if opponent found, BYE if no game this week, or just school
  // Format: "Georgia Tech (RB #4) vs Colorado (DEF #18)" — NR if no data
  const matchupLine = opponent
    ? `${school} (${unitType} ${schoolRank != null ? `#${schoolRank}` : 'NR'}) vs ${opponent} (DEF ${oppRank != null ? `#${oppRank}` : 'NR'})`
    : ctx && !opponent
      ? `${school} · BYE`
      : school;

  // Line 4: score breakdown
  // For completed games: use the stored multiplier from cached_stats so the
  // formula shown matches exactly how the score was computed by syncStats.
  // For projected games: use the live Elo mult.
  const displayMult  = ep.isActual && ep.storedMult != null ? ep.storedMult : mult;
  const breakdownLine = (!opponent)
    ? 'No game this week'
    : `${ep.base.toFixed(1)} × ${displayMult.toFixed(2)} = ${ep.pts.toFixed(1)}`;

  return (
    <div style={{ minWidth: 0, textAlign: align === 'right' ? 'right' : 'left' }}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: C.text, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{name}</div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.sub, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: 1 }}>{matchupLine}</div>
      <div className="mob-info-line" style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, color: diffColor, letterSpacing: .3, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {diffLabel} · {breakdownLine}
      </div>
    </div>
  );
}

type GameStats = {
  completedSchools: string[];
  schoolPoints: Record<string, Partial<Record<string, number>>>;
  schoolMults:  Record<string, number>;
} | null;

/**
 * Returns pts for the unit this week.
 *
 * Source of truth: gs.schoolPoints[school][unitType] from cached_stats.
 * If a stored score exists → game is completed → use it directly.
 * If no stored score → game not yet played → fall back to projection.
 *
 * Does NOT use completedSchools (from cached_scores) as a gate —
 * cached_scores and cached_stats can be out of sync, causing the matchup
 * to show projections even when a real score is stored.
 */
function effectivePts(
  school: string, unitType: string, seasonPts: number,
  ctx: MatchupCtx, gs: GameStats
): { pts: number; isActual: boolean; base: number; storedMult: number | null } {
  const opponent = ctx?.opponentMap[school] ?? null;
  // BYE week — no game, no points
  if (ctx && !opponent) return { pts: 0, isActual: false, base: 0, storedMult: null };

  // Check cached_stats for a stored actual score (same source as game log)
  const storedPts  = gs?.schoolPoints?.[school]?.[unitType];
  const storedMult = gs?.schoolMults?.[school] ?? null;
  if (storedPts != null) {
    const rawBase = storedMult && storedMult > 0 ? storedPts / storedMult : storedPts;
    return { pts: storedPts, isActual: true, base: rawBase, storedMult };
  }

  // Game is completed but no cached_stats row yet — show 0, never projection
  if (gs?.completedSchools?.includes(school)) {
    return { pts: 0, isActual: true, base: 0, storedMult: null };
  }

  // Game not yet played — use stored game_mult (null = no data → neutral 1.0)
  const mult = ctx?.multMap?.[school] ?? 1.0;
  const base         = weeklyProj(seasonPts);
  return { pts: base * mult, isActual: false, base, storedMult: null };
}

type Tab = 'draft' | 'matchup' | 'team' | 'league' | 'players' | 'trade' | 'ranks' | 'lineup' | 'leaderboard' | 'chat';

const TABS: { key: Tab; label: string }[] = [
  { key: 'draft',   label: 'Draft'    },
  { key: 'team',    label: 'Team'     },
  { key: 'league',  label: 'League'   },
  { key: 'players', label: 'Players'  },
  { key: 'trade',   label: 'Trade'    },
  { key: 'ranks',   label: 'Ranks'    },
];

const WEEKLY_TABS: { key: Tab; label: string }[] = [
  { key: 'lineup',      label: 'Lineup'      },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'chat',        label: 'Chat'        },
];

export default function LeaguePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { balance: walletBalance, refresh: refreshWallet } = useWallet();
  const isEmbed = searchParams.get('embed') === '1';
  const [league,       setLeague]       = useState<any>(null);
  const [members,      setMembers]      = useState<any[]>([]);
  const [userId,       setUserId]       = useState<string | null>(null);
  const [userEmail,    setUserEmail]    = useState('');
  const [loading,      setLoading]      = useState(true);
  const [copied,       setCopied]       = useState(false);
  const [activeTab,    setActiveTab]    = useState<Tab>('draft');
  const [showSettings,  setShowSettings]  = useState(false);
  const [chatMessages,  setChatMessages]  = useState<any[]>([]);
  const [chatInput,     setChatInput]     = useState('');
  const [kickTarget,    setKickTarget]    = useState<{ userId: string; teamName: string } | null>(null);
  const [kickRefund,    setKickRefund]    = useState(true);
  const chatEndRef        = useRef<HTMLDivElement>(null);
  const chatInitialMount  = useRef(true);
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  async function loadData(uid?: string) {
    const resolvedUid = uid ?? userId;

    const { data: leagueData } = await supabase
      .from('leagues').select('*').eq('id', params.id).single();
    if (!leagueData) { if (!isEmbed) router.push('/'); return; }
    setLeague(leagueData);

    const { data: membersData } = await supabase
      .from('league_members').select('*').eq('league_id', params.id)
      .order('draft_slot', { ascending: true });
    setMembers(membersData || []);

    const { data: msgs } = await supabase
      .from('league_messages').select('*').eq('league_id', params.id)
      .order('created_at', { ascending: true }).limit(100);
    setChatMessages(msgs || []);
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!isEmbed) router.push('/'); return; }
      setUserId(user.id);
      setUserEmail(user.email || '');
      await loadData(user.id);
      setLoading(false);
    }
    init();

    const membersCh = supabase.channel('members-' + params.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_members', filter: 'league_id=eq.' + params.id }, () => loadData())
      .subscribe();

    const chatCh = supabase.channel('chat-' + params.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'league_messages', filter: 'league_id=eq.' + params.id }, (payload) => {
        setChatMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    // Refresh member list when user switches back to this tab (handles realtime lag)
    const handleVisibility = () => { if (!document.hidden) loadData(); };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      supabase.removeChannel(membersCh);
      supabase.removeChannel(chatCh);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Force scroll to top on mount — prevents iframe from starting scrolled to bottom
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'SCROLL_TOP' }, '*');
    }
  }, []);

  useEffect(() => {
    if (chatInitialMount.current) { chatInitialMount.current = false; return; }
    // scrollIntoView removed — caused iframe to scroll to bottom on load
  }, [chatMessages]);

  // Embed guard: if somehow the homepage loads inside the iframe, push parent to my-leagues
  useEffect(() => {
    if (!isEmbed) return;
    if (window.location.pathname === '/') {
      window.parent.postMessage({ type: 'NAVIGATE', path: '/my-leagues' }, '*');
    }
  }, [isEmbed]);

  // Auto-switch tabs based on league type / status
  useEffect(() => {
    if (league?.league_type === 'weekly') {
      setActiveTab('lineup');
      window.scrollTo(0, 0);
      if (window.parent !== window) window.parent.postMessage({ type: 'SCROLL_TOP' }, '*');
    } else if (league?.status === 'active' && activeTab === 'draft') {
      setActiveTab('matchup');
      window.scrollTo(0, 0);
      if (window.parent !== window) window.parent.postMessage({ type: 'SCROLL_TOP' }, '*');
    }
  }, [league?.league_type, league?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCommissioner = userId === league?.commissioner_id;
  const myMember       = members.find((m: any) => m.user_id === userId);
  const cpuTeams       = (league?.settings?.cpu_teams as string[]) ?? [];
  const totalOccupied  = members.length + cpuTeams.length;
  const spotsLeft      = (league?.league_size || 0) - totalOccupied;
  const isFull         = spotsLeft <= 0;

  const isWeekly = league?.league_type === 'weekly';

  // Replace Draft tab with Matchup tab once league is active (season leagues only)
  const computedTabs = isWeekly
    ? WEEKLY_TABS
    : TABS.map(t =>
        t.key === 'draft' && league?.status === 'active'
          ? { key: 'matchup' as Tab, label: 'Matchup' }
          : t
      );
  const inviteUrl      = league ? appUrl + '/join/' + league.invite_code : '';

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function sendChat() {
    if (!chatInput.trim() || !userId) return;
    const msg = chatInput.trim();
    setChatInput('');
    await supabase.from('league_messages').insert({
      league_id: params.id,
      user_id:   userId,
      message:   msg,
      team_name: myMember?.team_name || userEmail.split('@')[0],
    });
  }

  async function addCpu() {
    if (!isCommissioner || isFull || !league) return;
    const existing = (league.settings?.cpu_teams as string[]) ?? [];
    const newName  = `CPU Bot ${existing.length + 1}`;
    const updated  = [...existing, newName];
    await supabase.from('leagues')
      .update({ settings: { ...league.settings, cpu_teams: updated } })
      .eq('id', league.id);
    setLeague((prev: any) => ({ ...prev, settings: { ...(prev.settings ?? {}), cpu_teams: updated } }));
  }

  async function removeCpu(index: number) {
    if (!isCommissioner || !league) return;
    const existing = (league.settings?.cpu_teams as string[]) ?? [];
    const updated  = existing.filter((_: string, i: number) => i !== index);
    await supabase.from('leagues')
      .update({ settings: { ...league.settings, cpu_teams: updated } })
      .eq('id', league.id);
    setLeague((prev: any) => ({ ...prev, settings: { ...(prev.settings ?? {}), cpu_teams: updated } }));
  }

  async function startDraft() {
    if (!isCommissioner || !league) return;
    const isAdmin = userEmail === 'whb21burton@gmail.com';
    if (members.length < 1) { alert('Need at least 1 manager to start the draft.'); return; }

    // Auto-fill any empty slots with CPU teams before navigating
    const existingCpus = (league.settings?.cpu_teams as string[]) ?? [];
    const totalFilled  = members.length + existingCpus.length;
    const leagueSize   = league.league_size ?? 8;
    const slotsToFill  = Math.max(0, leagueSize - totalFilled);

    if (slotsToFill > 0) {
      const newCpus = Array.from({ length: slotsToFill }, (_, i) =>
        `CPU Team ${existingCpus.length + i + 1}`
      );
      await supabase.from('leagues')
        .update({ settings: { ...league.settings, cpu_teams: [...existingCpus, ...newCpus] } })
        .eq('id', league.id);
    }

    router.push(`/league/${params.id}/draft${isEmbed ? '?embed=1' : ''}`);
  }

  async function resetDraft() {
    if (!isCommissioner || !league) return;
    if (!confirm('Delete all draft picks and reset the league to pre-draft? This cannot be undone.')) return;
    await supabase.from('draft_picks').delete().eq('league_id', league.id);
    await supabase.from('leagues').update({ status: 'forming' }).eq('id', league.id);
    await loadData();
  }

  async function deleteLeague() {
    if (!isCommissioner || !league) return;
    if (!confirm(`Delete "${league.name}" permanently? This cannot be undone.`)) return;
    const res = await fetch(`/api/leagues/${league.id}`, { method: 'DELETE' });
    if (res.ok) router.push('/my-leagues');
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? 'Failed to delete league.');
    }
  }

  async function handleKickMember(memberId: string, refund: boolean) {
    if (!league) return;
    const res = await fetch(`/api/leagues/${league.id}/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, refundEntry: refund }),
    });
    const data = await res.json();
    if (res.ok) {
      setMembers((prev: any[]) => prev.filter((m: any) => m.user_id !== memberId));
      alert(refund ? 'Member kicked and refunded.' : 'Member kicked.');
    } else {
      alert('Error: ' + data.error);
    }
  }

  if (loading) return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 3, fontSize: 13 }}>Loading league...</div>
    </div>
  );

  return (
    <div className="layout-root" style={{ display: 'flex', height: '100vh', maxHeight: '100vh', background: C.bg, overflow: 'hidden' }}>

      {showSettings && (
        <LeagueSettingsModal
          league={league}
          myMember={myMember}
          members={members}
          isCommissioner={isCommissioner}
          userId={userId}
          onClose={() => setShowSettings(false)}
          onUpdate={() => loadData()}
        />
      )}

      {/* ── Kick Member Modal ──────────────────────────────────────── */}
      {kickTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, padding: 28, maxWidth: 400, width: '100%' }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
              Kick {kickTarget.teamName}?
            </div>
            {(league?.buy_in ?? 0) > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, marginBottom: 10 }}>
                  Refund their entry fee (${(league?.buy_in ?? 0).toFixed(2)})?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setKickRefund(true)} style={{ flex: 1, padding: 10, border: `2px solid ${kickRefund ? C.green : C.surf3}`, borderRadius: 8, cursor: 'pointer', background: kickRefund ? 'rgba(21,198,120,.1)' : C.surf2, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: kickRefund ? C.green : C.sub }}>
                    ✓ Yes, refund
                  </button>
                  <button onClick={() => setKickRefund(false)} style={{ flex: 1, padding: 10, border: `2px solid ${!kickRefund ? C.red : C.surf3}`, borderRadius: 8, cursor: 'pointer', background: !kickRefund ? 'rgba(240,58,90,.1)' : C.surf2, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: !kickRefund ? C.red : C.sub }}>
                    ✗ No refund
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => { setKickTarget(null); setKickRefund(true); }} style={{ flex: 1, padding: 12, background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub }}>
                Cancel
              </button>
              <button onClick={() => { handleKickMember(kickTarget.userId, kickRefund); setKickTarget(null); }} style={{ flex: 1, padding: 12, background: 'rgba(240,58,90,.2)', border: '1px solid rgba(240,58,90,.5)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1, color: C.red }}>
                Kick
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* ← My Leagues back button (hidden when embedded) */}
        {!isEmbed && (
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button
              onClick={() => router.push('/my-leagues')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            >← My Leagues</button>
            <span style={{ color: C.surf3 }}>|</span>
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 1, textTransform: 'uppercase' }}>
              {league?.name}
            </span>
          </div>
        )}

        {/* League header + tabs */}
        <div style={{ background: 'linear-gradient(180deg, #0d1827 0%, #0c1422 100%)', borderBottom: '1px solid ' + C.surf3, flexShrink: 0 }}>
          <div className="mob-header-pad" style={{ padding: '16px 24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: 0.3, color: C.text, textTransform: 'uppercase', margin: 0 }}>{league?.name}</h1>
              <span style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 1.5,
                color: C.gold, background: 'rgba(245,166,35,.12)', border: '1px solid rgba(245,166,35,.28)',
                padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase',
              }}>
                {(league?.status || 'FORMING')}
              </span>
              {league?.league_type !== 'weekly' && league?.league_type !== 'dfs' && (
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: isFull ? C.gold : C.sub }}>
                  {totalOccupied}/{league?.league_size} · {isFull ? 'Full' : spotsLeft + ' open'}
                </span>
              )}
            </div>
            <div className="mob-scroll-x" style={{ display: 'flex', gap: 2 }}>
              {computedTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '7px 16px', border: 'none', cursor: 'pointer', borderRadius: '6px 6px 0 0',
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
                    color: activeTab === tab.key ? C.gold : C.sub,
                    background: activeTab === tab.key ? 'rgba(245,166,35,.1)' : 'transparent',
                    borderBottom: activeTab === tab.key ? '2px solid ' + C.gold : '2px solid transparent',
                    marginBottom: -1, transition: 'color .15s, background .15s',
                  }}
                >{tab.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="mob-pad" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {activeTab === 'draft' && (
            <DraftTab
              league={league}
              members={members}
              userId={userId}
              userEmail={userEmail}
              spotsLeft={spotsLeft}
              isFull={isFull}
              isCommissioner={isCommissioner}
              inviteUrl={inviteUrl}
              copied={copied}
              isEmbed={isEmbed}
              cpuTeams={cpuTeams}
              onCopy={copyLink}
              onStartDraft={startDraft}
              onMockDraft={() => router.push(`/league/${params.id}/mock-draft${isEmbed ? '?embed=1' : ''}`)}
              onAddCpu={addCpu}
              onRemoveCpu={removeCpu}
              onResetDraft={resetDraft}
              onDeleteLeague={deleteLeague}
              onRequestKick={(member) => { setKickRefund(true); setKickTarget(member); }}
            />
          )}
          {activeTab === 'matchup' && (
            <MatchupTab league={league} userId={userId} />
          )}
          {activeTab === 'team' && (
            <TeamTab league={league} userId={userId} />
          )}
          {activeTab === 'league' && (
            <LeagueTab league={league} userId={userId} />
          )}
          {activeTab === 'trade' && (
            <TradeTab league={league} userId={userId} members={members} />
          )}
          {activeTab === 'ranks' && (
            <LeagueRanksTab league={league} members={members} userId={userId} />
          )}
          {activeTab === 'players' && (
            <WaiverTab league={league} userId={userId} />
          )}
          {activeTab === 'lineup' && (
            <WeeklyLineupTab
              leagueId={params.id}
              router={router}
              userId={userId}
              league={league}
              walletBalance={walletBalance ?? 0}
              refreshWallet={refreshWallet ?? (() => {})}
            />
          )}
          {activeTab === 'leaderboard' && (
            <WeeklyLeaderboardTab leagueId={params.id} league={league} userId={userId} />
          )}
          {activeTab === 'chat' && (
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', background: C.surf, borderRadius: 12, border: '1px solid ' + C.surf3, overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {chatMessages.length === 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, opacity: .5 }}>
                      <div style={{ fontSize: 28 }}>💬</div>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>No messages yet.<br/>Start the conversation!</div>
                    </div>
                  )}
                  {chatMessages.map((msg: any, i: number) => {
                    const isMe = msg.user_id === userId;
                    return (
                      <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 3 }}>
                          {isMe ? 'You' : (msg.team_name || 'Unknown')}
                        </div>
                        <div style={{
                          maxWidth: '85%', padding: '8px 11px',
                          borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                          background: isMe ? 'rgba(212,168,40,.12)' : C.surf2,
                          border: isMe ? '1px solid rgba(212,168,40,.22)' : '1px solid ' + C.surf3,
                          fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text, lineHeight: 1.4,
                          wordBreak: 'break-word',
                        }}>
                          {msg.message}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                <div style={{ padding: '10px 14px', borderTop: '1px solid ' + C.surf3, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Message..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                      style={{ flex: 1, padding: '9px 11px', background: C.bg, border: '1px solid ' + C.surf3, borderRadius: 8, color: C.text, fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', minWidth: 0 }}
                    />
                    <button
                      onClick={sendChat}
                      disabled={!chatInput.trim()}
                      style={{ padding: '9px 13px', background: chatInput.trim() ? C.gold : C.surf3, border: 'none', borderRadius: 8, cursor: chatInput.trim() ? 'pointer' : 'default', fontFamily: 'Anton,sans-serif', fontSize: 14, color: chatInput.trim() ? C.bg : C.muted, transition: 'all .15s', flexShrink: 0 }}
                    >→</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const LINEUP_SLOTS = [
  { key: 'QB',   label: 'QB'   },
  { key: 'RB1',  label: 'RB'   },
  { key: 'RB2',  label: 'RB'   },
  { key: 'WR1',  label: 'WR'   },
  { key: 'WR2',  label: 'WR'   },
  { key: 'TE',   label: 'TE'   },
  { key: 'FLEX', label: 'FLEX' },
  { key: 'DEF',  label: 'DEF'  },
  { key: 'K',    label: 'K'    },
];

const LINEUP_POS_COLOR: Record<string, string> = {
  QB: '#e05c2a', RB: '#2a9d8f', WR: '#3a86ff',
  TE: '#8338ec', DEF: '#2b9348', K: '#e9c46a',
};

/* ── Weekly Lineup Tab ──────────────────────────────────────── */
function WeeklyLineupTab({ leagueId, router, userId, league, walletBalance, refreshWallet }: { leagueId: string; router: any; userId: string | null; league: any; walletBalance: number; refreshWallet: () => void }) {
  const [picks,          setPicks]          = useState<any[] | null>(null);
  const [firstGameTime,  setFirstGameTime]  = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [originalLineup, setOriginalLineup] = useState<any[] | null>(null);
  const [lineupSubmitted, setLineupSubmitted] = useState(false);
  const [showPool,           setShowPool]           = useState(false);
  const [myEntries,          setMyEntries]          = useState<any[]>([]);
  const [activeEntryNum,     setActiveEntryNum]     = useState(1);
  const [showAddEntryConfirm, setShowAddEntryConfirm] = useState(false);
  const [gameTimeMap,        setGameTimeMap]        = useState<Record<string, string>>({});
  const [teamLogos,          setTeamLogos]          = useState<Record<string, string>>({});
  const [scheduleMap,        setScheduleMap]        = useState<Record<string, {opp:string;date:string;time:string}>>({});
  const [expandedPick,       setExpandedPick]       = useState<string | null>(null);
  const maxPerAccount = league?.max_entries_per_user ?? 1;
  const buyInCents = Math.round((league?.buy_in ?? 0) * 100);

  const week = league?.week ?? 5;  // contest week — stored directly in league

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    async function load() {
      setLoading(true);
      const [picksRes, ctxRes, allEntriesRes] = await Promise.all([
        supabase
          .from('draft_picks')
          .select('*')
          .eq('league_id', leagueId)
          .eq('user_id', userId!)
          .eq('week', week)
          .eq('entry_type', 'lineup')
          .eq('entry_number', activeEntryNum),
        fetch(`/api/matchup-context?week=${week}&season=2025`)
          .then(r => r.json()).catch(() => ({})),
        supabase
          .from('draft_picks')
          .select('entry_number')
          .eq('league_id', leagueId)
          .eq('user_id', userId!)
          .eq('week', week)
          .eq('entry_type', 'lineup'),
      ]);
      const p = picksRes.data ?? [];
      setPicks(p);
      setOriginalLineup(p);
      setLineupSubmitted(p.length > 0);
      setFirstGameTime(ctxRes.firstGameTime ?? null);
      setGameTimeMap(ctxRes.gameTimeMap ?? {});

      // Fetch logos and schedule — non-blocking, don't let failures break main load
      try {
        const [logosRes, gamesRes] = await Promise.all([
          fetch('/api/team-logos'),
          fetch(`/api/games?week=${week}&season=2025`),
        ]);
        const logosData = logosRes.ok ? await logosRes.json() : [];
        const gamesData = gamesRes.ok ? await gamesRes.json() : [];
        // team-logos returns a plain object {school: url}
        setTeamLogos(typeof logosData === 'object' && !Array.isArray(logosData)
          ? logosData
          : {});
        const sched: Record<string, {opp:string;date:string;time:string}> = {};
        for (const g of gamesData ?? []) {
          const d = new Date(g.game_date);
          const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'America/New_York' });
          const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' });
          sched[g.home_team] = { opp: `vs ${g.away_team}`, date: dateStr, time: timeStr };
          sched[g.away_team] = { opp: `@ ${g.home_team}`, date: dateStr, time: timeStr };
        }
        setScheduleMap(sched);
      } catch (e) {
        console.error('Failed to load logos/schedule:', e);
      }

      // Build unique entry numbers
      const entryNums = Array.from(new Set((allEntriesRes.data ?? []).map((r: any) => r.entry_number ?? 1))) as number[];
      entryNums.sort((a, b) => a - b);
      if (entryNums.length === 0) entryNums.push(1);
      setMyEntries(entryNums.map(n => ({ entry_number: n })));
      setLoading(false);
    }
    load();
  }, [leagueId, userId, week, activeEntryNum]);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 2, fontSize: 12 }}>
      Loading lineup…
    </div>
  );

  async function handleAddEntry() {
    if (myEntries.length >= maxPerAccount) {
      alert(`Maximum ${maxPerAccount} entries per user.`);
      return;
    }
    if (buyInCents > 0) {
      if (walletBalance < buyInCents) {
        alert(`Not enough funds. Need $${(buyInCents / 100).toFixed(2)}, you have $${(walletBalance / 100).toFixed(2)}.`);
        return;
      }
      const payRes = await fetch('/api/wallet/bracket-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contestId: leagueId, buyInCents, entryNumber: myEntries.length + 1 }),
      });
      if (!payRes.ok) {
        const d = await payRes.json();
        alert(d.error ?? 'Payment failed');
        return;
      }
      refreshWallet();
    }
    const nextNum = myEntries.length + 1;
    setMyEntries(prev => [...prev, { entry_number: nextNum }]);
    setActiveEntryNum(nextNum);
    setPicks([]);
    setOriginalLineup([]);
    setLineupSubmitted(false);
    // Navigate directly to lineup builder for the new entry
    router.push(`/league/${leagueId}/lineup?entry=${nextNum}`);
  }

  // Lock only if ALL units in the current lineup have kicked off.
  // If firstGameTime exists but the user has no lineup yet, keep unlocked.
  const isLocked = false; // Per-unit lock is now enforced server-side in /api/lineup/submit and /api/players/drop-add
  const lineupChanged = originalLineup !== null && JSON.stringify(picks) !== JSON.stringify(originalLineup);

  const entryHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      {myEntries.map(e => (
        <button
          key={e.entry_number}
          onClick={() => {
            setActiveEntryNum(e.entry_number);
            setPicks(null);
            setLoading(true);
          }}
          style={{
            padding: '5px 14px',
            borderRadius: 20,
            border: '1px solid ' + (activeEntryNum === e.entry_number ? C.gold : C.surf3),
            background: activeEntryNum === e.entry_number ? 'rgba(245,166,35,.15)' : C.surf2,
            color: activeEntryNum === e.entry_number ? C.gold : C.sub,
            fontFamily: 'Oswald,sans-serif', fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
          }}
        >Entry {e.entry_number}</button>
      ))}
      {myEntries.length < maxPerAccount && (
        <button
          onClick={() => setShowAddEntryConfirm(true)}
          style={{
            padding: '5px 14px',
            borderRadius: 20,
            border: '1px solid rgba(21,198,120,.4)',
            background: 'rgba(21,198,120,.1)',
            color: C.green,
            fontFamily: 'Oswald,sans-serif', fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
          }}
        >+ Add Entry</button>
      )}
      <span style={{ marginLeft: 'auto', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
        {myEntries.length}/{maxPerAccount} entries
      </span>
    </div>
  );

  // No lineup submitted yet — show placeholder with CTA
  if (!lineupSubmitted || !picks || picks.length === 0) {
    return (
      <div style={{ maxWidth: 560 }}>
        {entryHeader}
        <button
          onClick={() => router.push(`/league/${leagueId}/lineup?entry=${activeEntryNum}`)}
          style={{
            width: '100%', marginBottom: 20, padding: '13px 0',
            background: 'linear-gradient(135deg,#f5a623,#ffd166)',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'Anton,sans-serif', fontSize: 14,
            letterSpacing: 2, color: '#070a12', textTransform: 'uppercase',
          }}
        >Build Your Lineup →</button>
        <div style={{ background: '#0c1422', border: '1px solid #1a2b40', borderRadius: 10, overflow: 'hidden' }}>
          {['QB','RB','RB','WR','WR','TE','FLEX','DEF','K'].map((pos, i) => {
            const POS_COLORS: Record<string,string> = { QB:'#e05c2a',RB:'#2a9d8f',WR:'#3a86ff',TE:'#8338ec',FLEX:'#f5a623',DEF:'#2b9348',K:'#e9c46a' };
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: i < 8 ? '1px solid #1a2b40' : 'none', opacity: 0.5 }}>
                <div style={{ background: POS_COLORS[pos]??'#1a2b40', color:'#fff', fontFamily:'Oswald,sans-serif', fontSize:9, fontWeight:700, borderRadius:4, padding:'2px 6px', minWidth:28, textAlign:'center', flexShrink:0 }}>{pos}</div>
                <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:13, color:'#3e5470', fontStyle:'italic' }}>Empty</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (lineupSubmitted && picks && picks.length > 0) {
    return (
      <div style={{ maxWidth: 560 }}>
        {entryHeader}
        <button
          onClick={() => router.push(`/league/${leagueId}/lineup?entry=${activeEntryNum}`)}
          style={{
            width: '100%', padding: '14px', marginBottom: 16,
            background: 'linear-gradient(135deg,#f5a623,#ffd166)',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'Anton,sans-serif', fontSize: 14,
            letterSpacing: 2, color: '#070a12', textTransform: 'uppercase',
          }}
        >✏ Edit Lineup →</button>
        <div style={{ background: '#0c1422', border: '1px solid #1a2b40', borderRadius: 10, overflow: 'hidden' }}>
          {(() => {
            const POS_WEIGHT: Record<string,number> = { QB:0, RB:1, WR:3, TE:5, FLEX:6, DEF:7, K:8 };
            const normalize = (s: string) => s.replace(/\d+$/, '');
            const sortedPicks = [...(picks ?? [])].sort((a,b) => {
              const aSlot = a.player_data?._slot ?? a.player_data?.unitType ?? '';
              const bSlot = b.player_data?._slot ?? b.player_data?.unitType ?? '';
              return (POS_WEIGHT[normalize(aSlot)] ?? 9) - (POS_WEIGHT[normalize(bSlot)] ?? 9);
            });
            return sortedPicks.map((pick: any, i: number) => {
            const school = pick.player_data?.school;
            const slot = pick.player_data?._slot ?? pick.player_data?.unitType ?? '';
            const unitType = pick.player_data?.unitType ?? '';
            const displayPos = slot || unitType;
            const kickoff = gameTimeMap?.[school];
            const locked = kickoff ? new Date() >= new Date(kickoff) : false;
            const POS_COLORS: Record<string,string> = { QB:'#e05c2a',RB:'#2a9d8f',WR:'#3a86ff',TE:'#8338ec',DEF:'#2b9348',K:'#e9c46a' };
            const logo = teamLogos[school];
            const game = scheduleMap[school];
            const bdKey = `${school}-${unitType}`;
            const isExpanded = expandedPick === bdKey;
            return (
              <React.Fragment key={i}>
                <div onClick={() => setExpandedPick(isExpanded ? null : bdKey)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: !isExpanded && i < sortedPicks.length-1 ? '1px solid #1a2b40' : 'none', opacity: locked ? 0.6 : 1, cursor:'pointer' }}>
                  <div style={{ background: POS_COLORS[normalize(displayPos)]??'#1a2b40', color:'#fff', fontFamily:'Oswald,sans-serif', fontSize:9, fontWeight:700, borderRadius:4, padding:'2px 6px', minWidth:28, textAlign:'center', flexShrink:0 }}>{displayPos}</div>
                  {logo && <img src={logo} alt={school} style={{ width:28, height:28, objectFit:'contain', flexShrink:0 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />}
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:13, fontWeight:600, color:'#7eb8f7' }}>{pick.player_data?.playerName || school}</div>
                    <div style={{ fontFamily:'Oswald,sans-serif', fontSize:9, color:'#4a5d7a' }}>{game ? `${game.opp} · ${game.date}` : school}</div>
                  </div>
                  {locked && <span style={{ fontSize:12 }}>🔒</span>}
                  <span style={{ fontSize:10, color:'#3e5470' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
                {isExpanded && (
                  <div style={{ background:'rgba(0,0,0,.25)', borderBottom: i < sortedPicks.length-1 ? '1px solid #1a2b40' : 'none', padding:'8px 14px', overflowX:'auto' }}>
                    <UnitExpansion school={school} unitType={unitType} currentWeek={week} season={2025} logos={teamLogos} />
                  </div>
                )}
              </React.Fragment>
            );
          });
          })()}
        </div>

        {showAddEntryConfirm && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#0c1422', border: '1px solid #1a2b40', borderRadius: 14, padding: '32px 28px', maxWidth: 400, width: '100%', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: '#e4edf7', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Add Another Entry?</div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: '#7a90aa', marginBottom: 24, lineHeight: 1.6 }}>
                {buyInCents > 0 ? `This will charge $${(buyInCents / 100).toFixed(2)} from your wallet for Entry ${myEntries.length + 1}. This cannot be undone.` : `You are adding Entry ${myEntries.length + 1}. This cannot be undone.`}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setShowAddEntryConfirm(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #1a2b40', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, color: '#7a90aa' }}>Cancel</button>
                <button onClick={async () => { setShowAddEntryConfirm(false); await handleAddEntry(); }} style={{ flex: 1, padding: '12px', background: 'rgba(245,166,35,.15)', border: '1px solid rgba(245,166,35,.4)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 1, color: '#f5a623', textTransform: 'uppercase' }}>Yes, Add Entry</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // (unreachable — kept for lineupChanged/resubmit path if needed)
  const lineupMap: Record<string, any> = {};
  for (const pick of picks) {
    const slot = pick.player_data?._slot ?? pick.slot;
    if (slot) { const { _slot: _s, _salary: _sal, ...unitData } = pick.player_data ?? {}; lineupMap[slot] = unitData; }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {entryHeader}

      {showAddEntryConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            background: '#0c1422', border: '1px solid #1a2b40',
            borderRadius: 14, padding: '32px 28px',
            maxWidth: 400, width: '100%', textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: '#e4edf7', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              Add Another Entry?
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: '#7a90aa', marginBottom: 24, lineHeight: 1.6 }}>
              {buyInCents > 0
                ? `This will charge $${(buyInCents / 100).toFixed(2)} from your wallet for Entry ${myEntries.length + 1}. This cannot be undone.`
                : `You are adding Entry ${myEntries.length + 1}. This cannot be undone.`}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowAddEntryConfirm(false)}
                style={{
                  flex: 1, padding: '12px',
                  background: 'transparent', border: '1px solid #1a2b40',
                  borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'Oswald,sans-serif', fontSize: 12,
                  letterSpacing: 1, color: '#7a90aa',
                }}
              >Cancel</button>
              <button
                onClick={async () => {
                  setShowAddEntryConfirm(false);
                  await handleAddEntry();
                }}
                style={{
                  flex: 1, padding: '12px',
                  background: 'rgba(245,166,35,.15)',
                  border: '1px solid rgba(245,166,35,.4)',
                  borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'Anton,sans-serif', fontSize: 13,
                  letterSpacing: 1, color: '#f5a623',
                  textTransform: 'uppercase',
                }}
              >Yes, Add Entry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Weekly Leaderboard Tab ─────────────────────────────────── */
function WeeklyLeaderboardTab({ leagueId, league, userId }: { leagueId: string; league: any; userId: string | null }) {
  const [data,          setData]          = useState<any>(null);
  const [loading,       setLoading]       = useState(true);
  const [week,          setWeek]          = useState<number | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [entryPicks,    setEntryPicks]    = useState<Record<string, any[]>>({});
  const [matchupCtx,    setMatchupCtx]    = useState<any>(null);

  const allGamesComplete = league?.status === 'completed' || league?.status === 'scoring';

  useEffect(() => {
    fetch(`/api/matchup-context?week=5&season=2025`)
      .then(r => r.json())
      .then(d => setMatchupCtx(d))
      .catch(() => {});
  }, []);

  async function loadEntryPicks(userId: string, entryNumber: number) {
    const key = `${userId}::${entryNumber}`;
    if (entryPicks[key]) return;
    const res = await fetch(`/api/lineup/leaderboard?league_id=${leagueId}&user_id=${userId}&entry_number=${entryNumber}&picks=true`);
    const d = await res.json();
    setEntryPicks(prev => ({ ...prev, [key]: d.picks ?? [] }));
  }

  useEffect(() => {
    // Default to current league week
    if (league?.week) setWeek(league.week);
  }, [league?.week]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/lineup/leaderboard?league_id=${leagueId}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        // Only set week from data if not already set from league
        if (!league?.week && d.weeks?.length) setWeek(d.weeks[d.weeks.length - 1]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [leagueId]);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 2, fontSize: 12 }}>
      Loading leaderboard…
    </div>
  );

  const entries = data?.entries ?? data?.members ?? [];
  const weeks   = data?.weeks ?? [];

  const weekScores = week
    ? entries.map((e: any) => ({ ...e, displayScore: Math.round((e.weeklyScores?.[week] ?? 0) * 100) / 100 }))
             .sort((a: any, b: any) => b.displayScore - a.displayScore)
    : entries.map((e: any) => ({ ...e, displayScore: e.total }))
             .sort((a: any, b: any) => b.displayScore - a.displayScore);

  // Payout helpers (same logic as bracket leaderboard)
  const buyInCents       = Math.round((league?.buy_in ?? 0) * 100);
  const totalEntries     = weekScores.length;
  const netPool          = Math.floor(buyInCents * totalEntries * 0.95);
  const payoutStructure  = league?.settings?.payout_structure ?? 'winner_take_all';

  function getAdaptedStructure(s: string, n: number): string {
    if (s === 'top3') { if (n <= 1) return 'winner_take_all'; if (n === 2) return 'top2'; return 'top3'; }
    if (s === 'top2') { if (n <= 1) return 'winner_take_all'; return 'top2'; }
    return s;
  }
  function getPayoutForRank(rank: number): number {
    if (netPool === 0) return 0;
    if (payoutStructure === 'double_up') {
      const winners = Math.floor(totalEntries / 2);
      const hasMiddle = totalEntries % 2 !== 0;
      if (hasMiddle && rank === winners + 1) return buyInCents;
      return rank <= winners ? Math.floor(buyInCents * 1.95) : 0;
    }
    const adapted = getAdaptedStructure(payoutStructure, totalEntries);
    if (adapted === 'winner_take_all') return rank === 1 ? netPool : 0;
    if (adapted === 'top2') { if (rank === 1) return Math.floor(netPool * 0.70); if (rank === 2) return Math.floor(netPool * 0.30); return 0; }
    if (adapted === 'top3') { if (rank === 1) return Math.floor(netPool * 0.60); if (rank === 2) return Math.floor(netPool * 0.25); if (rank === 3) return Math.floor(netPool * 0.15); return 0; }
    return 0;
  }
  function isInMoney(rank: number): boolean {
    if (payoutStructure === 'double_up') { const w = Math.floor(totalEntries / 2); return rank <= w + (totalEntries % 2 !== 0 ? 1 : 0); }
    const adapted = getAdaptedStructure(payoutStructure, totalEntries);
    if (adapted === 'top3') return rank <= 3;
    if (adapted === 'top2') return rank <= 2;
    return rank === 1;
  }
  const cutRank = payoutStructure === 'double_up' ? Math.floor(totalEntries / 2) + (totalEntries % 2 !== 0 ? 1 : 0)
    : payoutStructure === 'top3' ? Math.min(3, totalEntries)
    : payoutStructure === 'top2' ? Math.min(2, totalEntries)
    : 1;

  return (
    <div style={{ maxWidth: 620 }}>
      {/* Week selector — no TOTAL button */}
      {weeks.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {weeks.map((w: number) => (
            <button
              key={w}
              onClick={() => setWeek(w)}
              style={{
                padding: '5px 12px', borderRadius: 6,
                background: week === w ? 'rgba(245,166,35,.15)' : C.surf2,
                border: `1px solid ${week === w ? C.gold : C.surf3}`,
                color: week === w ? C.gold : C.sub,
                fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, cursor: 'pointer',
              }}
            >WK {w}</button>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div style={{
          background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12,
          padding: '40px 28px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 16, color: C.sub, textTransform: 'uppercase' }}>
            No lineups submitted yet
          </div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.muted, marginTop: 8 }}>
            Members need to submit their weekly lineup first
          </div>
        </div>
      ) : (
        <div style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid ' + C.surf3, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>TEAM</span>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {netPool > 0 && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>Pool: ${(netPool / 100).toFixed(2)}</span>}
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>
                {week ? `WK ${week} PTS` : 'TOTAL PTS'}
              </span>
            </div>
          </div>
          {weekScores.map((m: any, i: number) => {
            const rank     = i + 1;
            const pts      = week ? m.displayScore : m.total;
            const entryKey = `${m.user_id}::${m.entry_number ?? 1}`;
            const isExpanded = expandedEntry === entryKey;
            const picks    = entryPicks[entryKey] ?? [];
            const inMoney  = buyInCents > 0 && isInMoney(rank);
            const prize    = buyInCents > 0 ? getPayoutForRank(rank) : 0;
            const showCutLine = buyInCents > 0 && i > 0 && rank === cutRank + 1;

            // Calculate projected total for this entry
            const projTotal = picks.reduce((sum: number, pick: any) => {
              const school = pick.player_data?.school;
              const unitType = pick.player_data?.unitType;
              if (!school || !unitType || !matchupCtx) return sum;
              const opp = matchupCtx.opponentMap?.[school];
              if (!opp) return sum;
              const avgF = pick.player_data?.avgFpts ?? pick.player_data?.avgPerWeek ?? 0;
              const oppRank = unitType === 'DEF'
                ? (matchupCtx.offRankMap?.[opp] ?? 50)
                : (matchupCtx.defRankMap?.[opp] ?? 50);
              const mult = oppRank <= 5 ? 1.3 : oppRank <= 10 ? 1.2
                : oppRank <= 15 ? 1.1 : oppRank <= 25 ? 1.0
                : oppRank <= 35 ? 0.9 : oppRank <= 50 ? 0.8
                : oppRank <= 80 ? 0.7 : oppRank <= 100 ? 0.6 : 0.50;
              return sum + avgF * mult;
            }, 0);

            return (
              <React.Fragment key={entryKey}>
                {showCutLine && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 20px' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(240,58,90,.3)' }} />
                    <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.red, textTransform: 'uppercase' }}>CUT LINE</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(240,58,90,.3)' }} />
                  </div>
                )}
                <div
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedEntry(null);
                    } else {
                      setExpandedEntry(entryKey);
                      if (allGamesComplete || m.user_id === userId) {
                        loadEntryPicks(m.user_id, m.entry_number ?? 1);
                      }
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 20px', borderBottom: '1px solid ' + C.surf3,
                    background: isExpanded ? 'rgba(245,166,35,.06)' : i === 0 ? 'rgba(245,166,35,.04)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: i === 0 ? 'linear-gradient(135deg,#f5a623,#ffd166)' : C.surf3,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Anton,sans-serif', fontSize: 12,
                    color: i === 0 ? C.bg : C.sub,
                  }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: C.text }}>
                      {m.team_name}
                    </div>
                    {projTotal > 0 && pts === 0 && (
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                        Proj: {projTotal.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 16, color: pts > 0 ? C.gold : C.muted }}>
                      {pts > 0 ? pts.toFixed(2) : '—'}
                    </div>
                    {projTotal > 0 && pts === 0 && (
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>projected</div>
                    )}
                  </div>
                  {buyInCents > 0 && (
                    <div style={{ textAlign: 'right', minWidth: 52, flexShrink: 0 }}>
                      {inMoney ? (
                        <>
                          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.green }}>${(prize / 100).toFixed(2)}</div>
                          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.green, letterSpacing: 1 }}>💰 IN</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.muted }}>—</div>
                          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1 }}>OUT</div>
                        </>
                      )}
                    </div>
                  )}
                  <div style={{ color: C.muted, fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</div>
                </div>

                {/* Expanded lineup */}
                {isExpanded && (
                  <div style={{ background: 'rgba(0,0,0,.2)', borderBottom: '1px solid ' + C.surf3, padding: '12px 20px' }}>
                    {!allGamesComplete && m.user_id !== userId ? (
                      <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11, textAlign: 'center', padding: '12px 0', letterSpacing: 1 }}>
                        🔒 Lineup hidden until contest ends
                      </div>
                    ) : picks.length === 0 ? (
                      <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
                        Loading lineup…
                      </div>
                    ) : (
                      <div>
                        {(() => { const POS_WEIGHT: Record<string,number> = { QB:0, RB:1, WR:3, TE:5, FLEX:6, DEF:7, K:8 }; const norm = (s: string) => s.replace(/\d+$/, ''); return [...picks].sort((a,b) => (POS_WEIGHT[norm(a.player_data?._slot??a.player_data?.unitType??'')]??9) - (POS_WEIGHT[norm(b.player_data?._slot??b.player_data?.unitType??'')]??9)); })().map((pick: any, pi: number) => {
                          const school = pick.player_data?.school;
                          const unitType = pick.player_data?.unitType;
                          const opp = matchupCtx?.opponentMap?.[school];
                          const avgF = pick.player_data?.avgFpts ?? pick.player_data?.avgPerWeek ?? 0;
                          const oppRank = opp && matchupCtx
                            ? unitType === 'DEF'
                              ? (matchupCtx.offRankMap?.[opp] ?? 50)
                              : (matchupCtx.defRankMap?.[opp] ?? 50)
                            : 50;
                          const mult = oppRank <= 5 ? 1.3 : oppRank <= 10 ? 1.2
                            : oppRank <= 15 ? 1.1 : oppRank <= 25 ? 1.0
                            : oppRank <= 35 ? 0.9 : oppRank <= 50 ? 0.8
                            : oppRank <= 80 ? 0.7 : oppRank <= 100 ? 0.6 : 0.50;
                          const proj = (avgF * mult).toFixed(1);
                          const POS_COLORS: Record<string, string> = {
                            QB: '#e05c2a', RB: '#2a9d8f', WR: '#3a86ff',
                            TE: '#8338ec', DEF: '#2b9348', K: '#e9c46a',
                          };
                          return (
                            <div key={pi} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '6px 0', borderBottom: pi < picks.length - 1 ? '1px solid rgba(30,45,71,.3)' : 'none',
                            }}>
                              <div style={{
                                background: POS_COLORS[unitType] ?? C.surf3,
                                color: '#fff', fontFamily: 'Oswald,sans-serif', fontSize: 9,
                                fontWeight: 700, borderRadius: 4, padding: '2px 6px',
                                minWidth: 28, textAlign: 'center', flexShrink: 0,
                              }}>{unitType}</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: '#7eb8f7' }}>
                                  {pick.player_data?.playerName || school}
                                </div>
                                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>
                                  {school}{opp ? ` vs ${opp}` : ''}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.muted }}>
                                  {proj}
                                </div>
                                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1 }}>PROJ</div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Entry total */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(245,166,35,.2)' }}>
                          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.gold, letterSpacing: 1 }}>TOTAL PROJECTED</span>
                          <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.gold }}>{projTotal.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Draft Tab ──────────────────────────────────────────────── */
function DraftTab({ league, members, userId, userEmail, spotsLeft, isFull, isCommissioner, inviteUrl, copied, isEmbed, cpuTeams, onCopy, onStartDraft, onMockDraft, onAddCpu, onRemoveCpu, onResetDraft, onDeleteLeague, onRequestKick }: {
  league: any; members: any[]; userId: string | null; userEmail: string;
  spotsLeft: number; isFull: boolean; isCommissioner: boolean;
  inviteUrl: string; copied: boolean; isEmbed: boolean; cpuTeams: string[];
  onCopy: () => void; onStartDraft: () => void; onMockDraft: () => void;
  onAddCpu: () => void; onRemoveCpu: (i: number) => void; onResetDraft: () => void;
  onDeleteLeague: () => void; onRequestKick: (member: { userId: string; teamName: string }) => void;
}) {
  const size = league?.league_size || 0;
  const isAdmin = userEmail === 'whb21burton@gmail.com';
  const minMembers = 1;
  const [draftCountdown, setDraftCountdown] = useState('');
  useEffect(() => {
    const draftAt = league?.settings?.draft_time ?? league?.settings?.draft_scheduled_at;
    if (!draftAt) return;
    const tick = () => {
      const diff = new Date(draftAt).getTime() - Date.now();
      if (diff <= 0) { setDraftCountdown('Draft time has arrived!'); return; }
      const days  = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins  = Math.floor((diff % 3600000) / 60000);
      const secs  = Math.floor((diff % 60000) / 1000);
      if (days > 0)        setDraftCountdown(`${days}d ${hours}h ${mins}m ${secs}s`);
      else if (hours > 0)  setDraftCountdown(`${hours}h ${mins}m ${secs}s`);
      else                 setDraftCountdown(`${mins}m ${secs}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [league?.settings?.draft_time, league?.settings?.draft_scheduled_at]);

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Draft countdown banner — premium */}
      {draftCountdown && (() => {
        const draftAt = league?.settings?.draft_time ?? league?.settings?.draft_scheduled_at;
        if (!draftAt || new Date(draftAt) <= new Date()) return null;
        const diff = Math.max(0, new Date(draftAt).getTime() - Date.now());
        const days  = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins  = Math.floor((diff % 3600000) / 60000);
        const secs  = Math.floor((diff % 60000) / 1000);
        const units = days > 0
          ? [{ val: days, label: 'Days' }, { val: hours, label: 'Hrs' }, { val: mins, label: 'Min' }, { val: secs, label: 'Sec' }]
          : hours > 0
          ? [{ val: hours, label: 'Hrs' }, { val: mins, label: 'Min' }, { val: secs, label: 'Sec' }]
          : [{ val: mins, label: 'Min' }, { val: secs, label: 'Sec' }];
        return (
          <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg,#0a1628 0%,#0f1e35 50%,#0a1628 100%)', border: '1px solid rgba(245,166,35,.4)', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
            <style>{`@keyframes draft-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }`}</style>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center,rgba(245,166,35,.08) 0%,transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 4, color: C.gold, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.gold, boxShadow: `0 0 6px ${C.gold}`, animation: 'draft-pulse 1.5s infinite' }} />
              Draft Starting In
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
              {units.map(({ val, label }, i) => (
                <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  {i > 0 && <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, color: 'rgba(245,166,35,.4)', marginBottom: 8 }}>:</span>}
                  <div style={{ textAlign: 'center' as const }}>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 42, color: C.gold, letterSpacing: 2, lineHeight: 1, textShadow: '0 0 20px rgba(245,166,35,.5)' }}>{String(val).padStart(2, '0')}</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 3, color: C.muted, textTransform: 'uppercase', marginTop: 3 }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
                {new Date(draftAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ padding: '4px 12px', background: 'rgba(245,166,35,.1)', border: '1px solid rgba(245,166,35,.3)', borderRadius: 20, fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.gold, letterSpacing: 1 }}>
                {new Date(draftAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
              </div>
            </div>
            {members.length < size && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(245,166,35,.15)', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>👥</span>
                <span>{members.length}/{size} managers joined</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Invite friends banner */}
      {!isEmbed && league?.status === 'forming' && (
        <div style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>📨 Invite Friends</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, padding: '9px 13px', background: C.bg, border: '1px solid ' + C.surf3, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: C.gold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{inviteUrl}</div>
            <button
              onClick={onCopy}
              style={{ flexShrink: 0, padding: '9px 16px', background: copied ? 'rgba(46,204,113,.2)' : C.gold, border: copied ? '1px solid rgba(46,204,113,.4)' : 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 2, color: copied ? C.green : C.bg, transition: 'all .2s' }}
            >{copied ? '✓ Copied' : 'Copy Link'}</button>
          </div>
        </div>
      )}

      {/* Draftboard header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase' }}>Draftboard</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: isFull ? C.gold : C.sub, marginTop: 2 }}>
            {members.length + cpuTeams.length}/{size} — {isFull ? 'League full! Ready to draft.' : spotsLeft + ' spot' + (spotsLeft !== 1 ? 's' : '') + ' left'}
          </div>
        </div>
        <button
          onClick={onMockDraft}
          style={{ padding: '9px 18px', background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: C.sub, transition: 'all .15s' }}
        >Mock Draft</button>
        {isCommissioner && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onResetDraft}
              style={{ padding: '9px 18px', background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#e74c3c', transition: 'all .15s' }}
            >Reset Draft</button>
            <button
              onClick={onDeleteLeague}
              style={{ padding: '9px 18px', background: 'rgba(231,76,60,.18)', border: '1px solid rgba(231,76,60,.5)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#f03a5a', transition: 'all .15s' }}
            >Delete League</button>
          </div>
        )}
      </div>

      {/* Slots */}
      <div style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        {Array.from({ length: size }).map((_, i) => {
          const slotNum  = i + 1;
          const member   = members[i];
          const cpuIndex = i - members.length;
          const isCpu    = !member && cpuIndex >= 0 && cpuIndex < cpuTeams.length;
          const isEmpty  = !member && !isCpu;
          const isMe     = member?.user_id === userId;
          const isComm   = member?.user_id === league?.commissioner_id;

          if (member) return (
            <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < size - 1 ? '1px solid ' + C.surf3 : 'none', background: isMe ? 'rgba(212,168,40,.05)' : 'transparent' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: isMe ? 'linear-gradient(135deg,#d4a828,#f0c94a)' : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 14, color: isMe ? C.bg : C.muted }}>{slotNum}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Oswald,sans-serif', fontWeight: 600, fontSize: 15, color: isMe ? C.gold : C.text, textTransform: 'uppercase', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{member.team_name}</span>
                  {isComm && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.gold, background: 'rgba(212,168,40,.15)', padding: '2px 7px', borderRadius: 3, letterSpacing: 1, flexShrink: 0 }}>COMM</span>}
                  {isMe   && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.green, background: 'rgba(46,204,113,.1)',  padding: '2px 7px', borderRadius: 3, letterSpacing: 1, flexShrink: 0 }}>YOU</span>}
                </div>
              </div>
              {isCommissioner && !isMe && league?.status === 'forming' && (
                <button
                  onClick={() => onRequestKick({ userId: member.user_id, teamName: member.team_name })}
                  style={{ flexShrink: 0, padding: '4px 10px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.35)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.red }}
                >Kick</button>
              )}
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.muted, flexShrink: 0 }}>Pick #{slotNum}</div>
            </div>
          );

          if (isCpu) return (
            <div key={'cpu-' + cpuIndex} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < size - 1 ? '1px solid ' + C.surf3 : 'none', background: 'rgba(58,130,246,.04)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'rgba(58,130,246,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 14, color: '#3b82f6' }}>{slotNum}</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontWeight: 600, fontSize: 15, color: C.sub, textTransform: 'uppercase' }}>{cpuTeams[cpuIndex]}</span>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: '#3b82f6', background: 'rgba(58,130,246,.15)', padding: '2px 7px', borderRadius: 3, letterSpacing: 1, flexShrink: 0 }}>CPU</span>
              </div>
              {isCommissioner && league?.status === 'forming' && (
                <button onClick={() => onRemoveCpu(cpuIndex)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, lineHeight: 1, padding: '2px 6px', borderRadius: 4 }} title="Remove CPU">×</button>
              )}
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.muted, flexShrink: 0 }}>Pick #{slotNum}</div>
            </div>
          );

          // Empty slot
          return (
            <div key={'empty-' + i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < size - 1 ? '1px solid ' + C.surf3 : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px dashed ' + C.surf3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>{slotNum}</div>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.muted, fontStyle: 'italic', flex: 1 }}>Waiting for invite...</span>
              {isCommissioner && league?.status === 'forming' && userEmail === 'whb21burton@gmail.com' && (
                <button onClick={onAddCpu} style={{ flexShrink: 0, padding: '5px 12px', background: 'rgba(58,130,246,.1)', border: '1px solid rgba(58,130,246,.3)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: '#3b82f6' }}>+ Add CPU</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Commissioner controls — forming */}
      {isCommissioner && league?.status === 'forming' && (
        members.length >= minMembers ? (
          <div>
            <button
              onClick={onStartDraft}
              style={{ width: '100%', padding: 17, background: 'linear-gradient(135deg,#d4a828,#f0c94a)', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 3, textTransform: 'uppercase', color: C.bg }}
            >🏈 Enter Draft Room</button>
            {!isFull && (
              <div style={{ marginTop: 8, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, textAlign: 'center', letterSpacing: 1 }}>
                {spotsLeft} empty slot{spotsLeft !== 1 ? 's' : ''} will be auto-filled with CPU teams
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '13px 18px', background: 'rgba(212,168,40,.05)', border: '1px solid rgba(212,168,40,.18)', borderRadius: 10, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, textAlign: 'center' }}>
            Need at least {minMembers} manager{minMembers === 1 ? '' : 's'} to start the draft.
          </div>
        )
      )}

      {/* All members — join live draft when it's active */}
      {league?.status === 'drafting' && (
        <button
          onClick={onStartDraft}
          style={{ width: '100%', padding: 17, background: 'linear-gradient(135deg,#d4a828,#f0c94a)', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 3, textTransform: 'uppercase', color: C.bg }}
        >🏈 Join Draft Room</button>
      )}
    </div>
  );
}

/* ── Safe Breakdown (no async — uses data already in wk.players) ── */
function SafeBreakdown({ week, unit }: { week: any; unit: string }) {
  try {
    const allPlayers: any[] = week.players ?? [];
    const weekMult: number  = week.multiplier ?? 1.0;

    const TH = (align: 'left' | 'right', gold?: boolean): React.CSSProperties => ({
      padding: '6px 8px', fontFamily: 'Oswald,sans-serif', fontWeight: 400,
      fontSize: 11, color: gold ? '#d4a828' : '#7a90b0', textAlign: align,
      letterSpacing: 0.5, textTransform: 'uppercase' as const,
      overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const,
    });
    const TD = (align: 'left' | 'right', extra: React.CSSProperties = {}): React.CSSProperties => ({
      padding: '7px 8px', fontFamily: 'Oswald,sans-serif', fontSize: 12,
      color: '#e8edf5', textAlign: align, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const,
      ...extra,
    });
    const GOLD: React.CSSProperties = { color: '#d4a828', fontWeight: 700 };
    const DIM:  React.CSSProperties = { color: '#7a90b0' };
    const wrap: React.CSSProperties = { background: '#080c15', borderLeft: '3px solid #d4a828' };
    const tbl:  React.CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };
    const hdr:  React.CSSProperties = { background: '#0a0f1a' };
    const div:  React.CSSProperties = { borderBottom: '1px solid #1e2d47' };
    const col = (w: string) => <col style={{ width: w }} />;

    if (unit === 'DEF') {
      const d        = (week.defStats ?? allPlayers[0]) ?? {};
      const sacks    = d.sacks    ?? 0;
      const ints     = d.ints     ?? 0;
      const fumRec   = d.fumRec   ?? 0;
      const defTDs   = d.defTd    ?? d.defTDs ?? 0;
      const safeties = d.safeties ?? 0;
      const pts      = week.fantasyPoints != null ? (week.fantasyPoints as number).toFixed(1) : '—';
      return (
        <div style={wrap}>
          <table style={tbl}>
            <colgroup>{col('17%')}{col('15%')}{col('18%')}{col('17%')}{col('17%')}{col('16%')}</colgroup>
            <thead>
              <tr style={hdr}>
                <th style={TH('right')}>SACKS</th>
                <th style={TH('right')}>INT</th>
                <th style={TH('right')}>FUM REC</th>
                <th style={TH('right')}>DEF TD</th>
                <th style={TH('right')}>SAFETY</th>
                <th style={TH('right', true)}>PTS</th>
              </tr>
            </thead>
            <tbody>
              <tr style={div}>
                {[sacks, ints, fumRec, defTDs, safeties].map((v, i) => (
                  <td key={i} style={TD('right')}>{v}</td>
                ))}
                <td style={TD('right', GOLD)}>{pts}</td>
              </tr>
              <tr>
                <td colSpan={6} style={{ padding: '5px 8px', color: '#7a90b0', fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, borderTop: '1px solid #1e2d47' }}>
                  Sack×1 · INT×2 · FumRec×2 · DefTD×6 · Safety×2 — then × ODR multiplier
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }

    const named = allPlayers.filter((p: any) => p.name);
    const withRaw = named.map((p: any) => {
      let rawPts = 0;
      if (unit === 'QB') rawPts = (p.passYd||0)*0.1 + (p.passTd||0)*4 + (p.int||0)*(-2) + (p.rushYd||0)*0.1 + (p.rushTd||0)*6;
      else if (unit === 'RB') rawPts = (p.rushYd||0)*0.1 + (p.rushTd||0)*6 + (p.rec||0)*1 + (p.recYd||0)*0.1;
      else if (unit === 'WR' || unit === 'TE') rawPts = (p.rec||0)*1 + (p.recYd||0)*0.1 + (p.recTd||0)*6;
      else if (unit === 'K') rawPts = p.pts || 0;
      return { ...p, rawPts };
    }).sort((a: any, b: any) => b.rawPts - a.rawPts);

    if (!withRaw.length) {
      return (
        <div style={{ padding: '12px 16px', color: '#7a90b0', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontStyle: 'italic' }}>
          No player data available for this week
        </div>
      );
    }

    const unitWeights: Record<string, number[]> = { RB: [1.0,0.5,0.25], WR: [1.0,0.5,0.25], TE: [1.0,0.5], QB: [1.0], K: [1.0] };
    const weights    = unitWeights[unit] ?? [1.0];
    const roleLabels: Record<string, string[]> = { RB: ['RB1','RB2','RB3'], WR: ['WR1','WR2','WR3'], TE: ['TE1','TE2'], QB: ['QB'] };
    const roles      = roleLabels[unit] ?? [];
    const displayed  = withRaw.slice(0, weights.length);
    const unitTotal  = week.fantasyPoints != null
      ? (week.fantasyPoints as number).toFixed(1)
      : displayed.reduce((s: number, p: any, i: number) => s + Math.round((p.rawPts??0)*(weights[i]??0)*weekMult*10)/10, 0).toFixed(1);

    // QB: PLAYER(30%) PASS YDS(12%) PASS TD(10%) INT(9%) RUSH YDS(12%) RUSH TD(10%) PTS(10%) ROLE(7%)
    // RB: PLAYER(22%) ROLE(7%) ATT(8%) RUSH YDS(12%) RUSH TD(10%) REC(8%) REC YDS(11%) PTS(8%) MULT(7%) WEIGHTED(7%)
    // WR/TE: PLAYER(28%) ROLE(8%) REC(10%) YDS(12%) TD(9%) PTS(9%) MULT(9%) WEIGHTED(10%) — extra 5% absorbed by player
    // K: PLAYER(70%) ROLE(10%) PTS(20%)
    const colgroups: Record<string, React.ReactNode> = {
      QB: <colgroup>{col('30%')}{col('12%')}{col('10%')}{col('9%')}{col('12%')}{col('10%')}{col('10%')}{col('7%')}</colgroup>,
      RB: <colgroup>{col('22%')}{col('7%')}{col('8%')}{col('12%')}{col('10%')}{col('8%')}{col('11%')}{col('8%')}{col('7%')}{col('7%')}</colgroup>,
      WR: <colgroup>{col('33%')}{col('8%')}{col('10%')}{col('12%')}{col('9%')}{col('9%')}{col('9%')}{col('10%')}</colgroup>,
      TE: <colgroup>{col('33%')}{col('8%')}{col('10%')}{col('12%')}{col('9%')}{col('9%')}{col('9%')}{col('10%')}</colgroup>,
      K:  <colgroup>{col('70%')}{col('10%')}{col('20%')}</colgroup>,
    };

    return (
      <div style={wrap}>
        <table style={tbl}>
          {colgroups[unit]}
          <thead>
            <tr style={hdr}>
              <th style={TH('left')}>PLAYER</th>
              {unit === 'QB' && <>
                <th style={TH('right')}>PASS YDS</th>
                <th style={TH('right')}>PASS TD</th>
                <th style={TH('right')}>INT</th>
                <th style={TH('right')}>RUSH YDS</th>
                <th style={TH('right')}>RUSH TD</th>
                <th style={TH('right', true)}>PTS</th>
                <th style={TH('right')}>ROLE</th>
              </>}
              {unit === 'RB' && <>
                <th style={TH('right')}>ROLE</th>
                <th style={TH('right')}>ATT</th>
                <th style={TH('right')}>RUSH YDS</th>
                <th style={TH('right')}>RUSH TD</th>
                <th style={TH('right')}>REC</th>
                <th style={TH('right')}>REC YDS</th>
                <th style={TH('right', true)}>PTS</th>
                <th style={TH('right')}>MULT</th>
                <th style={TH('right', true)}>WGTD</th>
              </>}
              {(unit === 'WR' || unit === 'TE') && <>
                <th style={TH('right')}>ROLE</th>
                <th style={TH('right')}>REC</th>
                <th style={TH('right')}>YDS</th>
                <th style={TH('right')}>TD</th>
                <th style={TH('right', true)}>PTS</th>
                <th style={TH('right')}>MULT</th>
                <th style={TH('right', true)}>WGTD</th>
              </>}
              {unit === 'K' && <>
                <th style={TH('right')}>ROLE</th>
                <th style={TH('right', true)}>PTS</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {displayed.map((p: any, i: number) => {
              const mult     = weights[i] ?? 0;
              // WGTD = rawPts × positionMult (no ODR)
              // FPTS = WGTD × ODR (shown as unit total row)
              const weighted = Math.round((p.rawPts??0) * mult * 10) / 10;
              const role     = roles[i] ?? '';
              const qbPts    = (p.passYd??0)*0.1 + (p.passTd??0)*4 + (p.int??0)*(-2) + (p.rushYd??0)*0.1 + (p.rushTd??0)*6;
              return (
                <tr key={p.name ?? i} style={div}>
                  <td style={TD('left', { fontWeight: 600 })}>{p.name}</td>

                  {unit === 'QB' && <>
                    <td style={TD('right')}>{p.passYd ?? 0}</td>
                    <td style={TD('right')}>{p.passTd ?? 0}</td>
                    <td style={TD('right', { color: (p.int ?? 0) > 0 ? '#f03a5a' : '#e8edf5' })}>{p.int ?? 0}</td>
                    <td style={TD('right')}>{p.rushYd ?? 0}</td>
                    <td style={TD('right')}>{p.rushTd ?? 0}</td>
                    <td style={TD('right', GOLD)}>{qbPts.toFixed(1)}</td>
                    <td style={TD('right', DIM)}>{role}</td>
                  </>}

                  {unit === 'RB' && <>
                    <td style={TD('right', DIM)}>{role}</td>
                    <td style={TD('right')}>{p.rushAtt ?? 0}</td>
                    <td style={TD('right')}>{p.rushYd ?? 0}</td>
                    <td style={TD('right')}>{p.rushTd ?? 0}</td>
                    <td style={TD('right')}>{p.rec ?? 0}</td>
                    <td style={TD('right')}>{p.recYd ?? 0}</td>
                    <td style={TD('right', GOLD)}>{(p.rawPts ?? 0).toFixed(1)}</td>
                    <td style={TD('right', DIM)}>×{mult.toFixed(2)}</td>
                    <td style={TD('right', GOLD)}>{weighted.toFixed(1)}</td>
                  </>}

                  {(unit === 'WR' || unit === 'TE') && <>
                    <td style={TD('right', DIM)}>{role}</td>
                    <td style={TD('right')}>{p.rec ?? 0}</td>
                    <td style={TD('right')}>{p.recYd ?? 0}</td>
                    <td style={TD('right')}>{p.recTd ?? 0}</td>
                    <td style={TD('right', GOLD)}>{(p.rawPts ?? 0).toFixed(1)}</td>
                    <td style={TD('right', DIM)}>×{mult.toFixed(2)}</td>
                    <td style={TD('right', GOLD)}>{weighted.toFixed(1)}</td>
                  </>}

                  {unit === 'K' && <>
                    <td style={TD('right', DIM)}>{role}</td>
                    <td style={TD('right', GOLD)}>{(p.pts ?? 0).toFixed(1)}</td>
                  </>}
                </tr>
              );
            })}
            <tr style={{ borderTop: '2px solid #d4a828' }}>
              <td colSpan={99} style={{ padding: '6px 8px', color: '#d4a828', fontFamily: 'Anton,sans-serif', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>
                UNIT TOTAL: {unitTotal}
              </td>
            </tr>
            <tr>
              <td colSpan={99} style={{ padding: '4px 8px', color: '#7a90b0', fontFamily: 'Oswald,sans-serif', fontSize: 10, textAlign: 'right' }}>
                × ODR {(weekMult ?? 1.0).toFixed(1)} = FPTS {Math.round((parseFloat(unitTotal) * (weekMult ?? 1.0)) * 10) / 10}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  } catch (_e) {
    return <div style={{ padding: '12px', color: '#f44336' }}>Error loading breakdown</div>;
  }
}

/* ── Player Detail View ──────────────────────────────────────── */
const UNIT_COLORS: Record<string, string> = {
  QB:  '#e84545',   // vivid red
  RB:  '#2d7fe0',   // clear royal blue
  WR:  '#d4a020',   // warm amber
  TE:  '#9b56e0',   // violet
  DEF: '#0db874',   // emerald
  K:   '#f07820',   // orange
};

const STAT_COLS: Record<string, { key: string; label: string }[]> = {
  QB:  [{ key: 'passYd', label: 'PASS YDS' }, { key: 'passTd', label: 'PASS TD' }, { key: 'int', label: 'INT' }, { key: 'rushYd', label: 'RUSH YDS' }, { key: 'rushTd', label: 'RUSH TD' }],
  RB:  [{ key: 'rushAtt', label: 'ATT' }, { key: 'rushYd', label: 'YDS' }, { key: 'rushTd', label: 'TD' }, { key: 'rec', label: 'REC' }, { key: 'recYd', label: 'REC YDS' }],
  WR:  [{ key: 'rec', label: 'REC' }, { key: 'recYd', label: 'YDS' }, { key: 'recTd', label: 'TD' }],
  TE:  [{ key: 'rec', label: 'REC' }, { key: 'recYd', label: 'YDS' }, { key: 'recTd', label: 'TD' }],
  DEF: [{ key: 'sacks', label: 'SACK' }, { key: 'ints', label: 'INT' }, { key: 'fumRec', label: 'FUM' }, { key: 'defTd', label: 'TD' }],
  K:   [{ key: 'pts', label: 'PTS' }],
};

function PlayerDetailView({ player, onBack, onAdd, canAdd }: {
  player: any; onBack: () => void; onAdd: () => void; canAdd: boolean;
}) {
  const [stats,         setStats]         = useState<any | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [expandedWk, setExpandedWk] = useState<number | null>(null);
  const [logos,         setLogos]         = useState<Record<string, string>>({});
  const toggleWeek = (wk: number) => setExpandedWk(prev => prev === wk ? null : wk);

  useEffect(() => {
    fetch('/api/team-logos').then(r => r.json()).then(d => setLogos(d.logos ?? {})).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/unit-stats?school=${encodeURIComponent(player.school)}&unitType=${player.unitType}&season=2025`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [player.school, player.unitType]);

  const cols    = STAT_COLS[player.unitType] ?? [];
  const weeks   = stats?.weeks ?? [];
  const posColor = UNIT_COLORS[player.unitType] ?? C.muted;

  // Aggregate individual player season totals (all named players)
  const playerTotals: Record<string, any> = {};
  for (const wk of weeks) {
    for (const p of (wk.players ?? [])) {
      if (!p.name) continue;
      if (!playerTotals[p.name]) playerTotals[p.name] = { name: p.name };
      for (const k of Object.keys(p)) {
        if (k !== 'name' && typeof p[k] === 'number') {
          playerTotals[p.name][k] = (playerTotals[p.name][k] || 0) + p[k];
        }
      }
    }
  }
  // DEF season totals (team totals, no named players)
  const defSeason = { sacks: 0, ints: 0, fumRec: 0, defTd: 0 };
  if (player.unitType === 'DEF') {
    for (const wk of weeks) {
      for (const p of (wk.players ?? [])) {
        defSeason.sacks  += p.sacks  || 0;
        defSeason.ints   += p.ints   || 0;
        defSeason.fumRec += p.fumRec || 0;
        defSeason.defTd  += p.defTd  || 0;
      }
    }
  }
  const jerseyMap: Record<string, string> = stats?.jerseyMap ?? {};
  const sortedPlayers = Object.values(playerTotals).sort((a: any, b: any) => {
    if (player.unitType === 'RB') return (b.rushYd || 0) - (a.rushYd || 0);
    if (player.unitType === 'QB') return (b.passYd || 0) - (a.passYd || 0);
    if (player.unitType === 'K')  return (b.pts    || 0) - (a.pts    || 0);
    return (b.recYd || 0) - (a.recYd || 0);
  });

  const colTemplate = `32px 1fr 64px 44px${cols.map(() => ' 64px').join('')}`;

  // Scoring constants (mirror sportsDataService.ts)
  const S = { passYd: 0.1, passTd: 4, int: -2, rushYd: 0.1, rushTd: 6, rec: 1.0, recYd: 0.1, recTd: 6 };
  const playerFpts = (p: any, ut: string): number => {
    if (ut === 'QB') return (p.passYd||0)*S.passYd + (p.passTd||0)*S.passTd + (p.int||0)*S.int + (p.rushYd||0)*S.rushYd + (p.rushTd||0)*S.rushTd;
    if (ut === 'RB') return (p.rushYd||0)*S.rushYd + (p.rushTd||0)*S.rushTd + (p.rec||0)*S.rec + (p.recYd||0)*S.recYd + (p.recTd||0)*S.recTd;
    if (ut === 'WR' || ut === 'TE') return (p.rec||0)*S.rec + (p.recYd||0)*S.recYd + (p.recTd||0)*S.recTd;
    if (ut === 'K')  return p.pts || 0;
    return 0;
  };

  // Top contributors: all named players sorted by fantasy pts desc
  const contributors = sortedPlayers
    .map((p: any) => ({ ...p, fpts: playerFpts(p, player.unitType) }))
    .sort((a: any, b: any) => b.fpts - a.fpts);

  const topN = player.unitType === 'QB' ? 1 : 3;
  const topContributors = contributors.slice(0, topN);
  const totalFpts = contributors.reduce((s: number, p: any) => s + p.fpts, 0);

  // For QB/K units, prefer the actual player name from stats over player_data (which may be stale/wrong)
  const statsPlayerName = (player.unitType === 'QB' || player.unitType === 'K') && !loading
    ? topContributors[0]?.name ?? null
    : null;
  const headerName = statsPlayerName || player.playerName || player.school;

  const rankColors = ['#d4a828', '#9ca3af', '#b87333']; // gold, silver, bronze
  const rankLabels = (ut: string, idx: number) =>
    ut === 'QB' ? 'STARTER' : `${ut}${idx + 1}`;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.sub, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 500, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        ← Back
      </button>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0e1f35 0%, #0b1624 100%)',
        border: `1px solid ${C.surf3}`, borderRadius: 14,
        padding: '18px 20px', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {/* School logo */}
          <div style={{ flexShrink: 0 }}>
            <SchoolLogo school={player.school} posColor={posColor} logos={logos} size={44} />
          </div>
          {/* Large pill badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: 40, minWidth: 56, padding: '0 12px', borderRadius: 24, flexShrink: 0,
            background: posColor + '22', border: '1px solid ' + posColor + '60',
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
            color: posColor, letterSpacing: 0.5,
          }}>{player.unitType}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {headerName}
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub, marginTop: 2 }}>{player.school} · {player.conference} · {player.tier}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 26, color: C.gold, lineHeight: 1 }}>{weeklyProj(player.projectedPoints).toFixed(1)}</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 500, color: C.muted, marginBottom: 8, marginTop: 2, letterSpacing: 1, textTransform: 'uppercase' }}>pts/wk proj</div>
          {canAdd && (
            <button onClick={onAdd} style={{
              padding: '6px 16px', background: 'rgba(21,198,120,.12)',
              border: `1px solid rgba(21,198,120,.4)`, borderRadius: 8,
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700,
              color: C.green, cursor: 'pointer', letterSpacing: .3,
            }}>+ ADD</button>
          )}
        </div>
      </div>

      {/* Coaching Strip */}
      {stats?.coachProfile && (() => {
        const cp = stats.coachProfile
        const passRate = cp.pass_rate ?? 0
        const isPassHeavy = passRate >= 55
        const isRunHeavy  = passRate <= 42
        const agg = cp.aggressiveness_score ?? 0
        const isAggressive = agg >= 7
        const isCautious   = agg <= 4
        const tempo = cp.tempo ?? 'normal'
        const isFast = tempo === 'fast'

        type Tag = { label: string; positive: boolean }
        const tags: Tag[] = []
        if (cp.head_coach)      tags.push({ label: `HC: ${cp.head_coach}`, positive: cp.hc_philosophy === 'offensive' })
        if (cp.off_coordinator) tags.push({ label: `OC: ${cp.off_coordinator}`, positive: isPassHeavy })
        if (isPassHeavy)        tags.push({ label: `Pass Heavy (${passRate}%)`, positive: true })
        else if (isRunHeavy)    tags.push({ label: `Run Heavy (${cp.rush_rate ?? (100 - passRate)}%)`, positive: false })
        else                    tags.push({ label: `Balanced (${passRate}% pass)`, positive: true })
        if (isFast)             tags.push({ label: '⚡ Fast Tempo', positive: true })
        if (isAggressive)       tags.push({ label: `Aggressive (${agg}/10)`, positive: true })

        return (
          <div style={{ padding: '8px 12px', marginBottom: 8, background: 'rgba(255,255,255,.03)', borderRadius: 8, border: '1px solid ' + C.surf3 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {tags.map((tag, i) => (
                <span key={i} style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontFamily: 'Oswald,sans-serif',
                  fontSize: 9,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase' as const,
                  background: tag.positive ? 'rgba(21,198,120,.15)' : 'rgba(240,58,90,.15)',
                  border: '1px solid ' + (tag.positive ? 'rgba(21,198,120,.35)' : 'rgba(240,58,90,.35)'),
                  color: tag.positive ? C.green : C.red,
                }}>
                  {tag.label}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Top Contributors */}
      {!loading && topContributors.length > 0 && player.unitType !== 'DEF' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: C.gold }}>★</span> Top Contributors
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${topN}, 1fr)`, gap: 10 }}>
            {topContributors.map((p: any, idx: number) => {
              const rc    = rankColors[idx];
              const pct   = totalFpts > 0 ? Math.round((p.fpts / totalFpts) * 100) : 0;
              const jersey = jerseyMap[p.name];
              const statLine = (() => {
                if (player.unitType === 'QB')       return `${p.passYd||0} YDS · ${p.passTd||0} TD`;
                if (player.unitType === 'RB')       return `${p.rushYd||0} YDS · ${p.rushTd||0} TD`;
                if (player.unitType === 'WR' || player.unitType === 'TE') return `${p.recYd||0} YDS · ${p.recTd||0} TD`;
                if (player.unitType === 'K')        return `${p.pts||0} PTS`;
                return '';
              })();
              return (
                <div key={p.name} style={{
                  background: C.surf, border: `1px solid ${rc}33`,
                  borderRadius: 12, padding: '14px 14px 12px',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* top accent bar */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${rc}, transparent)` }} />

                  {/* rank badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700,
                      letterSpacing: 1, padding: '2px 8px', borderRadius: 20,
                      background: rc + '22', border: `1px solid ${rc}55`, color: rc,
                      textTransform: 'uppercase',
                    }}>
                      {rankLabels(player.unitType, idx)}
                    </span>
                    {jersey && (
                      <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.muted }}>#{jersey}</span>
                    )}
                  </div>

                  {/* name */}
                  <div style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                    color: C.text, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', marginBottom: 6,
                  }}>
                    {p.name}
                  </div>

                  {/* fpts */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: rc, lineHeight: 1 }}>
                      {p.fpts.toFixed(1)}
                    </span>
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: .5 }}>FPTS</span>
                  </div>

                  {/* stat line */}
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.sub, marginBottom: 10 }}>
                    {statLine}
                  </div>

                  {/* contribution bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, color: C.muted, letterSpacing: .5 }}>CONTRIBUTION</span>
                      <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 9, color: rc }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, background: C.surf3, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: rc, borderRadius: 2, transition: 'width .4s ease' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Game Logs */}
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>Game Logs</div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>Loading stats…</div>
      ) : (() => {
        const ut = player.unitType;

        // Per-unit colgroup definitions — ODR column is wider to fit label+mult
        // Columns: WK | OPP | FPTS | ODR | ...stat cols | chevron
        const unitCols: Record<string, { label: string; key: string; align: 'left' | 'right'; w: string }[]> = {
          QB: [
            { label: 'WK',       key: '_wk',   align: 'left',  w: '6%'  },
            { label: 'OPP',      key: '_opp',  align: 'left',  w: '20%' },
            { label: 'FPTS',     key: '_fpts', align: 'right', w: '10%' },
            { label: 'ODR',      key: '_odr',  align: 'right', w: '14%' },
            { label: 'PASS YDS', key: 'passYd', align: 'right', w: '11%' },
            { label: 'PASS TD',  key: 'passTd', align: 'right', w: '9%'  },
            { label: 'INT',      key: 'int',    align: 'right', w: '8%'  },
            { label: 'RUSH YDS', key: 'rushYd', align: 'right', w: '11%' },
            { label: 'RUSH TD',  key: 'rushTd', align: 'right', w: '11%' },
          ],
          RB: [
            { label: 'WK',       key: '_wk',     align: 'left',  w: '6%'  },
            { label: 'OPP',      key: '_opp',    align: 'left',  w: '20%' },
            { label: 'FPTS',     key: '_fpts',   align: 'right', w: '10%' },
            { label: 'ODR',      key: '_odr',    align: 'right', w: '14%' },
            { label: 'ATT',      key: 'rushAtt', align: 'right', w: '8%'  },
            { label: 'RUSH YDS', key: 'rushYd',  align: 'right', w: '11%' },
            { label: 'RUSH TD',  key: 'rushTd',  align: 'right', w: '9%'  },
            { label: 'REC',      key: 'rec',     align: 'right', w: '7%'  },
            { label: 'REC YDS',  key: 'recYd',   align: 'right', w: '11%' },
            { label: '',         key: '_exp',    align: 'right', w: '4%'  },
          ],
          WR: [
            { label: 'WK',   key: '_wk',   align: 'left',  w: '6%'  },
            { label: 'OPP',  key: '_opp',  align: 'left',  w: '22%' },
            { label: 'FPTS', key: '_fpts', align: 'right', w: '12%' },
            { label: 'ODR',  key: '_odr',  align: 'right', w: '16%' },
            { label: 'REC',  key: 'rec',   align: 'right', w: '14%' },
            { label: 'YDS',  key: 'recYd', align: 'right', w: '15%' },
            { label: 'TD',   key: 'recTd', align: 'right', w: '15%' },
          ],
          TE: [
            { label: 'WK',   key: '_wk',   align: 'left',  w: '6%'  },
            { label: 'OPP',  key: '_opp',  align: 'left',  w: '22%' },
            { label: 'FPTS', key: '_fpts', align: 'right', w: '12%' },
            { label: 'ODR',  key: '_odr',  align: 'right', w: '16%' },
            { label: 'REC',  key: 'rec',   align: 'right', w: '14%' },
            { label: 'YDS',  key: 'recYd', align: 'right', w: '15%' },
            { label: 'TD',   key: 'recTd', align: 'right', w: '15%' },
          ],
          DEF: [
            { label: 'WK',      key: '_wk',      align: 'left',  w: '6%'  },
            { label: 'OPP',     key: '_opp',     align: 'left',  w: '20%' },
            { label: 'FPTS',    key: '_fpts',    align: 'right', w: '10%' },
            { label: 'ODR',     key: '_odr',     align: 'right', w: '14%' },
            { label: 'SACKS',   key: 'sacks',    align: 'right', w: '10%' },
            { label: 'INT',     key: 'ints',     align: 'right', w: '10%' },
            { label: 'FUM REC', key: 'fumRec',   align: 'right', w: '10%' },
            { label: 'DEF TD',  key: 'defTd',    align: 'right', w: '10%' },
            { label: 'SAFETY',  key: 'safeties', align: 'right', w: '10%' },
          ],
          K: [
            { label: 'WK',   key: '_wk',   align: 'left',  w: '8%'  },
            { label: 'OPP',  key: '_opp',  align: 'left',  w: '30%' },
            { label: 'FPTS', key: '_fpts', align: 'right', w: '15%' },
            { label: 'ODR',  key: '_odr',  align: 'right', w: '20%' },
            { label: 'PTS',  key: 'pts',   align: 'right', w: '27%' },
          ],
        };
        const tableCols = unitCols[ut] ?? unitCols['QB'];

        const thStyle = (align: 'left' | 'right'): React.CSSProperties => ({
          padding: '7px 6px', fontFamily: 'Oswald,sans-serif', fontSize: 11,
          color: C.muted, fontWeight: 400, textAlign: align,
          letterSpacing: 0.5, textTransform: 'uppercase' as const,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
          background: C.surf2, borderBottom: `1px solid ${C.surf3}`,
        });
        const tdStyle = (align: 'left' | 'right', extra?: React.CSSProperties): React.CSSProperties => ({
          padding: '9px 6px', fontFamily: 'Oswald,sans-serif', fontSize: 11,
          color: C.sub, textAlign: align,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
          ...extra,
        });

        return (
          <div style={{ background: C.surf, borderRadius: 10, border: `1px solid ${C.surf3}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                {tableCols.map((c, i) => <col key={i} style={{ width: c.w }} />)}
              </colgroup>
              <thead>
                <tr>
                  {tableCols.map((c, i) => (
                    <th key={i} style={thStyle(c.align)}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((wk: any) => {
                  const p0        = wk.players?.[0] ?? {};
                  const defStats  = wk.defStats ?? p0;
                  const isPlayoff = wk.week > 11;
                  const canExpand = wk.completed;
                  const isExpanded = expandedWk === wk.week;
                  const multColor = wk.multiplier == null ? C.muted : wk.multiplier > 1 ? C.green : wk.multiplier < 1 ? C.red : C.sub;
                  const fpts = (wk.fpts ?? wk.fantasyPoints) != null
                    ? (wk.fpts ?? wk.fantasyPoints)!.toFixed(1)
                    : wk.opponent != null
                      ? weeklyProj(player.projectedPoints).toFixed(1)
                      : '—';
                  const isBye = wk.isBye === true

                  const statVal = (key: string): string | number => {
                    if (!wk.completed) return '—';
                    const src = ut === 'DEF' ? defStats : p0;
                    const v = src[key];
                    return v != null ? v : '—';
                  };

                  return (
                    <React.Fragment key={wk.week}>
                      <tr
                        onClick={canExpand ? () => toggleWeek(wk.week) : undefined}
                        style={{
                          borderBottom: canExpand && isExpanded ? 'none' : `1px solid ${C.surf3}33`,
                          background: isPlayoff ? 'rgba(139,92,246,.04)' : 'transparent',
                          cursor: canExpand ? 'pointer' : 'default',
                        }}
                      >
                        {tableCols.map((c, i) => {
                          if (c.key === '_wk') return (
                            <td key={i} style={tdStyle('left', { color: isPlayoff ? '#a855f7' : C.muted })}>{wk.week}</td>
                          );
                          if (c.key === '_opp') return (
                            <td key={i} style={tdStyle('left')}>
                              {wk.opponent ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {logos[wk.opponent] && (
                                    <img src={logos[wk.opponent]} alt={wk.opponent}
                                      style={{ width: 16, height: 16, objectFit: 'contain' }}
                                      onError={e => { (e.currentTarget as HTMLImageElement).style.display='none' }} />
                                  )}
                                  <span>
                                    {isBye ? '🛌 BYE' : (wk.isHome ? 'vs ' : '@ ') + (wk.opponent.length > 12 ? wk.opponent.slice(0,12)+'…' : wk.opponent)}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: C.muted }}>—</span>
                              )}
                            </td>
                          );
                          if (c.key === '_fpts') return (
                            <td key={i} style={tdStyle('right', { color: wk.fantasyPoints != null ? C.gold : C.muted, fontFamily: 'Anton,sans-serif', fontWeight: 700, fontSize: 12 })}>{fpts}</td>
                          );
                          if (c.key === '_odr') return (
                            <td key={i} style={tdStyle('right', { color: multColor })}>{wk.multiplier != null ? `×${wk.multiplier.toFixed(1)}` : '—'}</td>
                          );
                          if (c.key === '_exp') return (
                            <td key={i} style={tdStyle('right', { color: C.muted, fontSize: 9 })}>
                              {canExpand ? (isExpanded ? '▲' : '▼') : ''}
                            </td>
                          );
                          return (
                            <td key={i} style={tdStyle('right')}>{statVal(c.key)}</td>
                          );
                        })}
                      </tr>
                      {canExpand && isExpanded && (
                        <tr>
                          <td colSpan={tableCols.length} style={{ padding: 0, borderBottom: `1px solid ${C.surf3}33` }}>
                            <SafeBreakdown week={wk} unit={player.unitType} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Unit Players (season totals) — all unit types */}
      {!loading && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>Unit Players (Season)</div>
          <div style={{ background: C.surf, borderRadius: 10, border: `1px solid ${C.surf3}`, overflow: 'hidden' }}>

            {/* DEF — team season totals */}
            {player.unitType === 'DEF' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, padding: '8px 12px', borderBottom: `1px solid ${C.surf3}`, background: C.surf2 }}>
                  {['SACKS','INT','FUM','TD'].map(h => (
                    <div key={h} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: 'center', letterSpacing: .5 }}>{h}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, padding: '10px 12px' }}>
                  {[defSeason.sacks, defSeason.ints, defSeason.fumRec, defSeason.defTd].map((v, i) => (
                    <div key={i} style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, textAlign: 'center' }}>{v}</div>
                  ))}
                </div>
              </>
            )}

            {/* QB */}
            {player.unitType === 'QB' && sortedPlayers.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 56px 44px 68px 60px', gap: 4, padding: '8px 12px', borderBottom: `1px solid ${C.surf3}`, background: C.surf2 }}>
                  {['PLAYER','PASS YDS','PASS TD','INT','RUSH YDS','RUSH TD'].map(h => (
                    <div key={h} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: h === 'PLAYER' ? 'left' : 'right', letterSpacing: .5 }}>{h}</div>
                  ))}
                </div>
                {sortedPlayers.map((p: any) => (
                  <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 56px 44px 68px 60px', gap: 4, padding: '7px 12px', borderBottom: `1px solid ${C.surf3}22` }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.sub, textAlign: 'right' }}>{p.passYd || 0}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.gold, textAlign: 'right' }}>{p.passTd || 0}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.red, textAlign: 'right' }}>{p.int || 0}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.sub, textAlign: 'right' }}>{p.rushYd || 0}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.gold, textAlign: 'right' }}>{p.rushTd || 0}</div>
                  </div>
                ))}
              </>
            )}

            {/* RB */}
            {player.unitType === 'RB' && sortedPlayers.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 28px 44px 54px 40px 48px', gap: 4, padding: '8px 12px', borderBottom: `1px solid ${C.surf3}`, background: C.surf2 }}>
                  {['RK','PLAYER','#','ATT','YDS','TD','YPC'].map(h => (
                    <div key={h} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: h === 'PLAYER' ? 'left' : 'right', letterSpacing: .5 }}>{h}</div>
                  ))}
                </div>
                {sortedPlayers.map((p: any, idx: number) => {
                  const ypc = (p.rushAtt || 0) > 0 ? (p.rushYd / p.rushAtt).toFixed(1) : '—';
                  return (
                    <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 28px 44px 54px 40px 48px', gap: 4, padding: '7px 12px', borderBottom: `1px solid ${C.surf3}22` }}>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: 'right' }}>RB{idx + 1}</div>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.muted, textAlign: 'right' }}>{jerseyMap[p.name] ?? ''}</div>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.sub, textAlign: 'right' }}>{p.rushAtt || 0}</div>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.sub, textAlign: 'right' }}>{p.rushYd || 0}</div>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.gold, textAlign: 'right' }}>{p.rushTd || 0}</div>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.green, textAlign: 'right' }}>{ypc}</div>
                    </div>
                  );
                })}
              </>
            )}

            {/* WR / TE */}
            {(player.unitType === 'WR' || player.unitType === 'TE') && sortedPlayers.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 28px 44px 54px 40px', gap: 4, padding: '8px 12px', borderBottom: `1px solid ${C.surf3}`, background: C.surf2 }}>
                  {['RK','PLAYER','#','REC','YDS','TD'].map(h => (
                    <div key={h} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: h === 'PLAYER' ? 'left' : 'right', letterSpacing: .5 }}>{h}</div>
                  ))}
                </div>
                {sortedPlayers.map((p: any, idx: number) => (
                  <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 28px 44px 54px 40px', gap: 4, padding: '7px 12px', borderBottom: `1px solid ${C.surf3}22` }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: 'right' }}>{player.unitType}{idx + 1}</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.muted, textAlign: 'right' }}>{jerseyMap[p.name] ?? ''}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.sub, textAlign: 'right' }}>{p.rec || 0}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.sub, textAlign: 'right' }}>{p.recYd || 0}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.gold, textAlign: 'right' }}>{p.recTd || 0}</div>
                  </div>
                ))}
              </>
            )}

            {/* K */}
            {player.unitType === 'K' && sortedPlayers.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 56px', gap: 4, padding: '8px 12px', borderBottom: `1px solid ${C.surf3}`, background: C.surf2 }}>
                  {['PLAYER','#','PTS'].map(h => (
                    <div key={h} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: h === 'PLAYER' ? 'left' : 'right', letterSpacing: .5 }}>{h}</div>
                  ))}
                </div>
                {sortedPlayers.map((p: any) => (
                  <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '1fr 28px 56px', gap: 4, padding: '7px 12px', borderBottom: `1px solid ${C.surf3}22` }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.muted, textAlign: 'right' }}>{jerseyMap[p.name] ?? ''}</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.gold, textAlign: 'right' }}>{p.pts || 0}</div>
                  </div>
                ))}
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

/* ── Waiver Wire Tab ─────────────────────────────────────────── */
function WaiverTab({ league, userId }: { league: any; userId: string | null }) {
  const [allPicks,    setAllPicks]    = useState<any[]>([]);
  const [myPicks,     setMyPicks]     = useState<any[]>([]);
  const [pool,        setPool]        = useState<DraftUnit[]>([]);
  const [unitFilter,  setUnitFilter]  = useState<string>('ALL');
  const [availFilter, setAvailFilter] = useState<'Available' | 'All'>('Available');
  const [search,      setSearch]      = useState('');
  const [viewing,     setViewing]     = useState<any | null>(null);
  const [adding,      setAdding]      = useState<any | null>(null);
  const [dropping,    setDropping]    = useState<any | null>(null);
  const [busy,        setBusy]        = useState(false);
  const [toast,       setToast]       = useState('');
  const [loading,     setLoading]     = useState(true);
  const [logos,       setLogos]       = useState<Record<string, string>>({});
  const [gameCtx,     setGameCtx]     = useState<{ opponentMap: Record<string,string>; gameTimeMap: Record<string,string>; homeMap: Record<string,boolean>; rankMap: Record<string,number> } | null>(null);
  // Derive which schools have already kicked off from gameCtx data
  // gameCtx.gameTimeMap has display strings — we need raw kickoff times.
  // We'll fetch them fresh in confirmAdd via the API instead.
  const [lockedSchools, setLockedSchools] = useState<Set<string>>(new Set());

  const POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF', 'K'];

  useEffect(() => {
    fetch('/api/team-logos').then(r => r.json()).then(d => setLogos(d.logos ?? {})).catch(() => {});
  }, []);

  useEffect(() => {
    const week = league?.current_week ?? 1;
    fetch(`/api/matchup-context?week=${week}&season=2025`)
      .then(r => r.json())
      .then(d => {
        setGameCtx(d);
        // Build locked schools set: any school whose game has passed
        // matchup-context returns firstGameTime as ISO string
        // We re-derive from the schedule endpoint instead for per-school accuracy
      })
      .catch(() => {});

    // Fetch per-school kickoff times to know what's locked
    fetch(`/api/schedule?week=${week}&season=2025`)
      .then(r => r.json())
      .then((games: any[]) => {
        if (!Array.isArray(games)) return;
        const now = new Date();
        const locked = new Set<string>();
        for (const g of games) {
          const kickoff = g.start_time ?? g.game_date;
          if (kickoff && now >= new Date(kickoff)) {
            if (g.home_team) locked.add(g.home_team);
            if (g.away_team) locked.add(g.away_team);
          }
        }
        setLockedSchools(locked);
      })
      .catch(() => {});
  }, [league?.current_week]);

  const allowedSchools: string[] | null = Array.isArray(league?.settings?.allowed_schools)
    ? (league.settings.allowed_schools as string[])
    : null;

  useEffect(() => {
    if (!league?.id || !userId) return;
    async function load() {
      const picksRes = await supabase.from('draft_picks').select('*').eq('league_id', league.id);
      const all = picksRes.data || [];
      setAllPicks(all);

      // Commissioners drafted on behalf of CPU teams too — all those picks share
      // commissioner's user_id.  Use snake-draft index to isolate just their slot.
      const isComm     = userId === league?.commissioner_id;
      const draftOrder: any[] = league?.settings?.draft_order || [];
      const numTeams   = draftOrder.length;
      const myEntry    = draftOrder.find((t: any) => t.userId === userId);
      const slotIdx    = myEntry ? myEntry.slot - 1 : -1;

      let mine: any[] = [];
      if (isComm && numTeams > 0 && slotIdx >= 0) {
        mine = all.filter((p: any) => snakeIdx(p.pick_number, numTeams) === slotIdx);
        if (mine.length === 0) mine = all.filter((p: any) => p.user_id === userId);
      } else {
        mine = all.filter((p: any) => p.user_id === userId);
      }
      setMyPicks(mine);
      setLoading(false);
    }
    load();
  }, [league?.id, userId]);

  useEffect(() => {
    console.log('[WaiverTab] fetching pool, unitFilter:', unitFilter, 'allowedSchools:', allowedSchools);
    fetch(poolUrl(unitFilter, allowedSchools))
      .then(r => r.json())
      .then(data => {
        console.log('[WaiverTab] pool response count:', data?.length);
        setPool(Array.isArray(data) ? data : []);
      });
  }, [unitFilter, allowedSchools]);

  // Key drafted units by school||unitType rather than by id.
  // The draft page stores FULL_POOL entries whose ids include the player name
  // (e.g. "alabama-qb-ty-simpson"), while the player-pool API generates
  // aggregate ids ("alabama-qb"). Using school+unitType as the key is reliable
  // regardless of which path created the pick.
  const draftedKeys = new Set(
    allPicks
      .map((p: any) => {
        const d = p.player_data;
        return d?.school && d?.unitType ? `${d.school}||${d.unitType}` : null;
      })
      .filter(Boolean) as string[],
  );

  const visiblePool = availFilter === 'Available'
    ? pool.filter(p => !draftedKeys.has(`${p.school}||${p.unitType}`))
    : pool;

  const freeAgents = visiblePool
    .filter(p => unitFilter === 'ALL' || p.unitType === unitFilter)
    .filter(p => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return p.school.toLowerCase().includes(q) ||
        (p.playerName ?? '').toLowerCase().includes(q) ||
        p.unitType.toLowerCase().includes(q);
    })
    .sort((a, b) => ((b.avgPerWeek ?? 0) - (a.avgPerWeek ?? 0)) || a.adp - b.adp);

  // Compute position rank from full pool (sorted by projectedPoints desc within each unit type)
  const posRankMap = new Map<string, number>();
  const byUnitType: Record<string, DraftUnit[]> = {};
  for (const p of pool) {
    if (!byUnitType[p.unitType]) byUnitType[p.unitType] = [];
    byUnitType[p.unitType].push(p);
  }
  for (const arr of Object.values(byUnitType)) {
    arr.sort((a, b) => ((b.avgPerWeek ?? 0) - (a.avgPerWeek ?? 0)) || a.adp - b.adp);
    arr.forEach((p, i) => posRankMap.set(`${p.school}||${p.unitType}`, i + 1));
  }

  const ROSTER_MIN    = 9;
  const emptySlots    = Math.max(0, ROSTER_MIN - myPicks.length);
  const canAddNoDrop  = emptySlots > 0;

  async function confirmAdd() {
    if (!adding || !userId) return;
    if (!dropping && !canAddNoDrop) return;
    setBusy(true);
    try {
      const week = league?.current_week ?? 1;
      const res = await fetch('/api/players/drop-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id:    league.id,
          week,
          drop_unit_id: dropping?.player_id ?? dropping?.id ?? null,
          add_unit_id:  adding.id,
          drop_school:  dropping?.player_data?.school ?? null,
          add_school:   adding.school,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setToast(`⚠️ ${result.error ?? 'Failed to add player'}`);
        setTimeout(() => setToast(''), 5000);
        setBusy(false);
        return;
      }
      // Refresh picks from DB
      const { data } = await supabase
        .from('draft_picks')
        .select('*')
        .eq('league_id', league.id);
      const all = data || [];
      setAllPicks(all);
      const isComm2     = userId === league?.commissioner_id;
      const draftOrder2: any[] = league?.settings?.draft_order || [];
      const numTeams2   = draftOrder2.length;
      const myEntry2    = draftOrder2.find((t: any) => t.userId === userId);
      const slotIdx2    = myEntry2 ? myEntry2.slot - 1 : -1;
      let mine2: any[]  = [];
      if (isComm2 && numTeams2 > 0 && slotIdx2 >= 0) {
        mine2 = all.filter((p: any) => snakeIdx(p.pick_number, numTeams2) === slotIdx2);
        if (mine2.length === 0) mine2 = all.filter((p: any) => p.user_id === userId);
      } else {
        mine2 = all.filter((p: any) => p.user_id === userId);
      }
      setMyPicks(mine2);
      setAdding(null);
      setDropping(null);
      const dropMsg = dropping
        ? `, dropped ${dropping.player_data?.playerName || dropping.player_data?.school}`
        : '';
      setToast(`✅ Added ${adding.playerName || adding.school} ${adding.unitType}${dropMsg}`);
      setTimeout(() => setToast(''), 4000);
    } catch (err) {
      setToast('⚠️ Network error — please try again');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
      Loading waiver wire…
    </div>
  );

  /* ── Player detail view ── */
  if (viewing) {
    return (
      <PlayerDetailView
        player={viewing}
        onBack={() => setViewing(null)}
        onAdd={() => { setViewing(null); setAdding(viewing); }}
        canAdd={!!userId && !draftedKeys.has(`${viewing.school}||${viewing.unitType}`)}
      />
    );
  }

  /* ── Add Player screen ── */
  if (adding) {
    const faName = adding.playerName || adding.school;
    const addPosColor = UNIT_COLORS[adding.unitType] ?? C.sub;
    const canConfirm  = dropping != null || canAddNoDrop;
    const sorted = myPicks.slice().sort((a: any, b: any) => {
      const order = ['QB','RB','WR','TE','DEF','K'];
      return order.indexOf(a.player_data?.unitType) - order.indexOf(b.player_data?.unitType);
    });
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', paddingTop: 8 }}>
        {/* Header */}
        <button onClick={() => { setAdding(null); setDropping(null); }} style={{ background: 'none', border: 'none', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, cursor: 'pointer', marginBottom: 12, letterSpacing: 1, padding: 0 }}>
          ← BACK
        </button>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, color: C.text, letterSpacing: 1, marginBottom: 2 }}>Add Player</div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, letterSpacing: .5, marginBottom: 18 }}>
          Add <span style={{ color: C.text }}>{faName}</span> to your roster
        </div>

        {/* Player being added */}
        <div style={{ background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: addPosColor, color: '#fff', fontFamily: 'Oswald,sans-serif', fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '3px 7px', minWidth: 36, textAlign: 'center' }}>
            {adding.unitType}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 14, color: C.text }}>{faName}</div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>{adding.school}</div>
          </div>
          <div style={{ background: C.surf3, color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '3px 7px' }}>BN</div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.green, minWidth: 40, textAlign: 'right' }}>{weeklyProj(adding.projectedPoints ?? 0).toFixed(1)}</div>
        </div>

        {/* Empty slot warning */}
        {canAddNoDrop && (
          <div style={{ background: '#2d2200', border: '1px solid #a07800', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: '#f5c542', letterSpacing: .3 }}>
            You have {emptySlots} empty slot{emptySlots !== 1 ? 's' : ''}. You can add this player without dropping anyone.
          </div>
        )}

        {/* Roster table */}
        {myPicks.length > 0 && (
          <>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1, marginBottom: 6 }}>
              {canAddNoDrop ? 'YOUR ROSTER (optional: select a player to drop)' : 'SELECT A PLAYER TO DROP'}
            </div>
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 52px 36px', gap: 8, padding: '4px 14px', marginBottom: 4 }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>POS</div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>PLAYER</div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1, textAlign: 'right' }}>PTS</div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1, textAlign: 'right' }}>BYE</div>
            </div>
            {sorted.map((pick: any) => {
              const pd = pick.player_data;
              const name = pd?.playerName || pd?.school;
              const posColor = UNIT_COLORS[pd?.unitType] ?? C.sub;
              const isSelected = dropping?.id === pick.id;
              return (
                <div key={pick.id} onClick={() => {
                  const school = pick.player_data?.school;
                  if (school && lockedSchools.has(school)) return; // can't drop locked unit
                  setDropping(isSelected ? null : pick);
                }}
                  style={{ display: 'grid', gridTemplateColumns: '48px 1fr 52px 36px', gap: 8, alignItems: 'center', padding: '10px 14px', marginBottom: 4, background: isSelected ? '#2a0d0d' : C.surf, border: '1px solid ' + (isSelected ? C.red : C.surf3), borderRadius: 8, cursor: 'pointer', transition: 'border-color .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ background: posColor, color: '#fff', fontFamily: 'Oswald,sans-serif', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', textAlign: 'center' }}>
                      {pd?.unitType}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: isSelected ? C.red : C.text }}>{name}</div>
                      {lockedSchools.has(pick.player_data?.school ?? '') && (
                        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.red, letterSpacing: .5 }}>🔒</span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>{pd?.school}</div>
                  </div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.sub, textAlign: 'right' }}>
                    {weeklyProj(pd?.projectedPoints ?? 0).toFixed(1)}
                  </div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: isSelected ? C.red : C.muted, textAlign: 'right', letterSpacing: .5 }}>
                    {isSelected ? 'DROP' : '—'}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Confirm button */}
        <button onClick={confirmAdd} disabled={!canConfirm || busy}
          style={{ marginTop: 20, width: '100%', padding: '14px 0', background: canConfirm ? C.green : C.surf3, border: 'none', borderRadius: 8, fontFamily: 'Anton,sans-serif', fontSize: 15, letterSpacing: 1.5, color: canConfirm ? '#fff' : C.muted, cursor: canConfirm && !busy ? 'pointer' : 'not-allowed', opacity: busy ? .6 : 1, transition: 'background .2s' }}>
          {busy ? 'PROCESSING…' : 'ADD PLAYER'}
        </button>
      </div>
    );
  }

  /* ── Free agent list ── */
  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {toast && (
        <div style={{ background: '#14532d', border: '1px solid ' + C.green, borderRadius: 8, padding: '10px 16px', marginBottom: 14, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.green }}>
          {toast}
        </div>
      )}
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {(['Available', 'All'] as const).map(opt => (
          <button key={opt} onClick={() => setAvailFilter(opt)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid ' + (availFilter === opt ? C.sub : C.surf3), background: availFilter === opt ? C.surf3 : C.surf2, color: availFilter === opt ? C.text : C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: .5 }}>
            {opt}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: C.surf3, flexShrink: 0 }} />
        {POS_FILTERS.map(f => (
          <button key={f} onClick={() => setUnitFilter(f)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid ' + (unitFilter === f ? C.gold : C.surf3), background: unitFilter === f ? C.gold : C.surf2, color: unitFilter === f ? C.bg : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: .5 }}>
            {f}
          </button>
        ))}
        <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 13, pointerEvents: 'none' }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: '100%', background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 8, padding: '6px 12px 6px 28px', color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Header row + count */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['UNIT', 'SCHOOL', 'RANK'].map(h => (
            <span key={h} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase' }}>{h}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase' }}>SEASON PTS</span>
          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', minWidth: 44 }}>ACTION</span>
        </div>
      </div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 0.5, marginBottom: 10 }}>
        Showing {freeAgents.length} of {visiblePool.length} units
      </div>

      {freeAgents.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>
          {availFilter === 'Available' ? 'No available players found.' : 'No players found.'}
        </div>
      )}

      {freeAgents.map(p => {
        const name      = p.playerName || p.school;
        const posColor  = UNIT_COLORS[p.unitType] || C.muted;
        const isDrafted = draftedKeys.has(`${p.school}||${p.unitType}`);
        const posRank   = posRankMap.get(`${p.school}||${p.unitType}`) ?? null;
        const logoUrl   = logos[p.school];
        const opponent  = gameCtx?.opponentMap?.[p.school];
        const gameTime  = gameCtx?.gameTimeMap?.[p.school];
        const isHome    = gameCtx?.homeMap?.[p.school];
        const oppRank   = opponent ? (gameCtx?.rankMap?.[opponent] ?? null) : null;
        const oppLabel  = opponent
          ? `${isHome ? 'vs' : '@'} ${opponent.length > 12 ? opponent.split(' ').pop() : opponent}${oppRank ? ` (${oppRank})` : ''}`
          : 'BYE';

        return (
          <div
            key={p.id}
            onClick={() => setViewing(p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 0,
              background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 10,
              marginBottom: 5, cursor: 'pointer', overflow: 'hidden',
              opacity: isDrafted ? 0.45 : 1, transition: 'border-color .15s',
            }}
            onMouseEnter={e => { if (!isDrafted) (e.currentTarget as HTMLElement).style.borderColor = posColor + '66'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.surf3; }}
          >
            {/* Pos color stripe */}
            <div style={{ width: 4, alignSelf: 'stretch', background: posColor, flexShrink: 0 }} />

            {/* Logo */}
            <div style={{ width: 48, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '0 6px' }}>
              {logoUrl ? (
                <img src={logoUrl} alt={p.school} style={{ width: 36, height: 36, objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: posColor + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 10, color: posColor }}>
                  {p.school.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            {/* Main info */}
            <div style={{ flex: 1, minWidth: 0, padding: '8px 4px 8px 0' }}>
              {/* Pos badge + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  height: 18, minWidth: 30, padding: '0 5px', borderRadius: 4,
                  background: posColor, fontFamily: 'Anton,sans-serif', fontSize: 9,
                  color: '#fff', flexShrink: 0, letterSpacing: 0.5,
                }}>{p.unitType}</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: '#7eb8f7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </div>
              </div>
              {/* School + rank badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, letterSpacing: 0.3 }}>
                  {p.unitType} · {p.school}
                </span>
                {posRank && (() => {
                  const rc = posRank <= 3 ? '#f5a623' : posRank <= 10 ? '#15c678' : posRank <= 25 ? '#7a92aa' : C.muted;
                  return (
                    <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 10, color: rc, background: rc + '22', border: `1px solid ${rc}44`, borderRadius: 4, padding: '1px 5px' }}>
                      #{posRank}
                    </span>
                  );
                })()}
              </div>
              {/* Game info */}
              {gameCtx && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: opponent ? C.muted : C.red, letterSpacing: 0.3 }}>
                    {oppLabel}
                  </span>
                  {gameTime && (
                    <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 0.3 }}>
                      {gameTime}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Avg/wk */}
            <div style={{ textAlign: 'center', padding: '0 12px', flexShrink: 0 }}>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.gold }}>
                {(p.avgPerWeek ?? 0) > 0
                  ? p.avgPerWeek!.toFixed(1)
                  : weeklyProj(p.projectedPoints).toFixed(1)}
              </div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>
                avg/wk
              </div>
            </div>

            {/* Action */}
            <div style={{ padding: '0 10px 0 4px', flexShrink: 0 }}>
              {isDrafted ? (
                <div style={{ padding: '5px 8px', background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 6, fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700, color: C.muted, textAlign: 'center' }}>DRAFTED</div>
              ) : lockedSchools.has(p.school) ? (
                <div style={{ padding: '5px 8px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700, color: C.red, textAlign: 'center', letterSpacing: .5 }}>🔒 LOCKED</div>
              ) : (
                <button onClick={e => { e.stopPropagation(); setAdding(p); }} style={{ padding: '6px 10px', background: 'rgba(21,198,120,.12)', border: '1px solid rgba(21,198,120,.35)', borderRadius: 6, fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700, color: C.green, cursor: 'pointer' }}>+ ADD</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Placeholder tabs ───────────────────────────────────────── */
function PlaceholderTab({ label, icon }: { label: string; icon: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 12, opacity: .6 }}>
      <div style={{ fontSize: 44 }}>{icon}</div>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.surf3, letterSpacing: 1 }}>Coming soon</div>
    </div>
  );
}

/* ── League Ranks Tab ────────────────────────────────────────── */
const SEED_COLORS: Record<number, string> = {
  1: '#f1c40f', 2: '#c0c0c0', 3: '#cd7f32',
};

function buildRoundRobin(members: any[], weekNum: number): [any, any][] {
  const n = members.length;
  if (n < 2) return [];
  const isOdd = n % 2 !== 0;
  const t: (any | null)[] = isOdd ? [...members, null] : [...members];
  const total = t.length;
  const r = (weekNum - 1) % (total - 1);
  const rotating = t.slice(1);
  const rotated = [...rotating.slice(r), ...rotating.slice(0, r)];
  const round = [t[0], ...rotated];
  const pairs: [any, any][] = [];
  for (let i = 0; i < total / 2; i++) {
    const a = round[i];
    const b = round[total - 1 - i];
    if (a && b) pairs.push([a, b]);
  }
  return pairs;
}

function BkMatchup({
  teamA, seedA, teamB, seedB, week, allScores, winner, isBye,
}: {
  teamA: any | null; seedA?: number;
  teamB: any | null; seedB?: number;
  week: number; allScores: Record<string, Record<number, number>>;
  winner: 'a' | 'b' | null; isBye?: boolean;
}) {
  const scoreA = teamA ? (allScores[teamA.id]?.[week] ?? null) : null;
  const scoreB = (!isBye && teamB) ? (allScores[teamB.id]?.[week] ?? null) : null;

  function TeamRow({ team, seed, isWinner, score }: {
    team: any | null; seed?: number; isWinner: boolean; score: number | null;
  }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px',
        background: isWinner ? C.surf3 : 'transparent',
      }}>
        {seed != null && (
          <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 10, color: SEED_COLORS[seed] ?? C.muted, minWidth: 12, flexShrink: 0 }}>{seed}</span>
        )}
        <span style={{
          flex: 1, fontFamily: 'Oswald,sans-serif', fontSize: 11,
          color: team ? (isWinner ? C.text : C.sub) : C.muted,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {team?.team_name ?? 'TBD'}
        </span>
        {score != null && (
          <span style={{ fontFamily: 'Anton,sans-serif', fontSize: isWinner ? 14 : 11, color: isWinner ? C.gold : C.muted, flexShrink: 0 }}>
            {score.toFixed(1)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: C.surf2, borderRadius: 8, border: `1px solid ${C.surf3}`, overflow: 'hidden', minWidth: 190 }}>
      <TeamRow team={teamA} seed={seedA} isWinner={winner === 'a'} score={scoreA} />
      <div style={{ height: 1, background: C.surf3 }} />
      {isBye ? (
        <div style={{ padding: '6px 12px', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: .5 }}>BYE</div>
      ) : (
        <TeamRow team={teamB} seed={seedB} isWinner={winner === 'b'} score={scoreB} />
      )}
    </div>
  );
}

/* ── Trade Tab ───────────────────────────────────────────────── */
function TradeTab({ league, userId, members }: { league: any; userId: string | null; members: any[] }) {
  type TView = 'teams' | 'build' | 'inbox'
  const [view, setView] = useState<TView>('teams')
  const [targetTeam, setTargetTeam] = useState<any>(null)
  const [allPicks, setAllPicks] = useState<any[]>([])
  const [trades, setTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [offer, setOffer] = useState<Set<string>>(new Set())
  const [request, setRequest] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const draftOrder: any[] = league?.settings?.draft_order ?? []
  const numTeams = draftOrder.length
  const myEntry = draftOrder.find((t: any) => t.userId === userId)
  const mySlotIdx = myEntry ? myEntry.slot - 1 : -1

  useEffect(() => {
    if (!league?.id || !userId) return
    async function load() {
      const [{ data: picksData }, { data: tradesData }] = await Promise.all([
        supabase.from('draft_picks').select('*').eq('league_id', league.id).order('pick_number'),
        supabase.from('trades').select('*').eq('league_id', league.id)
          .or(`proposer_id.eq.${userId},receiver_id.eq.${userId}`)
          .order('created_at', { ascending: false }),
      ])
      setAllPicks(picksData ?? [])
      setTrades(tradesData ?? [])
      setLoading(false)
    }
    load()
  }, [league?.id, userId])

  function getTeamPicks(slotIdx: number): any[] {
    if (numTeams === 0) return []
    return allPicks.filter(p => snakeIdx(p.pick_number, numTeams) === slotIdx)
  }

  function getMyPicks(): any[] {
    if (mySlotIdx < 0) return allPicks.filter((p: any) => p.user_id === userId)
    return getTeamPicks(mySlotIdx)
  }

  async function submitTrade() {
    if (!userId || offer.size === 0 || request.size === 0 || !targetTeam) return
    setSubmitting(true)
    const { error } = await supabase.from('trades').insert({
      league_id: league.id,
      proposer_id: userId,
      receiver_id: targetTeam.userId,
      offer_pick_ids: Array.from(offer),
      request_pick_ids: Array.from(request),
      status: 'pending',
    })
    setSubmitting(false)
    if (!error) {
      setToast('Trade sent!')
      setTimeout(() => setToast(''), 3000)
      setOffer(new Set())
      setRequest(new Set())
      setView('inbox')
      const { data } = await supabase.from('trades').select('*').eq('league_id', league.id)
        .or(`proposer_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false })
      setTrades(data ?? [])
    }
  }

  async function respondTrade(tradeId: string, status: 'accepted' | 'declined') {
    const trade = trades.find(t => t.id === tradeId)
    if (!trade) return
    if (status === 'accepted') {
      await Promise.all([
        ...trade.offer_pick_ids.map((id: string) =>
          supabase.from('draft_picks').update({ user_id: userId }).eq('id', id)
        ),
        ...trade.request_pick_ids.map((id: string) =>
          supabase.from('draft_picks').update({ user_id: trade.proposer_id }).eq('id', id)
        ),
        supabase.from('trades').update({ status: 'accepted' }).eq('id', tradeId),
      ])
      const { data } = await supabase.from('draft_picks').select('*').eq('league_id', league.id).order('pick_number')
      setAllPicks(data ?? [])
    } else {
      await supabase.from('trades').update({ status }).eq('id', tradeId)
    }
    setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, status } : t))
  }

  const pendingIncoming = trades.filter(t => t.receiver_id === userId && t.status === 'pending')
  const pendingOutgoing = trades.filter(t => t.proposer_id === userId && t.status === 'pending')
  const completed = trades.filter(t => t.status !== 'pending')
  const otherTeams = draftOrder.filter((t: any) => t.userId !== userId && t.type === 'human')

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
      Loading trades…
    </div>
  )

  // ── TRADE BUILDER ─────────────────────────────────────────
  if (view === 'build' && targetTeam) {
    const myPicks = getMyPicks().sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0))
    const theirSlotIdx = targetTeam.slot - 1
    const theirPicks = getTeamPicks(theirSlotIdx).sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0))

    return (
      <div style={{ maxWidth: 700 }}>
        <button onClick={() => { setView('teams'); setOffer(new Set()); setRequest(new Set()) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, padding: '0 0 16px 0' }}>
          ← Back
        </button>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 4 }}>
          Propose Trade
        </div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, marginBottom: 20 }}>
          {myEntry?.teamName ?? 'You'} → {targetTeam.teamName}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          {/* You offer */}
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>
              You offer ({offer.size})
            </div>
            {myPicks.length === 0 && (
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted }}>No players on your roster</div>
            )}
            {myPicks.map((pick: any) => {
              const checked = offer.has(pick.id)
              const pos = pick.player_data?.unitType as string
              const col = UNIT_COLORS[pos] ?? C.muted
              return (
                <div key={pick.id} onClick={() => setOffer(prev => { const n = new Set(prev); n.has(pick.id) ? n.delete(pick.id) : n.add(pick.id); return n })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', marginBottom: 4, background: checked ? 'rgba(245,166,35,.1)' : C.surf, border: `1px solid ${checked ? C.gold : C.surf3}`, borderRadius: 8, cursor: 'pointer', transition: 'all .12s' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${checked ? C.gold : C.surf3}`, background: checked ? C.gold : 'none', flexShrink: 0 }} />
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: checked ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pick.player_data?.playerName || pick.player_data?.school}
                    </div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>{pos} · {weeklyProj(pick.player_data?.projectedPoints ?? 0).toFixed(1)} pts/wk</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* You receive */}
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.green, textTransform: 'uppercase', marginBottom: 8 }}>
              You receive ({request.size})
            </div>
            {theirPicks.length === 0 && (
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted }}>No players on their roster</div>
            )}
            {theirPicks.map((pick: any) => {
              const checked = request.has(pick.id)
              const pos = pick.player_data?.unitType as string
              const col = UNIT_COLORS[pos] ?? C.muted
              return (
                <div key={pick.id} onClick={() => setRequest(prev => { const n = new Set(prev); n.has(pick.id) ? n.delete(pick.id) : n.add(pick.id); return n })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', marginBottom: 4, background: checked ? 'rgba(21,198,120,.08)' : C.surf, border: `1px solid ${checked ? C.green : C.surf3}`, borderRadius: 8, cursor: 'pointer', transition: 'all .12s' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${checked ? C.green : C.surf3}`, background: checked ? C.green : 'none', flexShrink: 0 }} />
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: checked ? C.green : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pick.player_data?.playerName || pick.player_data?.school}
                    </div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>{pos} · {weeklyProj(pick.player_data?.projectedPoints ?? 0).toFixed(1)} pts/wk</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Value bar */}
        {(offer.size > 0 || request.size > 0) && (() => {
          const offerVal = Array.from(offer).reduce((s, id) => {
            const p = allPicks.find(x => x.id === id)
            return s + weeklyProj(p?.player_data?.projectedPoints ?? 0)
          }, 0)
          const requestVal = Array.from(request).reduce((s, id) => {
            const p = allPicks.find(x => x.id === id)
            return s + weeklyProj(p?.player_data?.projectedPoints ?? 0)
          }, 0)
          const total = offerVal + requestVal || 1
          const offerPct = Math.round((offerVal / total) * 100)
          const requestPct = 100 - offerPct
          const fair = Math.abs(offerPct - 50) <= 10
          return (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.gold }}>{offerPct}% your value</span>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: fair ? C.green : C.muted }}>{fair ? '⚖ Fair trade' : '⚠ Uneven'}</span>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.green }}>{requestPct}% their value</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: C.surf3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${offerPct}%`, background: `linear-gradient(90deg, ${C.gold}, ${C.green})`, borderRadius: 3, transition: 'width .3s ease' }} />
              </div>
            </div>
          )
        })()}

        <button onClick={submitTrade} disabled={offer.size === 0 || request.size === 0 || submitting}
          style={{ width: '100%', padding: '14px', background: offer.size > 0 && request.size > 0 ? C.gold : C.surf3, border: 'none', borderRadius: 8, fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: offer.size > 0 && request.size > 0 ? C.bg : C.muted, cursor: offer.size > 0 && request.size > 0 ? 'pointer' : 'not-allowed', textTransform: 'uppercase', transition: 'all .15s' }}>
          {submitting ? 'Sending…' : 'Send Trade Offer'}
        </button>
      </div>
    )
  }

  // ── MAIN VIEW ─────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680 }}>
      {toast && (
        <div style={{ background: '#14532d', border: `1px solid ${C.green}`, borderRadius: 8, padding: '10px 16px', marginBottom: 14, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.green }}>
          {toast}
        </div>
      )}

      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['teams', 'inbox'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '7px 18px', borderRadius: 6, border: `1px solid ${view === v ? C.gold : C.surf3}`, background: view === v ? 'rgba(245,166,35,.1)' : C.surf2, color: view === v ? C.gold : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, cursor: 'pointer', textTransform: 'uppercase' }}>
            {v === 'teams' ? 'New Trade' : `Inbox${pendingIncoming.length > 0 ? ` (${pendingIncoming.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* New Trade — team picker */}
      {view === 'teams' && (
        <div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 12 }}>
            Select a team to trade with
          </div>
          {otherTeams.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>
              No other human teams to trade with.
            </div>
          )}
          {otherTeams.map((team: any) => {
            const slotIdx = team.slot - 1
            const teamPicks = getTeamPicks(slotIdx)
            const bestPick = [...teamPicks].sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0))[0]
            return (
              <div key={team.userId} onClick={() => { setTargetTeam(team); setView('build') }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', marginBottom: 8, background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, cursor: 'pointer', transition: 'border-color .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = C.gold + '66'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = C.surf3}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.sub, flexShrink: 0 }}>
                  {(team.teamName || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 14, color: C.text, fontWeight: 600 }}>{team.teamName}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {teamPicks.length} players · Best: {bestPick ? (bestPick.player_data?.playerName || bestPick.player_data?.school) : '—'}
                  </div>
                </div>
                <div style={{ color: C.muted, fontSize: 18 }}>›</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Inbox */}
      {view === 'inbox' && (
        <div>
          {trades.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>
              No trades yet.
            </div>
          )}

          {pendingIncoming.length > 0 && (
            <>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 10 }}>
                Incoming ({pendingIncoming.length})
              </div>
              {pendingIncoming.map(trade => {
                const fromTeam = draftOrder.find((t: any) => t.userId === trade.proposer_id)
                const offered = allPicks.filter(p => trade.offer_pick_ids.includes(p.id))
                const requested = allPicks.filter(p => trade.request_pick_ids.includes(p.id))
                return (
                  <div key={trade.id} style={{ background: C.surf, border: `1px solid rgba(245,166,35,.3)`, borderRadius: 10, padding: '16px 18px', marginBottom: 12 }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.gold, marginBottom: 12 }}>
                      From {fromTeam?.teamName ?? 'Unknown'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>They offer</div>
                        {offered.map(p => (
                          <div key={p.id} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 3 }}>
                            {p.player_data?.playerName || p.player_data?.school}
                            <span style={{ color: C.muted, fontSize: 10 }}> · {p.player_data?.unitType}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>They want</div>
                        {requested.map(p => (
                          <div key={p.id} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 3 }}>
                            {p.player_data?.playerName || p.player_data?.school}
                            <span style={{ color: C.muted, fontSize: 10 }}> · {p.player_data?.unitType}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => respondTrade(trade.id, 'accepted')}
                        style={{ flex: 1, padding: '10px', background: 'rgba(21,198,120,.12)', border: `1px solid rgba(21,198,120,.4)`, borderRadius: 7, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, color: C.green }}>
                        ✓ Accept
                      </button>
                      <button onClick={() => respondTrade(trade.id, 'declined')}
                        style={{ flex: 1, padding: '10px', background: 'rgba(240,58,90,.08)', border: `1px solid rgba(240,58,90,.25)`, borderRadius: 7, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, color: C.red }}>
                        ✕ Decline
                      </button>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {pendingOutgoing.length > 0 && (
            <>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.sub, textTransform: 'uppercase', marginBottom: 10, marginTop: pendingIncoming.length > 0 ? 20 : 0 }}>
                Outgoing ({pendingOutgoing.length})
              </div>
              {pendingOutgoing.map(trade => {
                const toTeam = draftOrder.find((t: any) => t.userId === trade.receiver_id)
                const offered = allPicks.filter(p => trade.offer_pick_ids.includes(p.id))
                const requested = allPicks.filter(p => trade.request_pick_ids.includes(p.id))
                return (
                  <div key={trade.id} style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '16px 18px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub }}>To {toTeam?.teamName ?? 'Unknown'}</div>
                      <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.gold, background: 'rgba(245,166,35,.1)', padding: '2px 8px', borderRadius: 4 }}>PENDING</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>You offered</div>
                        {offered.map(p => (
                          <div key={p.id} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 3 }}>
                            {p.player_data?.playerName || p.player_data?.school}
                            <span style={{ color: C.muted, fontSize: 10 }}> · {p.player_data?.unitType}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>You requested</div>
                        {requested.map(p => (
                          <div key={p.id} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 3 }}>
                            {p.player_data?.playerName || p.player_data?.school}
                            <span style={{ color: C.muted, fontSize: 10 }}> · {p.player_data?.unitType}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {completed.length > 0 && (
            <>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10, marginTop: 20 }}>
                History
              </div>
              {completed.map(trade => {
                const isProposer = trade.proposer_id === userId
                const otherTeam = draftOrder.find((t: any) => t.userId === (isProposer ? trade.receiver_id : trade.proposer_id))
                const accepted = trade.status === 'accepted'
                return (
                  <div key={trade.id} style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '12px 18px', marginBottom: 8, opacity: 0.7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub }}>
                        {isProposer ? 'To' : 'From'} {otherTeam?.teamName ?? 'Unknown'}
                      </div>
                      <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: accepted ? C.green : C.red, background: accepted ? 'rgba(21,198,120,.1)' : 'rgba(240,58,90,.1)', padding: '2px 8px', borderRadius: 4 }}>
                        {trade.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function LeagueRanksTab({
  league, members, userId,
}: {
  league: any; members: any[]; userId: string | null;
}) {
  const [allScores,    setAllScores]    = useState<Record<string, Record<number, number>>>({});
  const [loading,      setLoading]      = useState(true);
  const [calculating,  setCalculating]  = useState(false);
  const [calcMsg,      setCalcMsg]      = useState('');

  const currentWeek    = league?.current_week ?? 1;
  const isCommissioner = league?.commissioner_id === userId;

  // Build combined team list: human members + CPU teams (from draft_order order)
  // Use draft_order to preserve draft-slot ordering for the round-robin schedule.
  const draftOrder: any[] = league?.settings?.draft_order ?? [];
  const cpuWeeklyScores: Record<string, Record<number, number>> =
    league?.settings?.cpu_weekly_scores ?? {};

  // Unified team objects — id is user_id for humans, 'cpu:Name' for CPUs
  const allTeams: { id: string; team_name: string; isCpu: boolean }[] = draftOrder.length > 0
    ? draftOrder.map((dt: any) => {
        if (dt.type === 'human') {
          const m = members.find((x: any) => x.user_id === dt.userId);
          return { id: dt.userId, team_name: m?.team_name ?? dt.teamName, isCpu: false };
        }
        return { id: `cpu:${dt.teamName}`, team_name: dt.teamName, isCpu: true };
      })
    : [
        ...members.map((m: any) => ({ id: m.user_id, team_name: m.team_name, isCpu: false })),
        ...(league?.settings?.cpu_teams ?? []).map((n: string) => ({ id: `cpu:${n}`, team_name: n, isCpu: true })),
      ];

  // Merge human scores (weekly_scores table) + CPU scores (league.settings)
  async function loadScores() {
    setLoading(true);
    const { data } = await supabase
      .from('weekly_scores')
      .select('user_id, week, score')
      .eq('league_id', league?.id ?? '');
    const map: Record<string, Record<number, number>> = {};
    for (const row of (data ?? []) as any[]) {
      if (!map[row.user_id]) map[row.user_id] = {};
      map[row.user_id][row.week] = parseFloat(row.score) || 0;
    }
    // Merge CPU scores
    for (const [teamName, weekMap] of Object.entries(cpuWeeklyScores)) {
      const key = `cpu:${teamName}`;
      map[key] = {};
      for (const [w, sc] of Object.entries(weekMap as Record<string, number>)) {
        map[key][Number(w)] = sc;
      }
    }
    setAllScores(map);
    setLoading(false);
  }

  useEffect(() => {
    if (league?.id) loadScores();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.id]);

  async function recalculate() {
    if (!league?.id) return;
    setCalculating(true);
    setCalcMsg('Fetching all 11 weeks from CFBD…');
    try {
      const res = await fetch('/api/calculate-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: league.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setCalcMsg(`Done — ${json.humanRows + (json.cpuTeams ?? 0) * 11} scores saved.`);
      // Reload page data so league.settings has fresh cpu_weekly_scores
      window.location.reload();
    } catch (e: any) {
      setCalcMsg(`Error: ${e.message}`);
    } finally {
      setCalculating(false);
    }
  }

  // Build W-L standings using allTeams + combined allScores
  const record: Record<string, { wins: number; losses: number; pf: number }> = {};
  for (const t of allTeams) record[t.id] = { wins: 0, losses: 0, pf: 0 };

  // Build round-robin schedule using the allTeams array (preserves draft_order)
  const regWeeks = 11; // 2025 season complete — always count all regular-season weeks
  for (let w = 1; w <= regWeeks; w++) {
    const pairs = buildRoundRobin(allTeams, w);
    for (const [a, b] of pairs) {
      const sa = allScores[a.id]?.[w] ?? 0;
      const sb = allScores[b.id]?.[w] ?? 0;
      record[a.id].pf += sa;
      record[b.id].pf += sb;
      if (sa > sb)      { record[a.id].wins++;  record[b.id].losses++; }
      else if (sb > sa) { record[b.id].wins++;  record[a.id].losses++; }
    }
  }

  const standings = [...allTeams]
    .filter(t => record[t.id])
    .map(t => ({ ...t, ...record[t.id] }))
    .sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : b.pf - a.pf);

  // Bracket
  const PLAY_IN = 12, SEMI = 13, CHAMP = 14;
  const s = (seed: number) => standings[seed - 1] as any | undefined;

  function matchResult(a: any, b: any, week: number): 'a' | 'b' | null {
    if (!a || !b) return null;
    const sa = allScores[a.id]?.[week] ?? 0;
    const sb = allScores[b.id]?.[week] ?? 0;
    if (sa === 0 && sb === 0) return null; // no scores yet → TBD
    if (sa > sb) return 'a';
    if (sb > sa) return 'b';
    return null;
  }

  const pi36     = matchResult(s(3), s(6), PLAY_IN);
  const pi45     = matchResult(s(4), s(5), PLAY_IN);
  const semi1Opp = pi45 === 'a' ? s(4) : pi45 === 'b' ? s(5) : null;
  const semi2Opp = pi36 === 'a' ? s(3) : pi36 === 'b' ? s(6) : null;
  const semi1    = matchResult(s(1), semi1Opp, SEMI);
  const semi2    = matchResult(s(2), semi2Opp, SEMI);
  const champA   = semi1 === 'a' ? s(1) : semi1 === 'b' ? semi1Opp : null;
  const champB   = semi2 === 'a' ? s(2) : semi2 === 'b' ? semi2Opp : null;
  const champRes = matchResult(champA, champB, CHAMP);
  const champion = champRes === 'a' ? champA : champRes === 'b' ? champB : null;

  // 3rd / 5th place
  const loser36   = pi36  === 'a' ? s(6) : pi36  === 'b' ? s(3) : null;
  const loser45   = pi45  === 'a' ? s(5) : pi45  === 'b' ? s(4) : null;
  const loserS1   = semi1 === 'a' ? semi1Opp : semi1 === 'b' ? s(1) : null;
  const loserS2   = semi2 === 'a' ? semi2Opp : semi2 === 'b' ? s(2) : null;
  const place5Res = matchResult(loser36, loser45, CHAMP);
  const place3Res = matchResult(loserS1, loserS2, CHAMP);

  // Consolation bracket (seeds 7+)
  const cTeams  = standings.slice(6);
  const cr1A    = cTeams[0]  ?? null;
  const cr1B    = cTeams.length >= 2 ? cTeams[cTeams.length - 1] : null;
  const cr2A    = cTeams.length >= 3 ? cTeams[1] : null;
  const cr2B    = cTeams.length >= 4 ? cTeams[cTeams.length - 2] : null;
  const cR1Res1 = matchResult(cr1A, cr1B, PLAY_IN);
  const cR1Res2 = matchResult(cr2A, cr2B, PLAY_IN);
  const c7A     = cR1Res1 === 'a' ? cr1A : cR1Res1 === 'b' ? cr1B : null;
  const c7B     = cR1Res2 === 'a' ? cr2A : cR1Res2 === 'b' ? cr2B : null;
  const c9A     = cR1Res1 === 'a' ? cr1B : cR1Res1 === 'b' ? cr1A : null;
  const c9B     = cR1Res2 === 'a' ? cr2B : cR1Res2 === 'b' ? cr2A : null;
  const cFin7   = matchResult(c7A, c7B, SEMI);
  const cFin9   = matchResult(c9A, c9B, SEMI);

  const showBracket = standings.length >= 1;

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted }}>
      Loading…
    </div>
  );

  function RoundHdr({ label, sub }: { label: string; sub: string }) {
    return (
      <div style={{ marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1, color: C.text, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 2 }}>({sub})</div>
      </div>
    );
  }

  const COL_W = 200;
  const ARROW_W = 28;

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>

      {/* Header + recalculate button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
          League Standings
        </div>
        {isCommissioner && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button
              onClick={recalculate}
              disabled={calculating}
              style={{
                padding: '6px 14px', borderRadius: 6, cursor: calculating ? 'default' : 'pointer',
                background: calculating ? C.surf3 : 'rgba(212,168,40,.14)',
                border: '1px solid ' + (calculating ? C.surf3 : C.gold),
                fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
                color: calculating ? C.muted : C.gold,
              }}
            >
              {calculating ? 'Calculating…' : 'Recalculate Standings'}
            </button>
            {calcMsg && (
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.sub, letterSpacing: .5 }}>{calcMsg}</div>
            )}
          </div>
        )}
      </div>

      {/* Standings table */}
      <div style={{ background: C.surf, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.surf3}`, marginBottom: 36 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '28px 1fr 60px 60px 90px',
          gap: 8, padding: '8px 16px', borderBottom: `1px solid ${C.surf3}`,
          fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1,
          color: C.muted, textTransform: 'uppercase',
        }}>
          <div>#</div><div>Team</div>
          <div style={{ textAlign: 'right' }}>W</div>
          <div style={{ textAlign: 'right' }}>L</div>
          <div style={{ textAlign: 'right' }}>PF</div>
        </div>

        {standings.map((team, idx) => {
          const seed      = idx + 1;
          const isUser    = !team.isCpu && team.id === userId;
          const hasBye    = seed <= 2 && standings.length >= 6;
          const hasPlayIn = seed >= 3 && seed <= 6 && standings.length >= 6;
          return (
            <div key={team.id} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 60px 60px 90px',
              gap: 8, padding: '10px 16px',
              borderBottom: idx < standings.length - 1 ? `1px solid ${C.surf3}` : 'none',
              background: isUser ? C.surf2 : 'transparent',
            }}>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: SEED_COLORS[seed] ?? C.muted, paddingTop: 1 }}>
                {seed}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text }}>{team.team_name}</span>
                  {team.isCpu && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: .5, color: C.muted, background: C.surf3, borderRadius: 3, padding: '1px 4px' }}>CPU</span>}
                </div>
                {hasBye    && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#2ecc71', marginTop: 1 }}>BYE · Wk 12</div>}
                {hasPlayIn && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.gold,    marginTop: 1 }}>Play-in · Wk 12</div>}
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'Anton,sans-serif', fontSize: 14, color: '#2ecc71', paddingTop: 1 }}>{team.wins}</div>
              <div style={{ textAlign: 'right', fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.muted,   paddingTop: 1 }}>{team.losses}</div>
              <div style={{ textAlign: 'right', fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.sub,     paddingTop: 1 }}>
                {team.pf > 0 ? team.pf.toFixed(1) : '—'}
              </div>
            </div>
          );
        })}

        {standings.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted }}>
            No members yet
          </div>
        )}
      </div>

      {/* Playoff Bracket */}
      {showBracket && (
        <>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 20 }}>
            Playoff Bracket
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 12 }}>

            {/* ── Wk 12 Play-in ── */}
            <div style={{ width: COL_W, flexShrink: 0 }}>
              <RoundHdr label="Round 1" sub="Week 12" />
              {/* Seeds 1 & 2 with BYE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <BkMatchup teamA={s(1)} seedA={1} teamB={null} week={PLAY_IN} allScores={allScores} winner={null} isBye />
                <BkMatchup teamA={s(3)} seedA={3} teamB={s(6)} seedB={6} week={PLAY_IN} allScores={allScores} winner={pi36} />
                <BkMatchup teamA={s(4)} seedA={4} teamB={s(5)} seedB={5} week={PLAY_IN} allScores={allScores} winner={pi45} />
                <BkMatchup teamA={s(2)} seedA={2} teamB={null} week={PLAY_IN} allScores={allScores} winner={null} isBye />
              </div>
            </div>

            {/* Arrow */}
            <div style={{ width: ARROW_W, flexShrink: 0, textAlign: 'center', color: C.muted, fontSize: 14, paddingTop: 160 }}>→</div>

            {/* ── Wk 13 Semis ── */}
            <div style={{ width: COL_W, flexShrink: 0 }}>
              <RoundHdr label="Semifinals" sub="Week 13" />
              <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 40, gap: 93 }}>
                <BkMatchup teamA={s(1)} seedA={1} teamB={semi1Opp} week={SEMI} allScores={allScores} winner={semi1} />
                <BkMatchup teamA={s(2)} seedA={2} teamB={semi2Opp} week={SEMI} allScores={allScores} winner={semi2} />
              </div>
            </div>

            {/* Arrow */}
            <div style={{ width: ARROW_W, flexShrink: 0, textAlign: 'center', color: C.muted, fontSize: 14, paddingTop: 160 }}>→</div>

            {/* ── Wk 14 Championship ── */}
            <div style={{ width: COL_W, flexShrink: 0 }}>
              <RoundHdr label="Championship" sub="Week 14" />
              <div style={{ paddingTop: 125 }}>
                <BkMatchup teamA={champA} teamB={champB} week={CHAMP} allScores={allScores} winner={champRes} />
                {champion && (
                  <div style={{ marginTop: 14, padding: '10px 14px', background: C.surf, borderRadius: 8, border: `1px solid ${C.gold}33`, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.gold, textTransform: 'uppercase' }}>Champion</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 14, color: C.gold, marginTop: 4, fontWeight: 600 }}>{champion.team_name}</div>
                  </div>
                )}
              </div>
              {standings.length >= 6 && (
                <>
                  <div style={{ marginTop: 18, marginBottom: 4, fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>3rd Place</div>
                  <BkMatchup teamA={loserS1} teamB={loserS2} week={CHAMP} allScores={allScores} winner={place3Res} />
                  <div style={{ marginTop: 10, marginBottom: 4, fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>5th Place</div>
                  <BkMatchup teamA={loser36} teamB={loser45} week={CHAMP} allScores={allScores} winner={place5Res} />
                </>
              )}
            </div>

          </div>

          <div style={{ marginTop: 12, padding: '8px 14px', background: C.surf, borderRadius: 8, border: `1px solid ${C.surf3}` }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
              Seeds 1 & 2 receive a first-round bye and advance directly to Week 13 Semifinals.
            </div>
          </div>

          {/* ── Consolation Bracket (seeds 7+) ── */}
          {cTeams.length >= 2 && (
            <>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 20, marginTop: 40 }}>
                Consolation Bracket
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 12 }}>

                {/* ── Wk 12 Round 1 (only when 3+ consolation teams) ── */}
                {cTeams.length >= 3 && (
                  <>
                    <div style={{ width: COL_W, flexShrink: 0 }}>
                      <RoundHdr label="Round 1" sub="Week 12" />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <BkMatchup
                          teamA={cr1A} seedA={7}
                          teamB={cr1B} seedB={6 + cTeams.length}
                          week={PLAY_IN} allScores={allScores} winner={cR1Res1}
                        />
                        {cr2A && cr2B && (
                          <BkMatchup
                            teamA={cr2A} seedA={8}
                            teamB={cr2B} seedB={6 + cTeams.length - 1}
                            week={PLAY_IN} allScores={allScores} winner={cR1Res2}
                          />
                        )}
                      </div>
                    </div>
                    <div style={{ width: ARROW_W, flexShrink: 0, textAlign: 'center', color: C.muted, fontSize: 14, paddingTop: 60 }}>→</div>
                  </>
                )}

                {/* ── Finals (Wk 13) ── */}
                <div style={{ width: COL_W, flexShrink: 0, paddingTop: cTeams.length >= 3 ? 32 : 0 }}>
                  <RoundHdr label="Finals" sub="Week 13" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ marginBottom: 4, fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>7th Place</div>
                      {cTeams.length >= 3
                        ? <BkMatchup teamA={c7A} teamB={c7B} week={SEMI} allScores={allScores} winner={cFin7} />
                        : <BkMatchup teamA={cTeams[0]} seedA={7} teamB={cTeams[1]} seedB={8} week={SEMI} allScores={allScores} winner={matchResult(cTeams[0], cTeams[1], SEMI)} />
                      }
                    </div>
                    {(c9A || c9B) && (
                      <div>
                        <div style={{ marginBottom: 4, fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>9th Place</div>
                        <BkMatchup teamA={c9A} teamB={c9B} week={SEMI} allScores={allScores} winner={cFin9} />
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Matchup Tab ─────────────────────────────────────────────── */
const STARTER_SLOT_LABELS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DEF', 'K'];
const POS_COLORS: Record<string, string> = {
  QB: '#e84545', RB: '#2d7fe0', WR: '#d4a020', TE: '#9b56e0',
  DEF: '#0db874', K: '#f07820', FLEX: '#0ea5c9',
};

function snakeIdx(pickNum: number, numTeams: number): number {
  const round = Math.floor(pickNum / numTeams);
  const pos   = pickNum % numTeams;
  return round % 2 === 0 ? pos : numTeams - 1 - pos;
}

function assignRoster(picks: any[]): { starters: (any | null)[]; bench: any[] } {
  const byPos: Record<string, any[]> = { QB: [], RB: [], WR: [], TE: [], DEF: [], K: [] };
  for (const p of picks) {
    const pos = p.player_data?.unitType as string;
    if (pos && byPos[pos]) byPos[pos].push(p);
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  }
  const starters: (any | null)[] = [];
  const usedIds = new Set<string>();
  function take(arr: any[]) {
    const p = arr.find(x => !usedIds.has(x.id)) ?? null;
    if (p) usedIds.add(p.id);
    return p;
  }
  starters.push(take(byPos.QB));  // QB1
  starters.push(take(byPos.RB));  // RB1
  starters.push(take(byPos.RB));  // RB2
  starters.push(take(byPos.WR));  // WR1
  starters.push(take(byPos.WR));  // WR2
  starters.push(take(byPos.TE));  // TE1
  // FLEX: best unused RB/WR/TE
  const flexPool = [...byPos.RB, ...byPos.WR, ...byPos.TE]
    .filter(p => !usedIds.has(p.id))
    .sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  const flex = flexPool[0] ?? null;
  if (flex) usedIds.add(flex.id);
  starters.push(flex);            // FLEX
  starters.push(take(byPos.DEF)); // DEF
  starters.push(take(byPos.K));   // K
  const bench = picks
    .filter(p => !usedIds.has(p.id))
    .sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  return { starters, bench };
}

function MatchupPlayerCell({ pick, align, ctx, gameStats, unitRankMaps, onView, logos = {} }: { pick: any | null; align: 'left' | 'right'; ctx: MatchupCtx; gameStats: GameStats; unitRankMaps?: Record<string, Record<string, number>>; onView?: () => void; logos?: Record<string, string> }) {
  const isRight = align === 'right';
  if (!pick) return (
    <div style={{
      display: 'flex', alignItems: 'center', minHeight: 52,
      justifyContent: isRight ? 'flex-end' : 'flex-start',
      padding: '9px 14px', background: C.surf,
      borderRadius: isRight ? '8px 0 0 8px' : '0 8px 8px 0',
      border: '1px solid ' + C.surf3,
      borderRight: isRight ? 'none' : undefined,
      borderLeft: isRight ? undefined : 'none',
    }}>
      <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>Empty</span>
    </div>
  );

  const school   = pick.player_data?.school ?? '';
  const unitType = pick.player_data?.unitType ?? '';
  const posColor = POS_COLORS[unitType] || C.muted;
  const ep       = effectivePts(school, unitType, pick.player_data?.projectedPoints ?? 0, ctx, gameStats);
  const pts      = ep.pts.toFixed(1);

  // Score sits on the INNER side (near the center pos badge), info on the OUTER side.
  // Left cell:  [info(flex:1, left-align)] [logo] [score]
  // Right cell: [score] [logo] [info(flex:1, right-align)]
  const logoEl = (
    <div style={{ width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <SchoolLogo school={school} posColor={posColor} logos={logos} size={30} />
    </div>
  );

  const info = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <PlayerInfoLines
        school={school}
        unitType={unitType}
        playerName={pick.player_data?.playerName}
        ctx={ctx}
        ep={ep}
        align={align}
        seasonPts={pick.player_data?.projectedPoints ?? 0}
        unitRankMaps={unitRankMaps}
      />
    </div>
  );
  const score = (
    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: isRight ? C.gold : C.sub, flexShrink: 0, minWidth: 46, textAlign: isRight ? 'left' : 'right' }}>
      {pts}
    </div>
  );
  return (
    <div onClick={onView} style={{
      display: 'flex', alignItems: 'center',
      gap: 6, padding: '9px 8px', background: C.surf2,
      borderRadius: isRight ? '8px 0 0 8px' : '0 8px 8px 0',
      border: '1px solid ' + C.surf3,
      borderRight: isRight ? 'none' : undefined,
      borderLeft: isRight ? undefined : 'none',
      cursor: onView ? 'pointer' : 'default',
    }}>
      {isRight ? <>{score}{logoEl}{info}</> : <>{info}{logoEl}{score}</>}
    </div>
  );
}

function MatchupTab({ league, userId }: { league: any; userId: string | null }) {
  const [picks,         setPicks]         = useState<any[]>([]);
  const [pool,          setPool]          = useState<any[]>([]);
  const [week,          setWeek]          = useState(1);
  const [matchupCtx,    setMatchupCtx]    = useState<MatchupCtx>(null);
  const [gameStats,     setGameStats]     = useState<GameStats>(null);
  const [loading,       setLoading]       = useState(true);
  const [viewingPlayer, setViewingPlayer] = useState<any | null>(null);
  const [logos,         setLogos]         = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/team-logos').then(r => r.json()).then(d => setLogos(d.logos ?? {})).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(poolUrl(league?.conference_filter)).then(r => r.json()).then(d => setPool(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!league?.id) return;
    supabase.from('draft_picks').select('*').eq('league_id', league.id)
      .order('pick_number', { ascending: true })
      .then(({ data }) => { setPicks(data || []); setLoading(false); });
  }, [league?.id]);

  useEffect(() => {
    setGameStats(null);
    fetch(`/api/matchup-context?week=${week}&season=2025`)
      .then(r => r.json()).then(setMatchupCtx).catch(() => setMatchupCtx(null));
    fetch(`/api/game-stats?week=${week}&season=2025`)
      .then(r => r.json()).then(setGameStats).catch(() => {});
  }, [week]);

  const draftOrder: any[] = league?.settings?.draft_order || [];
  const numTeams = draftOrder.length;

  const unitRankMaps = useMemo(() => buildPoolRankMaps(pool), [pool]);

  const myEntry    = draftOrder.find((t: any) => t.userId === userId);
  const mySlotIdx  = myEntry ? myEntry.slot - 1 : -1;
  const oppSlotIdx = mySlotIdx < 0 ? -1
    : mySlotIdx % 2 === 0 ? mySlotIdx + 1 : mySlotIdx - 1;
  const oppEntry   = oppSlotIdx >= 0 && oppSlotIdx < numTeams ? draftOrder[oppSlotIdx] : null;

  const myPicksRaw  = picks.filter(p => numTeams > 0 && snakeIdx(p.pick_number, numTeams) === mySlotIdx);
  const oppPicksRaw = picks.filter(p => numTeams > 0 && snakeIdx(p.pick_number, numTeams) === oppSlotIdx);

  const myRoster  = assignRoster(myPicksRaw);
  const oppRoster = assignRoster(oppPicksRaw);

  // Total = starters only; actual if game complete, projected otherwise
  const myTotal  = myRoster.starters.reduce((s, p) => s + effectivePts(p?.player_data?.school, p?.player_data?.unitType, p?.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).pts, 0);
  const oppTotal = oppRoster.starters.reduce((s, p) => s + effectivePts(p?.player_data?.school, p?.player_data?.unitType, p?.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).pts, 0);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
      Loading matchup…
    </div>
  );

  if (viewingPlayer) return (
    <PlayerDetailView player={viewingPlayer} onBack={() => setViewingPlayer(null)} onAdd={() => {}} canAdd={false} />
  );

  if (!myEntry || numTeams === 0) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13 }}>
      Draft not yet complete or no matchup data available.
    </div>
  );

  const myTeamName  = myEntry.teamName;
  const oppTeamName = oppEntry?.teamName ?? 'BYE';
  const iAhead      = myTotal >= oppTotal;
  const benchLen    = Math.max(myRoster.bench.length, oppRoster.bench.length);

  return (
    <div style={{ maxWidth: 820 }}>

      {/* Week selector + label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => setWeek(w => Math.max(1, w - 1))} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>‹</button>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 3, color: C.muted, textTransform: 'uppercase' }}>
          Week {week} · {gameStats?.completedSchools.length ? 'Actual' : 'Projected'}
        </div>
        <button onClick={() => setWeek(w => Math.min(15, w + 1))} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>›</button>
      </div>

      {/* Score header card */}
      <div className="mob-score-card" style={{
        background: 'linear-gradient(135deg, #0e1f35 0%, #0b1624 50%, #0e1f35 100%)',
        border: '1px solid ' + C.surf3,
        borderRadius: 16, padding: '24px 28px', marginBottom: 24,
        display: 'grid', gridTemplateColumns: '1fr 48px 1fr', gap: 8, alignItems: 'center',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        {/* My team */}
        <div style={{ textAlign: 'right' }}>
          <div className="mob-score-big" style={{ fontFamily: 'Anton,sans-serif', fontSize: 38, letterSpacing: 1, color: iAhead ? C.gold : C.sub, lineHeight: 1 }}>{myTotal.toFixed(1)}</div>
          <div className="mob-score-name" style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: C.text, marginTop: 8 }}>{myTeamName}</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 500, color: C.muted, letterSpacing: 1.5, marginTop: 3, textTransform: 'uppercase' }}>Your Team</div>
        </div>
        {/* VS divider */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <div style={{ width: 1, height: 18, background: C.surf3 }} />
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, color: C.muted }}>VS</div>
            <div style={{ width: 1, height: 18, background: C.surf3 }} />
          </div>
        </div>
        {/* Opponent */}
        <div style={{ textAlign: 'left' }}>
          <div className="mob-score-big" style={{ fontFamily: 'Anton,sans-serif', fontSize: 38, letterSpacing: 1, color: !iAhead ? C.gold : C.sub, lineHeight: 1 }}>{oppTotal.toFixed(1)}</div>
          <div className="mob-score-name" style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: C.text, marginTop: 8 }}>{oppTeamName}</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 500, color: C.muted, letterSpacing: 1.5, marginTop: 3, textTransform: 'uppercase' }}>Opponent</div>
        </div>
      </div>

      {/* Starters section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 1, background: C.surf3 }} />
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Starters</span>
        <div style={{ flex: 1, height: 1, background: C.surf3 }} />
      </div>

      {STARTER_SLOT_LABELS.map((label, i) => {
        const color = POS_COLORS[label] || C.muted;
        return (
          <div key={i} className="matchup-row" style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', marginBottom: 4 }}>
            <MatchupPlayerCell pick={myRoster.starters[i] ?? null} align="right" ctx={matchupCtx} gameStats={gameStats} unitRankMaps={unitRankMaps} logos={logos} onView={myRoster.starters[i] ? () => setViewingPlayer(myRoster.starters[i]!.player_data) : undefined} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: color + '22', border: '1px solid ' + color + '44', borderLeft: 'none', borderRight: 'none' }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1, color, fontWeight: 700 }}>{label}</span>
            </div>
            <MatchupPlayerCell pick={oppRoster.starters[i] ?? null} align="left" ctx={matchupCtx} gameStats={gameStats} unitRankMaps={unitRankMaps} logos={logos} onView={oppRoster.starters[i] ? () => setViewingPlayer(oppRoster.starters[i]!.player_data) : undefined} />
          </div>
        );
      })}

      {/* Bench section */}
      {benchLen > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 1, background: C.surf3 }} />
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Bench</span>
            <div style={{ flex: 1, height: 1, background: C.surf3 }} />
          </div>
          {Array.from({ length: benchLen }).map((_, i) => (
            <div key={i} className="matchup-row" style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', marginBottom: 4 }}>
              <MatchupPlayerCell pick={myRoster.bench[i] ?? null} align="right" ctx={matchupCtx} gameStats={gameStats} unitRankMaps={unitRankMaps} logos={logos} onView={myRoster.bench[i] ? () => setViewingPlayer(myRoster.bench[i]!.player_data) : undefined} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.muted + '22', border: '1px solid ' + C.muted + '44', borderLeft: 'none', borderRight: 'none' }}>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1, color: C.muted, fontWeight: 700 }}>BN</span>
              </div>
              <MatchupPlayerCell pick={oppRoster.bench[i] ?? null} align="left" ctx={matchupCtx} gameStats={gameStats} unitRankMaps={unitRankMaps} logos={logos} onView={oppRoster.bench[i] ? () => setViewingPlayer(oppRoster.bench[i]!.player_data) : undefined} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ── Team Tab ────────────────────────────────────────────────── */
const SLOT_ELIGIBLE: Record<string, string[]> = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'], DEF: ['DEF'], K: ['K'],
};

function canFillSlot(unitType: string, slotLabel: string): boolean {
  return (SLOT_ELIGIBLE[slotLabel] ?? []).includes(unitType);
}

function TeamTab({ league, userId }: { league: any; userId: string | null }) {
  const [myPicks,       setMyPicks]       = useState<any[]>([]);
  const [allPicks,      setAllPicks]      = useState<any[]>([]);
  const [pool,          setPool]          = useState<any[]>([]);
  const [lineups,       setLineups]       = useState<Record<string, (string | null)[]>>({});
  const [week,          setWeek]          = useState(1);
  const [matchupCtx,    setMatchupCtx]    = useState<MatchupCtx>(null);
  const [gameStats,     setGameStats]     = useState<GameStats>(null);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [memberId,      setMemberId]      = useState<string | null>(null);
  const [memberSlot,    setMemberSlot]    = useState<number | null>(null);
  const [memberName,    setMemberName]    = useState<string>('');
  const [selectedBench, setSelectedBench] = useState<any | null>(null);
  const [viewingPlayer, setViewingPlayer] = useState<any | null>(null);
  const [logos,         setLogos]         = useState<Record<string, string>>({});

  const TOTAL_WEEKS    = 14;
  const PLAYOFF_START  = 12;
  const isCommissioner = league?.commissioner_id === userId;

  useEffect(() => {
    fetch('/api/team-logos').then(r => r.json()).then(d => setLogos(d.logos ?? {})).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(poolUrl(league?.conference_filter)).then(r => r.json()).then(d => setPool(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setGameStats(null);
    fetch(`/api/matchup-context?week=${week}&season=2025`)
      .then(r => r.json()).then(setMatchupCtx).catch(() => setMatchupCtx(null));
    fetch(`/api/game-stats?week=${week}&season=2025`)
      .then(r => r.json()).then(setGameStats).catch(() => {});
  }, [week]);

  useEffect(() => {
    if (!league?.id || !userId) return;
    async function load() {
      try {
        const [{ data: memberData }, { data: allPicksData }] = await Promise.all([
          supabase.from('league_members')
            .select('id, roster, draft_slot, team_name')
            .eq('league_id', league.id)
            .eq('user_id', userId)
            .single(),
          // Load ALL league picks — needed to find commissioner's slot via snakeIdx
          supabase.from('draft_picks')
            .select('*')
            .eq('league_id', league.id)
            .order('pick_number', { ascending: true }),
        ]);

        let slot: number | null = null;
        if (memberData) {
          setMemberId(memberData.id);
          if (memberData.draft_slot) { slot = memberData.draft_slot; setMemberSlot(slot); }
          if (memberData.team_name) setMemberName(memberData.team_name);
          const r = memberData.roster;
          if (r && typeof r === 'object' && !Array.isArray(r) && r.lineups) {
            setLineups(r.lineups);
          }
        }

        const allPicks: any[] = allPicksData || [];
        // For non-commissioners: each human's picks are stored with their own user_id — simple filter
        // For commissioners: their picks AND CPU picks all share commissioner's user_id, need snakeIdx
        let mine: any[] = [];
        if (!isCommissioner) {
          mine = allPicks.filter((p: any) => p.user_id === userId);
        } else {
          const draftOrder: any[] = league?.settings?.draft_order || [];
          const numTeams = draftOrder.length;
          const myEntry  = draftOrder.find((t: any) => t.userId === userId);
          const slotIdx  = myEntry ? myEntry.slot - 1 : (slot !== null ? slot - 1 : -1);
          if (numTeams > 0 && slotIdx >= 0) {
            mine = allPicks.filter(p => snakeIdx(p.pick_number, numTeams) === slotIdx);
          }
          // Commissioner fallback: if snakeIdx found nothing, show user_id picks
          if (mine.length === 0) {
            mine = allPicks.filter((p: any) => p.user_id === userId);
          }
        }
        setMyPicks(mine);
        setAllPicks(allPicks);
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.id, userId]);

  const unitRankMaps = useMemo(() => buildPoolRankMaps(pool), [pool]);

  const draftOrder: any[] = league?.settings?.draft_order || [];
  const myEntry           = draftOrder.find((t: any) => t.userId === userId);
  const myTeamName        = myEntry?.teamName || memberName;
  const myPicksRaw        = myPicks;

  const weekKey   = String(week);
  const savedIds  = lineups[weekKey]; // (string | null)[] length 9

  let starters: (any | null)[];
  let bench: any[];

  if (savedIds && savedIds.length === 9) {
    const pickMap = new Map(myPicksRaw.map((p: any) => [p.id, p]));
    starters = savedIds.map(id => (id ? pickMap.get(id) ?? null : null));
    const starterIdSet = new Set(savedIds.filter(Boolean));
    bench = myPicksRaw
      .filter((p: any) => !starterIdSet.has(p.id))
      .sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  } else {
    const r = assignRoster(myPicksRaw);
    starters = r.starters;
    bench    = r.bench;
  }

  const starterTotal = starters.reduce((s, p) => s + effectivePts(p?.player_data?.school, p?.player_data?.unitType, p?.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).pts, 0);

  async function doSwap(starterIdx: number) {
    if (!selectedBench) return;
    const newStarters = [...starters];
    const evicted = newStarters[starterIdx];
    newStarters[starterIdx] = selectedBench;
    const newBench = bench.filter((p: any) => p.id !== selectedBench.id);
    if (evicted) newBench.push(evicted);
    newBench.sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
    const newIds: (string | null)[] = newStarters.map(p => p?.id ?? null);
    const newLineups = { ...lineups, [weekKey]: newIds };
    setLineups(newLineups);
    setSelectedBench(null);
    if (memberId) {
      setSaving(true);
      await supabase.from('league_members').update({ roster: { lineups: newLineups } }).eq('id', memberId);
      setSaving(false);
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
      Loading roster…
    </div>
  );

  if (viewingPlayer) return (
    <PlayerDetailView player={viewingPlayer} onBack={() => setViewingPlayer(null)} onAdd={() => {}} canAdd={false} />
  );

  if (myPicksRaw.length === 0) return (
    <div style={{ textAlign: 'center', padding: 60, fontFamily: 'Oswald,sans-serif' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 15, color: C.text, marginBottom: 6 }}>No roster found</div>
      <div style={{ fontSize: 11, color: C.muted }}>
        Complete the real draft first — mock drafts don&apos;t save picks here.
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 540 }}>

      {/* Week tabs */}
      <div className="mob-scroll-x" style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map(w => {
          const isPlayoff  = w >= PLAYOFF_START;
          const isSelected = week === w;
          const poLabel    = w === 12 ? 'Play-in' : w === 13 ? 'Semis' : 'Champ';
          return (
            <button
              key={w}
              onClick={() => { setWeek(w); setSelectedBench(null); }}
              style={{
                padding: isPlayoff ? '4px 11px 5px' : '5px 13px',
                background: isSelected
                  ? (isPlayoff ? 'rgba(168,85,247,.20)' : 'rgba(212,168,40,.14)')
                  : (isPlayoff ? 'rgba(168,85,247,.07)' : C.surf2),
                border: '1px solid ' + (isSelected
                  ? (isPlayoff ? '#a855f7' : C.gold)
                  : (isPlayoff ? 'rgba(168,85,247,.45)' : C.surf3)),
                borderRadius: 6, cursor: 'pointer',
                fontFamily: 'Oswald,sans-serif', letterSpacing: 1,
                color: isSelected
                  ? (isPlayoff ? '#c084fc' : C.gold)
                  : (isPlayoff ? '#a855f7' : C.sub),
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
              }}
            >
              <span style={{ fontSize: 11 }}>Wk {w}</span>
              {isPlayoff && <span style={{ fontSize: 7, letterSpacing: .5, opacity: .85 }}>{poLabel}</span>}
            </button>
          );
        })}
      </div>

      {/* Team score header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #0e1f35 0%, #0b1624 100%)',
        border: '1px solid ' + C.surf3, borderRadius: 14,
        padding: '16px 20px', marginBottom: 20,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>{gameStats?.completedSchools.length ? 'Actual' : 'Projected'} · Starters Only</div>
          <div className="mob-score-med" style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, color: C.gold, lineHeight: 1, marginTop: 4 }}>{starterTotal.toFixed(1)}</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: C.sub, marginTop: 4 }}>{myTeamName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 600,
            letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase',
            background: C.surf3, padding: '4px 10px', borderRadius: 20,
          }}>Week {week}</div>
          {saving && <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.sub, marginTop: 8 }}>Saving…</div>}
        </div>
      </div>

      {/* Swap hint */}
      {selectedBench && (
        <div style={{
          padding: '9px 14px', marginBottom: 12,
          background: 'rgba(212,168,40,.08)', border: '1px solid rgba(212,168,40,.3)',
          borderRadius: 8, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.gold,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>Move {selectedBench.player_data?.playerName || selectedBench.player_data?.school} — tap a highlighted slot</span>
          <button
            onClick={() => setSelectedBench(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gold, fontSize: 14, lineHeight: 1, padding: '0 4px' }}
          >✕</button>
        </div>
      )}

      {/* Starters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 1, background: C.surf3 }} />
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Starters</span>
        <div style={{ flex: 1, height: 1, background: C.surf3 }} />
      </div>

      {STARTER_SLOT_LABELS.map((label, i) => {
        const pick    = starters[i];
        const color   = POS_COLORS[label] || C.muted;
        const isTarget = selectedBench != null && canFillSlot(selectedBench.player_data?.unitType, label);
        const ep      = effectivePts(pick?.player_data?.school, pick?.player_data?.unitType, pick?.player_data?.projectedPoints ?? 0, matchupCtx, gameStats);
        const mp      = matchupProj(pick?.player_data?.avgPerWeek ?? weeklyProj(pick?.player_data?.projectedPoints ?? 0), pick?.player_data?.school ?? '', pick?.player_data?.unitType ?? '', matchupCtx);
        const pts     = ep.pts.toFixed(1);
        const name    = pick?.player_data?.playerName || pick?.player_data?.school;
        const sub     = pick?.player_data?.playerName ? pick.player_data.school : pick?.player_data?.conference;
        const tier    = pick?.player_data?.tier;

        return (
          <div
            key={i}
            onClick={() => { if (isTarget) doSwap(i); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', marginBottom: 4,
              background: isTarget ? color + '18' : C.surf2,
              border: '1px solid ' + (isTarget ? color + '88' : C.surf3),
              borderRadius: 8, cursor: isTarget ? 'pointer' : 'default',
              transition: 'all .15s',
            }}
          >
            {/* Slot badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              height: 22, minWidth: 42, padding: '0 8px', flexShrink: 0,
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, fontWeight: 700,
              color, background: color + '1a', border: '1px solid ' + color + '50',
              borderRadius: 20, letterSpacing: 0.3,
            }}>{label}</div>

            {/* Logo */}
            {pick && (
              <div style={{ width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <SchoolLogo school={pick.player_data?.school ?? ''} posColor={color} logos={logos} size={30} />
              </div>
            )}

            {/* Player info */}
            <div style={{ flex: 1, minWidth: 0 }} onClick={pick ? (e) => { e.stopPropagation(); setViewingPlayer(pick.player_data); } : undefined}>
              {pick ? (
                <PlayerInfoLines
                  school={pick?.player_data?.school ?? ''}
                  unitType={pick?.player_data?.unitType ?? ''}
                  playerName={pick?.player_data?.playerName}
                  ctx={matchupCtx}
                  ep={ep}
                  seasonPts={pick?.player_data?.projectedPoints ?? 0}
                  unitRankMaps={unitRankMaps}
                />
              ) : (
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>Empty</span>
              )}
            </div>

            {/* Projected pts */}
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, color: pick ? C.gold : C.surf3, flexShrink: 0, minWidth: 42, textAlign: 'right' }}>
              {pick ? pts : '—'}
            </div>

            {/* Swap indicator */}
            {isTarget && (
              <div style={{
                flexShrink: 0, padding: '3px 9px', borderRadius: 5,
                background: color + '33', border: '1px solid ' + color + '88',
                fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color,
              }}>SWAP</div>
            )}
          </div>
        );
      })}

      {/* Bench */}
      {bench.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 1, background: C.surf3 }} />
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Bench</span>
            <div style={{ flex: 1, height: 1, background: C.surf3 }} />
          </div>

          {bench.map((pick: any) => {
            const isSelected = selectedBench?.id === pick.id;
            const bep  = effectivePts(pick.player_data?.school, pick.player_data?.unitType, pick.player_data?.projectedPoints ?? 0, matchupCtx, gameStats);
            const pts  = bep.pts.toFixed(1);
            const name = pick.player_data?.playerName || pick.player_data?.school;
            const sub  = pick.player_data?.playerName ? pick.player_data.school : pick.player_data?.conference;
            const tier = pick.player_data?.tier;
            const pos  = pick.player_data?.unitType as string;
            const col  = POS_COLORS[pos] || C.muted;

            return (
              <div
                key={pick.id}
                onClick={() => setSelectedBench(isSelected ? null : pick)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', marginBottom: 4,
                  background: isSelected ? 'rgba(212,168,40,.1)' : C.surf,
                  border: '1px solid ' + (isSelected ? 'rgba(212,168,40,.5)' : C.surf3),
                  borderRadius: 8, cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {/* Pos pill (bench) */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  height: 22, minWidth: 42, padding: '0 8px', flexShrink: 0,
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, fontWeight: 700,
                  color: col, background: col + '1a', border: '1px solid ' + col + '50',
                  borderRadius: 20, letterSpacing: 0.3,
                }}>{pos || 'BN'}</div>

                {/* Logo */}
                <div style={{ width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SchoolLogo school={pick.player_data?.school ?? ''} posColor={col} logos={logos} size={30} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }} onClick={e => { e.stopPropagation(); setViewingPlayer(pick.player_data); }}>
                  <PlayerInfoLines
                    school={pick.player_data?.school ?? ''}
                    unitType={pick.player_data?.unitType ?? ''}
                    playerName={pick.player_data?.playerName}
                    ctx={matchupCtx}
                    ep={bep}
                    seasonPts={pick.player_data?.projectedPoints ?? 0}
                    unitRankMaps={unitRankMaps}
                  />
                </div>

                {/* Pts */}
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, color: isSelected ? C.gold : C.sub, flexShrink: 0, minWidth: 42, textAlign: 'right' }}>
                  {pts}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ── League Tab ──────────────────────────────────────────────── */
function PickCheckbox({ pick, checked, onToggle, accent }: { pick: any; checked: boolean; onToggle: () => void; accent: string }) {
  const pos = pick.player_data?.unitType as string;
  const col = POS_COLORS[pos] || C.muted;
  return (
    <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 3, background: checked ? accent + '18' : C.surf, border: '1px solid ' + (checked ? accent : C.surf3), borderRadius: 7, cursor: 'pointer', transition: 'all .12s' }}>
      <div style={{ width: 13, height: 13, borderRadius: 3, border: '2px solid ' + (checked ? accent : C.surf3), background: checked ? accent : 'none', flexShrink: 0 }} />
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: col, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.player_data?.playerName || pick.player_data?.school}</div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>{pos} · {weeklyProj(pick.player_data?.projectedPoints ?? 0).toFixed(1)} pts</div>
      </div>
    </div>
  );
}

function getWeekMatchups(teams: any[], week: number): [any, any][] {
  const n = teams.length;
  if (n < 2 || n % 2 !== 0) return [];
  // Round-robin: fix index 0, rotate the rest by week-1
  const rest = teams.slice(1);
  const rotated = rest.map((_, i) => rest[(i + week - 1) % rest.length]);
  const ordered = [teams[0], ...rotated];
  const result: [any, any][] = [];
  for (let i = 0; i < n / 2; i++) result.push([ordered[i], ordered[n - 1 - i]]);
  return result;
}

function LeagueTab({ league, userId }: { league: any; userId: string | null }) {
  type LView = 'matchups' | 'roster' | 'trade';
  const [view,          setView]          = useState<LView>('matchups');
  const [selectedTeam,  setSelectedTeam]  = useState<any>(null);
  const [selectedPlayer,setSelectedPlayer]= useState<any>(null);
  const [week,          setWeek]          = useState(1);
  const [matchupCtx,    setMatchupCtx]    = useState<MatchupCtx>(null);
  const [gameStats,     setGameStats]     = useState<GameStats>(null);
  const [allPicks,      setAllPicks]      = useState<any[]>([]);
  const [pool,          setPool]          = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tradeOffer,    setTradeOffer]    = useState<Set<string>>(new Set());
  const [tradeRequest,  setTradeRequest]  = useState<Set<string>>(new Set());
  const [submitting,    setSubmitting]    = useState(false);
  const [trades,        setTrades]        = useState<any[]>([]);
  const [tradeMsg,      setTradeMsg]      = useState('');

  const draftOrder: any[] = league?.settings?.draft_order || [];
  const numTeams           = draftOrder.length;
  const isCommissioner     = league?.commissioner_id === userId;
  const myEntry            = draftOrder.find((t: any) => t.userId === userId);
  const mySlotIdx          = myEntry ? myEntry.slot - 1 : -1;

  useEffect(() => {
    fetch(poolUrl(league?.conference_filter)).then(r => r.json()).then(d => setPool(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setGameStats(null);
    fetch(`/api/matchup-context?week=${week}&season=2025`)
      .then(r => r.json()).then(setMatchupCtx).catch(() => setMatchupCtx(null));
    fetch(`/api/game-stats?week=${week}&season=2025`)
      .then(r => r.json()).then(setGameStats).catch(() => {});
  }, [week]);

  useEffect(() => {
    if (!league?.id || !userId) return;
    async function load() {
      try {
        const [{ data: picksData }, { data: tradesData }] = await Promise.all([
          supabase.from('draft_picks').select('*').eq('league_id', league.id).order('pick_number'),
          supabase.from('trades').select('*').eq('league_id', league.id)
            .or(`proposer_id.eq.${userId},receiver_id.eq.${userId}`),
        ]);
        setAllPicks(picksData || []);
        setTrades(tradesData || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [league?.id, userId]);

  const unitRankMaps = useMemo(() => buildPoolRankMaps(pool), [pool]);

  function getTeamPicks(team: any): any[] {
    if (numTeams === 0) return [];
    const slotIdx = team.slot - 1;
    return allPicks.filter(p => snakeIdx(p.pick_number, numTeams) === slotIdx);
  }

  function getMyPicks(): any[] {
    if (!isCommissioner) return allPicks.filter((p: any) => p.user_id === userId);
    if (numTeams > 0 && mySlotIdx >= 0)
      return allPicks.filter(p => snakeIdx(p.pick_number, numTeams) === mySlotIdx);
    return allPicks.filter((p: any) => p.user_id === userId);
  }

  async function proposeTrade() {
    if (!userId || tradeOffer.size === 0 || tradeRequest.size === 0 || !selectedTeam?.userId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('trades').insert({
        league_id: league.id,
        proposer_id: userId,
        receiver_id: selectedTeam.userId,
        offer_pick_ids: Array.from(tradeOffer),
        request_pick_ids: Array.from(tradeRequest),
        status: 'pending',
      });
      if (!error) {
        setView('roster');
        setTradeOffer(new Set());
        setTradeRequest(new Set());
        setTradeMsg('Trade sent!');
        setTimeout(() => setTradeMsg(''), 3000);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function respondTrade(tradeId: string, status: 'accepted' | 'declined') {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;
    if (status === 'accepted') {
      // Swap pick ownership
      await Promise.all([
        ...trade.offer_pick_ids.map((id: string) =>
          supabase.from('draft_picks').update({ user_id: userId }).eq('id', id)
        ),
        ...trade.request_pick_ids.map((id: string) =>
          supabase.from('draft_picks').update({ user_id: trade.proposer_id }).eq('id', id)
        ),
        supabase.from('trades').update({ status: 'accepted' }).eq('id', tradeId),
      ]);
      const { data } = await supabase.from('draft_picks').select('*').eq('league_id', league.id).order('pick_number');
      setAllPicks(data || []);
    } else {
      await supabase.from('trades').update({ status }).eq('id', tradeId);
    }
    setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, status } : t));
  }

  const matchups = getWeekMatchups(draftOrder, week);
  const myPicks  = getMyPicks();
  const pendingIncoming = trades.filter(t => t.receiver_id === userId && t.status === 'pending');

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
      Loading league…
    </div>
  );

  /* ── Matchups view ── */
  if (view === 'matchups') return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>Matchups</div>
        <select
          value={week}
          onChange={e => setWeek(Number(e.target.value))}
          style={{ background: C.surf2, border: '1px solid ' + C.surf3, color: C.text, padding: '7px 14px', borderRadius: 7, fontFamily: 'Oswald,sans-serif', fontSize: 12, cursor: 'pointer', outline: 'none' }}
        >
          {Array.from({ length: 13 }, (_, i) => i + 1).map(w => (
            <option key={w} value={w}>Wk. {w}</option>
          ))}
        </select>
      </div>

      {matchups.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>
          Complete the draft first to see matchups.
        </div>
      ) : matchups.map(([teamA, teamB], i) => {
        const totA = assignRoster(getTeamPicks(teamA)).starters.reduce((s, p) => s + effectivePts(p?.player_data?.school, p?.player_data?.unitType, p?.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).pts, 0);
        const totB = assignRoster(getTeamPicks(teamB)).starters.reduce((s, p) => s + effectivePts(p?.player_data?.school, p?.player_data?.unitType, p?.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).pts, 0);
        const isMeA = teamA.userId === userId;
        const isMeB = teamB.userId === userId;
        return (
          <div key={i} style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12, padding: '16px 20px', marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr 36px 1fr', alignItems: 'center', gap: 8 }}>
            {/* Team A */}
            <button onClick={() => { setSelectedTeam(teamA); setSelectedPlayer(null); setView('roster'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: isMeA ? 'linear-gradient(135deg,#d4a828,#f0c94a)' : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 15, color: isMeA ? C.bg : C.sub, flexShrink: 0 }}>
                  {(teamA.teamName || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: isMeA ? C.gold : C.text, fontWeight: 600 }}>{teamA.teamName}</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, lineHeight: 1.2 }}>{totA > 0 ? totA.toFixed(1) : '—'}</div>
                </div>
              </div>
            </button>
            <div style={{ textAlign: 'center', fontFamily: 'Anton,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted }}>VS</div>
            {/* Team B */}
            <button onClick={() => { setSelectedTeam(teamB); setSelectedPlayer(null); setView('roster'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'right', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: isMeB ? C.gold : C.text, fontWeight: 600 }}>{teamB.teamName}</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, lineHeight: 1.2, textAlign: 'right' }}>{totB > 0 ? totB.toFixed(1) : '—'}</div>
                </div>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: isMeB ? 'linear-gradient(135deg,#d4a828,#f0c94a)' : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 15, color: isMeB ? C.bg : C.sub, flexShrink: 0 }}>
                  {(teamB.teamName || '?').charAt(0).toUpperCase()}
                </div>
              </div>
            </button>
          </div>
        );
      })}

      {/* Pending incoming trades */}
      {pendingIncoming.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 12 }}>
            Incoming Trades ({pendingIncoming.length})
          </div>
          {pendingIncoming.map(trade => {
            const fromTeam = draftOrder.find((t: any) => t.userId === trade.proposer_id);
            const offered  = allPicks.filter(p => trade.offer_pick_ids.includes(p.id));
            const requested= allPicks.filter(p => trade.request_pick_ids.includes(p.id));
            return (
              <div key={trade.id} style={{ background: C.surf, border: '1px solid rgba(212,168,40,.3)', borderRadius: 10, padding: '14px 18px', marginBottom: 10 }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.gold, marginBottom: 10 }}>
                  From {fromTeam?.teamName || 'Unknown'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>They offer</div>
                    {offered.map(p => (
                      <div key={p.id} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 2 }}>
                        {p.player_data?.playerName || p.player_data?.school}
                        <span style={{ color: C.muted, fontSize: 10 }}> · {p.player_data?.unitType}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>They want</div>
                    {requested.map(p => (
                      <div key={p.id} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 2 }}>
                        {p.player_data?.playerName || p.player_data?.school}
                        <span style={{ color: C.muted, fontSize: 10 }}> · {p.player_data?.unitType}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => respondTrade(trade.id, 'accepted')} style={{ flex: 1, padding: '8px', background: 'rgba(46,204,113,.12)', border: '1px solid rgba(46,204,113,.4)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: C.green }}>
                    Accept
                  </button>
                  <button onClick={() => respondTrade(trade.id, 'declined')} style={{ flex: 1, padding: '8px', background: 'rgba(231,76,60,.08)', border: '1px solid rgba(231,76,60,.25)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: C.red }}>
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  /* ── Roster view ── */
  if (view === 'roster' && selectedTeam) {
    const teamPicks  = getTeamPicks(selectedTeam);
    const roster     = assignRoster(teamPicks);
    const starterPts = roster.starters.reduce((s, p) => s + effectivePts(p?.player_data?.school, p?.player_data?.unitType, p?.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).pts, 0);
    const isMyTeam   = selectedTeam.userId === userId;
    const canTrade   = !isMyTeam && selectedTeam.type === 'human';

    return (
      <div style={{ maxWidth: 540 }}>
        <button onClick={() => { setSelectedTeam(null); setSelectedPlayer(null); setView('matchups'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, padding: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Matchups
        </button>

        <div style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 1, color: isMyTeam ? C.gold : C.text }}>{selectedTeam.teamName}</div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginTop: 2 }}>{gameStats?.completedSchools.length ? 'Actual' : 'Proj.'} {starterPts.toFixed(1)} pts · starters only</div>
            {tradeMsg && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.green, marginTop: 4 }}>{tradeMsg}</div>}
          </div>
          {canTrade && (
            <button onClick={() => { setTradeOffer(new Set()); setTradeRequest(new Set()); setView('trade'); }} style={{ padding: '8px 16px', background: 'rgba(212,168,40,.12)', border: '1px solid rgba(212,168,40,.35)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: C.gold }}>
              Propose Trade
            </button>
          )}
        </div>

        {/* Player detail panel */}
        {selectedPlayer && (
          <div style={{ background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 1, color: C.text }}>{selectedPlayer.player_data?.playerName || selectedPlayer.player_data?.school}</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {selectedPlayer.player_data?.school} · {selectedPlayer.player_data?.conference} · {selectedPlayer.player_data?.unitType}
                </div>
                {selectedPlayer.player_data?.tier && (
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.gold, marginTop: 2 }}>{selectedPlayer.player_data.tier}</div>
                )}
              </div>
              <button onClick={() => setSelectedPlayer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, padding: '0 4px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>{effectivePts(selectedPlayer.player_data?.school, selectedPlayer.player_data?.unitType, selectedPlayer.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).isActual ? 'Actual' : 'Projected'}</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 24, color: C.gold }}>{effectivePts(selectedPlayer.player_data?.school, selectedPlayer.player_data?.unitType, selectedPlayer.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).pts.toFixed(1)}</div>
              </div>
              {selectedPlayer.player_data?.adp != null && (
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>ADP</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 24, color: C.text }}>{selectedPlayer.player_data.adp}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Starters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, height: 1, background: C.surf3 }} />
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Starters</span>
          <div style={{ flex: 1, height: 1, background: C.surf3 }} />
        </div>
        {STARTER_SLOT_LABELS.map((label, i) => {
          const pick = roster.starters[i];
          const color = POS_COLORS[label] || C.muted;
          const isSel = selectedPlayer?.id === pick?.id;
          return (
            <div key={i} onClick={() => pick && setSelectedPlayer(isSel ? null : pick)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 4, background: isSel ? C.surf3 : C.surf2, border: '1px solid ' + (isSel ? C.gold : C.surf3), borderRadius: 8, cursor: pick ? 'pointer' : 'default', transition: 'all .12s' }}>
              <div style={{ width: 34, flexShrink: 0, textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 1, color, background: color + '22', border: '1px solid ' + color + '44', borderRadius: 4, padding: '3px 0' }}>{label}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pick ? (
                  <PlayerInfoLines
                    school={pick.player_data?.school ?? ''}
                    unitType={pick.player_data?.unitType ?? ''}
                    playerName={pick.player_data?.playerName}
                    ctx={matchupCtx}
                    ep={effectivePts(pick.player_data?.school, pick.player_data?.unitType, pick.player_data?.projectedPoints ?? 0, matchupCtx, gameStats)}
                    seasonPts={pick.player_data?.projectedPoints ?? 0}
                    unitRankMaps={unitRankMaps}
                                />
                ) : <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>Empty</span>}
              </div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: pick ? C.gold : C.surf3, flexShrink: 0 }}>{pick ? effectivePts(pick.player_data?.school, pick.player_data?.unitType, pick.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).pts.toFixed(1) : '—'}</div>
            </div>
          );
        })}

        {/* Bench */}
        {roster.bench.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 8 }}>
              <div style={{ flex: 1, height: 1, background: C.surf3 }} />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Bench</span>
              <div style={{ flex: 1, height: 1, background: C.surf3 }} />
            </div>
            {roster.bench.map((pick: any) => {
              const pos = pick.player_data?.unitType as string;
              const col = POS_COLORS[pos] || C.muted;
              const isSel = selectedPlayer?.id === pick.id;
              return (
                <div key={pick.id} onClick={() => setSelectedPlayer(isSel ? null : pick)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 4, background: isSel ? C.surf3 : C.surf, border: '1px solid ' + (isSel ? C.gold : C.surf3), borderRadius: 8, cursor: 'pointer', transition: 'all .12s' }}>
                  <div style={{ width: 34, flexShrink: 0, textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.muted, background: C.muted + '22', border: '1px solid ' + C.muted + '44', borderRadius: 4, padding: '3px 0' }}>BN</div>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <PlayerInfoLines
                      school={pick.player_data?.school ?? ''}
                      unitType={pick.player_data?.unitType ?? ''}
                      playerName={pick.player_data?.playerName}
                      ctx={matchupCtx}
                      ep={effectivePts(pick.player_data?.school, pick.player_data?.unitType, pick.player_data?.projectedPoints ?? 0, matchupCtx, gameStats)}
                      seasonPts={pick.player_data?.projectedPoints ?? 0}
                      unitRankMaps={unitRankMaps}
                                    />
                  </div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: C.sub, flexShrink: 0 }}>{effectivePts(pick.player_data?.school, pick.player_data?.unitType, pick.player_data?.projectedPoints ?? 0, matchupCtx, gameStats).pts.toFixed(1)}</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  /* ── Trade view ── */
  if (view === 'trade' && selectedTeam) {
    const theirPicks = getTeamPicks(selectedTeam).sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
    const sortedMyPicks = myPicks.sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));

    return (
      <div style={{ maxWidth: 680 }}>
        <button onClick={() => { setView('roster'); setTradeOffer(new Set()); setTradeRequest(new Set()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, padding: '0 0 16px 0' }}>
          ← {selectedTeam.teamName}
        </button>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 4 }}>Propose Trade</div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginBottom: 18 }}>
          {myEntry?.teamName || 'You'} → {selectedTeam.teamName}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>You offer ({tradeOffer.size})</div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {sortedMyPicks.map((pick: any) => (
                <PickCheckbox key={pick.id} pick={pick} checked={tradeOffer.has(pick.id)} accent={C.gold}
                  onToggle={() => setTradeOffer(prev => { const n = new Set(prev); n.has(pick.id) ? n.delete(pick.id) : n.add(pick.id); return n; })} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.green, textTransform: 'uppercase', marginBottom: 8 }}>You receive ({tradeRequest.size})</div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {theirPicks.map((pick: any) => (
                <PickCheckbox key={pick.id} pick={pick} checked={tradeRequest.has(pick.id)} accent={C.green}
                  onToggle={() => setTradeRequest(prev => { const n = new Set(prev); n.has(pick.id) ? n.delete(pick.id) : n.add(pick.id); return n; })} />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={proposeTrade}
          disabled={tradeOffer.size === 0 || tradeRequest.size === 0 || submitting}
          style={{ width: '100%', padding: '13px', background: (tradeOffer.size > 0 && tradeRequest.size > 0) ? C.gold : C.surf3, border: 'none', borderRadius: 9, cursor: (tradeOffer.size > 0 && tradeRequest.size > 0) ? 'pointer' : 'default', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: (tradeOffer.size > 0 && tradeRequest.size > 0) ? C.bg : C.muted, textTransform: 'uppercase', transition: 'all .15s' }}
        >
          {submitting ? 'Sending…' : 'Propose Trade'}
        </button>
      </div>
    );
  }

  return null;
}

/* ── League Settings Modal ───────────────────────────────────── */
const SETTINGS_NAV: { key: SettingsSection; label: string; commOnly: boolean }[] = [
  { key: 'league', label: 'League Settings', commOnly: true  },
  { key: 'team',   label: 'Team Settings',   commOnly: false },
  { key: 'roster', label: 'Roster Settings', commOnly: true  },
  { key: 'draft',  label: 'Draft Settings',  commOnly: true  },
  { key: 'danger', label: 'Delete League',   commOnly: true  },
];

function LeagueSettingsModal({ league, myMember, members, isCommissioner, userId, onClose, onUpdate }: {
  league: any; myMember: any; members: any[]; isCommissioner: boolean;
  userId: string | null; onClose: () => void; onUpdate: () => void;
}) {
  const router = useRouter();
  const [section,           setSection]           = useState<SettingsSection>(isCommissioner ? 'league' : 'team');
  const [saving,            setSaving]            = useState(false);
  const [saved,             setSaved]             = useState(false);
  const [deleteConfirm,     setDeleteConfirm]     = useState('');
  const [deleting,          setDeleting]          = useState(false);
  const [showDissolveModal, setShowDissolveModal] = useState(false);
  const [dissolving,        setDissolving]        = useState(false);

  // ── League Settings ──────────────────────────────────────────
  const [leagueName,    setLeagueName]    = useState<string>(league?.name || '');
  const [leagueSize,    setLeagueSize]    = useState<number>(league?.league_size || 8);
  const [customSize,    setCustomSize]    = useState<string>(String(league?.league_size || 8));
  const initConfs = league?.conference_filter && league.conference_filter !== 'ALL'
    ? league.conference_filter.split(',') : [];
  const [selectedConfs, setSelectedConfs] = useState<string[]>(initConfs);

  // ── Team Settings ────────────────────────────────────────────
  const [teamName,     setTeamName]     = useState<string>(myMember?.team_name || '');
  const rosterObj = (myMember?.roster && typeof myMember.roster === 'object' && !Array.isArray(myMember.roster))
    ? myMember.roster as Record<string, any> : {};
  const [teamLogoUrl, setTeamLogoUrl]   = useState<string>(rosterObj.team_logo_url ?? '');

  // ── Roster Settings ──────────────────────────────────────────
  const defaultStarters: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DEF: 1, K: 1 };
  const [starterSlots, setStarterSlots] = useState<Record<string, number>>(
    league?.settings?.starter_slots ?? defaultStarters
  );
  const [benchSpots, setBenchSpots]     = useState<number>(league?.settings?.bench_spots ?? 7);

  // ── Draft Settings ───────────────────────────────────────────
  const [draftType,       setDraftType]       = useState<string>(league?.draft_type ?? 'snake');
  const [pickTimer,       setPickTimer]       = useState<number>(league?.settings?.pick_timer ?? league?.settings?.seconds_per_pick ?? 60);
  const [salaryCap,       setSalaryCap]       = useState<number>(league?.salary_cap ?? 200);
  const [rosterSize,      setRosterSize]      = useState<number>(league?.settings?.roster_size ?? 8);
  const _existingDraftAt = league?.settings?.draft_time ?? league?.settings?.draft_scheduled_at ?? '';
  const [draftDate,  setDraftDate]  = useState<string>(_existingDraftAt ? _existingDraftAt.slice(0, 10) : '');
  const [draftTime,  setDraftTime]  = useState<string>(_existingDraftAt ? _existingDraftAt.slice(11, 16) : '');

  // Build teams list for DraftOrderEditor, sorted by existing draft_order if set
  const existingDraftOrder: any[] = league?.settings?.draft_order ?? [];
  const draftTeams = (() => {
    const humanMembers = members.map((m: any) => ({ userId: m.user_id, teamName: m.team_name }));
    if (existingDraftOrder.length > 0) {
      // Sort by existing slot order; append any members not yet in order
      const ordered = existingDraftOrder
        .filter((t: any) => t.type === 'human')
        .map((t: any) => humanMembers.find(m => m.userId === t.userId))
        .filter(Boolean) as { userId: string; teamName: string }[];
      const inOrder = new Set(ordered.map(t => t.userId));
      const rest = humanMembers.filter(m => !inOrder.has(m.userId));
      return [...ordered, ...rest];
    }
    return humanMembers;
  })();

  const ALL_CONFS = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'FBS Independents'];

  function toggleConf(conf: string) {
    setSelectedConfs(prev => prev.includes(conf) ? prev.filter(c => c !== conf) : [...prev, conf]);
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300_000) { alert('Image must be under 300 KB'); return; }
    const reader = new FileReader();
    reader.onload = ev => setTeamLogoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleDissolveLeague() {
    setDissolving(true);
    try {
      const res = await fetch(`/api/leagues/${league.id}/dissolve`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setShowDissolveModal(false);
        onUpdate();
        onClose();
      } else {
        alert(data.error ?? 'Failed to dissolve league.');
      }
    } finally {
      setDissolving(false);
    }
  }

  async function deleteLeague() {
    if (deleteConfirm !== league?.name) return;
    setDeleting(true);
    await supabase.from('leagues').delete().eq('id', league.id);
    router.push('/');
  }

  async function save() {
    setSaving(true);
    try {
      if (section === 'league' && isCommissioner) {
        const sz = Math.max(2, Math.min(20, parseInt(customSize, 10) || leagueSize));
        const confFilter = selectedConfs.length > 0 ? selectedConfs.join(',') : 'ALL';
        await supabase.from('leagues')
          .update({ name: leagueName.trim(), league_size: sz, conference_filter: confFilter })
          .eq('id', league.id);
      }
      if (section === 'team' && userId && myMember) {
        await supabase.from('league_members')
          .update({ team_name: teamName.trim(), roster: { ...rosterObj, team_logo_url: teamLogoUrl } })
          .eq('id', myMember.id);
      }
      if (section === 'roster' && isCommissioner) {
        await supabase.from('leagues')
          .update({ settings: { ...(league.settings ?? {}), starter_slots: starterSlots, bench_spots: benchSpots } })
          .eq('id', league.id);
      }
      if (section === 'draft' && isCommissioner) {
        const draftTimestamp = (draftDate && draftTime)
          ? new Date(`${draftDate}T${draftTime}:00`).toISOString()
          : (draftDate ? new Date(`${draftDate}T00:00:00`).toISOString() : null);
        await supabase.from('leagues')
          .update({
            draft_type: draftType,
            salary_cap: salaryCap,
            settings: {
              ...(league.settings ?? {}),
              pick_timer: pickTimer,
              seconds_per_pick: pickTimer,
              roster_size: rosterSize,
              draft_time: draftTimestamp,
              draft_scheduled_at: draftTimestamp,
            },
          })
          .eq('id', league.id);
      }
      onUpdate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const canEdit = (commOnly: boolean) => commOnly ? isCommissioner : true;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 13px',
    background: C.bg, border: '1px solid ' + C.surf3,
    borderRadius: 8, color: C.text,
    fontFamily: 'Inter,sans-serif', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .15s',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'Oswald,sans-serif', fontSize: 10,
    letterSpacing: 2, color: C.muted,
    textTransform: 'uppercase', marginBottom: 8, display: 'block',
  };

  function OptionBtn({ value, current, onClick, children }: {
    value: string | number; current: string | number;
    onClick: () => void; children: React.ReactNode;
  }) {
    const active = value === current;
    return (
      <button onClick={onClick} style={{
        flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
        fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1,
        background: active ? 'rgba(212,168,40,0.12)' : C.surf3,
        border: '1px solid ' + (active ? C.gold : C.surf3),
        color: active ? C.gold : C.sub,
        transition: 'all .15s',
      }}>{children}</button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', width: 700, maxWidth: '96vw', height: 520, maxHeight: '90vh',
          background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {/* Left nav */}
        <div style={{
          width: 200, flexShrink: 0, background: C.surf2,
          borderRight: '1px solid ' + C.surf3,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid ' + C.surf3 }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>Settings</div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 3, letterSpacing: .5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{league?.name}</div>
          </div>
          <div style={{ flex: 1, paddingTop: 8 }}>
            {SETTINGS_NAV.map(item => {
              const active  = section === item.key;
              const locked  = item.commOnly && !isCommissioner;
              return (
                <button
                  key={item.key}
                  onClick={() => !locked && setSection(item.key)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: active ? (item.key === 'danger' ? 'rgba(231,76,60,0.08)' : 'rgba(212,168,40,0.08)') : 'none',
                    border: 'none', borderLeft: active ? ('3px solid ' + (item.key === 'danger' ? C.red : C.gold)) : '3px solid transparent',
                    padding: '11px 18px', cursor: locked ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span style={{
                    fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: .5,
                    color: locked ? C.surf3 : (item.key === 'danger' ? (active ? C.red : 'rgba(231,76,60,0.7)') : (active ? C.gold : C.sub)),
                  }}>{item.label}</span>
                  {locked && <span style={{ fontSize: 10, color: C.surf3 }}>🔒</span>}
                </button>
              );
            })}
          </div>
          <button
            onClick={onClose}
            style={{
              margin: 14, padding: '8px 0', background: 'none',
              border: '1px solid ' + C.surf3, borderRadius: 6,
              cursor: 'pointer', fontFamily: 'Oswald,sans-serif',
              fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted,
            }}
          >✕ Close</button>
        </div>

        {/* Right content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Section header */}
          <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid ' + C.surf3, flexShrink: 0 }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
              {SETTINGS_NAV.find(s => s.key === section)?.label}
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginTop: 3 }}>
              {section === 'league' && 'League-wide settings — commissioner only'}
              {section === 'team'   && 'Your team profile — visible to all league members'}
              {section === 'roster' && 'Roster configuration — commissioner only'}
              {section === 'draft'  && 'Draft configuration — commissioner only'}
              {section === 'danger' && 'Danger zone — this action cannot be undone'}
            </div>
          </div>

          {/* Form body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

            {/* ── League Settings ── */}
            {section === 'league' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {/* League name */}
                <div>
                  <label style={labelStyle}>League Name</label>
                  <input
                    value={leagueName}
                    onChange={e => setLeagueName(e.target.value)}
                    disabled={!isCommissioner}
                    style={{ ...inputStyle, opacity: isCommissioner ? 1 : .5 }}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.gold}
                    onBlur={e  => (e.target as HTMLInputElement).style.borderColor = C.surf3}
                  />
                </div>

                {/* Teams count */}
                <div>
                  <label style={labelStyle}>Max Teams</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[4, 6, 8, 10, 12, 14].map(n => (
                      <OptionBtn key={n} value={n} current={parseInt(customSize, 10) || leagueSize} onClick={() => { if (isCommissioner) { setLeagueSize(n); setCustomSize(String(n)); } }}>
                        {n}
                      </OptionBtn>
                    ))}
                    <input
                      type="number" min={2} max={20}
                      value={customSize}
                      onChange={e => { setCustomSize(e.target.value); setLeagueSize(parseInt(e.target.value, 10) || leagueSize); }}
                      disabled={!isCommissioner}
                      placeholder="Custom"
                      style={{ ...inputStyle, width: 74, padding: '8px 10px', fontSize: 12 }}
                    />
                  </div>
                </div>

                {/* Conference filter */}
                <div>
                  <label style={labelStyle}>Available Conferences</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* All conferences toggle */}
                    <div
                      onClick={() => isCommissioner && setSelectedConfs([])}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: selectedConfs.length === 0 ? 'rgba(212,168,40,.12)' : C.surf2, border: '1px solid ' + (selectedConfs.length === 0 ? C.gold : C.surf3), cursor: isCommissioner ? 'pointer' : 'default', transition: 'all .15s' }}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid ' + (selectedConfs.length === 0 ? C.gold : C.surf3), background: selectedConfs.length === 0 ? C.gold : 'none', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: selectedConfs.length === 0 ? C.gold : C.sub }}>All Conferences (FBS)</span>
                    </div>
                    {ALL_CONFS.map(conf => {
                      const checked = selectedConfs.includes(conf);
                      return (
                        <div
                          key={conf}
                          onClick={() => isCommissioner && toggleConf(conf)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: checked ? 'rgba(212,168,40,.08)' : C.surf2, border: '1px solid ' + (checked ? 'rgba(212,168,40,.4)' : C.surf3), cursor: isCommissioner ? 'pointer' : 'default', transition: 'all .15s' }}
                        >
                          <div style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid ' + (checked ? C.gold : C.surf3), background: checked ? C.gold : 'none', flexShrink: 0 }} />
                          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: checked ? C.gold : C.sub }}>{conf}</span>
                        </div>
                      );
                    })}
                  </div>
                  {!isCommissioner && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 6 }}>Only the commissioner can change these settings.</div>}
                </div>
              </div>
            )}

            {/* ── Team Settings ── */}
            {section === 'team' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div>
                  <label style={labelStyle}>Team Name</label>
                  <input
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    placeholder="Enter your team name..."
                    style={inputStyle}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.gold}
                    onBlur={e  => (e.target as HTMLInputElement).style.borderColor = C.surf3}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Team Logo</label>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    {/* Preview */}
                    <div style={{ width: 72, height: 72, borderRadius: 10, background: C.surf3, border: '1px solid ' + C.surf3, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {teamLogoUrl ? (
                        <img src={teamLogoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.muted }}>{(teamName || '?').slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    {/* Upload + URL */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ display: 'inline-block', padding: '8px 14px', background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 7, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: C.sub, textAlign: 'center' }}>
                        📁 Upload Image (max 300 KB)
                        <input type="file" accept="image/*" onChange={handleLogoFile} style={{ display: 'none' }} />
                      </label>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>— OR paste an image URL —</div>
                      <input
                        value={teamLogoUrl}
                        onChange={e => setTeamLogoUrl(e.target.value)}
                        placeholder="https://..."
                        style={{ ...inputStyle, fontSize: 11 }}
                        onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.gold}
                        onBlur={e  => (e.target as HTMLInputElement).style.borderColor = C.surf3}
                      />
                      {teamLogoUrl && (
                        <button onClick={() => setTeamLogoUrl('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.red, textAlign: 'left', padding: 0, letterSpacing: .5 }}>✕ Remove logo</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Roster Settings ── */}
            {section === 'roster' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div>
                  <label style={labelStyle}>Starter Slots</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(['QB', 'RB', 'WR', 'TE', 'FLEX', 'DEF', 'K'] as const).map(pos => {
                      const maxSlots = { QB: 3, RB: 4, WR: 4, TE: 3, FLEX: 3, DEF: 2, K: 2 }[pos] ?? 3;
                      const cur = starterSlots[pos] ?? 1;
                      return (
                        <div key={pos} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: C.surf2, borderRadius: 8, border: '1px solid ' + C.surf3 }}>
                          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text, letterSpacing: .5, width: 44 }}>{pos}</span>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {Array.from({ length: maxSlots }, (_, i) => i + 1).map(n => (
                              <OptionBtn key={n} value={n} current={cur} onClick={() => isCommissioner && setStarterSlots(prev => ({ ...prev, [pos]: n }))}>
                                {n}
                              </OptionBtn>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Bench Spots</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[3, 4, 5, 6, 7, 8].map(n => (
                      <OptionBtn key={n} value={n} current={benchSpots} onClick={() => isCommissioner && setBenchSpots(n)}>
                        {n}
                      </OptionBtn>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Danger Zone ── */}
            {section === 'danger' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Dissolve (paid leagues only) */}
                {(league?.buy_in ?? 0) > 0 && (
                  <div style={{ background: 'rgba(231,76,60,0.06)', border: '1px solid rgba(231,76,60,0.25)', borderRadius: 10, padding: '16px 20px' }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.red, letterSpacing: 1, marginBottom: 6 }}>DISSOLVE LEAGUE</div>
                    <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 14 }}>
                      Cancel the league and refund all members <strong style={{ color: C.text }}>95%</strong> of their ${(league.buy_in).toFixed(2)} entry fee (${(league.buy_in * 0.95).toFixed(2)} per person). The 5% platform rake is non-refundable.
                    </div>
                    <button
                      onClick={() => setShowDissolveModal(true)}
                      style={{ padding: '10px 20px', background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.4)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: C.red }}
                    >Dissolve &amp; Refund</button>
                  </div>
                )}

                {/* Dissolve confirmation modal */}
                {showDissolveModal && (
                  <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, padding: 28, maxWidth: 400, width: '100%' }}>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Dissolve {league?.name}?</div>
                      <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 20, textAlign: 'center' }}>
                        All paid entries will be refunded <strong style={{ color: C.text }}>${(league.buy_in * 0.95).toFixed(2)}</strong> each (95% of entry fee). The league will be cancelled.
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => setShowDissolveModal(false)} style={{ flex: 1, padding: 12, background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub }}>Cancel</button>
                        <button onClick={handleDissolveLeague} disabled={dissolving} style={{ flex: 1, padding: 12, background: 'rgba(231,76,60,.2)', border: '1px solid rgba(231,76,60,.5)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1, color: C.red }}>
                          {dissolving ? 'Dissolving…' : 'Confirm Dissolve'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 10, padding: '16px 20px' }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.red, letterSpacing: 1, marginBottom: 8 }}>DELETE THIS LEAGUE</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                    This will permanently delete <strong style={{ color: C.text }}>{league?.name}</strong>, all members, picks, and scores. This cannot be undone.
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Type the league name to confirm</label>
                  <input
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder={league?.name}
                    style={{ ...inputStyle }}
                  />
                </div>
                <button
                  onClick={deleteLeague}
                  disabled={deleteConfirm !== league?.name || deleting}
                  style={{
                    padding: '12px 24px', borderRadius: 8, cursor: deleteConfirm === league?.name ? 'pointer' : 'not-allowed',
                    background: deleteConfirm === league?.name ? C.red : 'rgba(231,76,60,0.15)',
                    border: '1px solid ' + (deleteConfirm === league?.name ? C.red : 'rgba(231,76,60,0.3)'),
                    color: deleteConfirm === league?.name ? '#fff' : 'rgba(231,76,60,0.5)',
                    fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase',
                    transition: 'all .2s',
                  }}
                >
                  {deleting ? 'Deleting…' : 'Delete League Forever'}
                </button>
              </div>
            )}

            {/* ── Draft Settings ── */}
            {section === 'draft' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {/* Draft type */}
                <div>
                  <label style={labelStyle}>Draft Type</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ v: 'snake', l: '🐍 Snake', sub: 'Serpentine order' }, { v: 'linear', l: '→ Linear', sub: 'Same order each round' }, { v: 'auction', l: '🏦 Auction', sub: 'Bid on each player' }].map(({ v, l, sub }) => (
                      <button key={v} onClick={() => isCommissioner && setDraftType(v)} style={{
                        flex: 1, padding: '10px 0', borderRadius: 8, cursor: isCommissioner ? 'pointer' : 'default',
                        background: v === draftType ? 'rgba(212,168,40,0.12)' : C.surf2,
                        border: '1px solid ' + (v === draftType ? C.gold : C.surf3),
                        color: v === draftType ? C.gold : C.sub,
                        fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
                        transition: 'all .15s',
                      }}>
                        {l}
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: v === draftType ? 'rgba(212,168,40,0.7)' : C.muted, marginTop: 3 }}>{sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pick timer */}
                <div>
                  <label style={labelStyle}>Seconds Per Pick</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[{ l: '30s', v: 30 }, { l: '60s', v: 60 }, { l: '90s', v: 90 }, { l: '2 min', v: 120 }, { l: '∞', v: 0 }].map(({ l, v }) => (
                      <OptionBtn key={v} value={v} current={pickTimer} onClick={() => isCommissioner && setPickTimer(v)}>
                        {l}
                      </OptionBtn>
                    ))}
                  </div>
                </div>

                {/* Auction salary cap (only when auction) */}
                {draftType === 'auction' && (
                  <div>
                    <label style={labelStyle}>Auction Budget Per Team ($)</label>
                    <input
                      type="number" min={50} max={1000} step={50}
                      value={salaryCap}
                      onChange={e => setSalaryCap(parseInt(e.target.value, 10) || 200)}
                      disabled={!isCommissioner}
                      style={{ ...inputStyle, width: 120 }}
                    />
                  </div>
                )}

                {/* Draft order */}
                <div>
                  <label style={labelStyle}>Draft Order</label>
                  {draftTeams.length > 0 ? (
                    <DraftOrderEditor
                      teams={draftTeams}
                      isCommissioner={isCommissioner}
                      onSave={async (orderedUserIds) => {
                        await fetch(`/api/leagues/${league.id}/draft-order`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ orderedUserIds }),
                        });
                        onUpdate();
                      }}
                    />
                  ) : (
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, letterSpacing: .5, padding: '10px 0' }}>
                      Draft order can be set once members join the league.
                    </div>
                  )}
                </div>

                {/* Roster Size */}
                <div>
                  <label style={labelStyle}>Roster Size (picks per manager)</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[6, 7, 8, 9, 10, 12, 14, 16].map(s => (
                      <OptionBtn key={s} value={s} current={rosterSize} onClick={() => isCommissioner && setRosterSize(s)}>{s}</OptionBtn>
                    ))}
                  </div>
                </div>

                {/* Schedule Draft */}
                {isCommissioner && (
                  <div>
                    <label style={labelStyle}>📅 Schedule Draft</label>
                    <input
                      type="date"
                      value={draftDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setDraftDate(e.target.value)}
                      style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }}
                    />
                    <div style={{ marginTop: 12 }}>
                      <label style={{ ...labelStyle, marginTop: 8 }}>Draft Time (ET)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
                        {['12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','20:30','21:00','21:30'].map(t => {
                          const [h, m] = t.split(':'); const hr = parseInt(h);
                          const label = `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
                          return (
                            <button key={t} onClick={() => setDraftTime(t)}
                              style={{ padding: '7px 4px', border: `1px solid ${draftTime === t ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: draftTime === t ? 'rgba(212,168,40,.1)' : C.bg, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: draftTime === t ? C.gold : C.sub, textAlign: 'center' as const }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <input type="time" value={draftTime} onChange={e => setDraftTime(e.target.value)}
                        style={{ ...inputStyle, colorScheme: 'dark' }} />
                    </div>
                    {draftDate && draftTime && (
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, letterSpacing: .5, marginTop: 8 }}>
                        Draft starts: {new Date(`${draftDate}T${draftTime}:00`).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer save button */}
          {(['league', 'team', 'roster', 'draft'].includes(section)) && canEdit(section !== 'team') && (
            <div style={{ padding: '14px 28px', borderTop: '1px solid ' + C.surf3, flexShrink: 0 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  padding: '11px 32px',
                  background: saved ? 'rgba(46,204,113,0.15)' : 'linear-gradient(135deg,#d4a828,#f0c94a)',
                  border: saved ? '1px solid rgba(46,204,113,0.4)' : 'none',
                  borderRadius: 8, cursor: saving ? 'default' : 'pointer',
                  fontFamily: 'Anton,sans-serif', fontSize: 13,
                  letterSpacing: 2, textTransform: 'uppercase',
                  color: saved ? C.green : C.bg,
                  transition: 'all .2s',
                }}
              >
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
