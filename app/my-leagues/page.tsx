'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import WalletDrawer from '@/components/wallet/WalletDrawer';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

const C = {
  bg:    '#070a12',
  surf:  '#0c1422',
  surf2: '#131d30',
  surf3: '#1e2d47',
  gold:  '#f5a623',
  text:  '#e4edf7',
  sub:   '#7a90aa',
  muted: '#3e5470',
  green: '#15c678',
  red:   '#f03a5a',
};

type LeagueData = {
  id: string;
  name: string;
  league_type: string;
  status: string;
  buy_in: number;
  league_size: number;
  is_public: boolean;
  week?: number;
  settings: any;
  commissioner_id?: string;
  draft_type?: string;
  conference_filter?: string;
  team_name: string;
  isStandalone?: boolean;
};

type Selection =
  | { type: 'league';  id: string;        data: LeagueData }
  | { type: 'bracket'; contestId: string; data: LeagueData }
  | { type: 'history' }
  | null;

type HistoryEntry = {
  league: any;
  entryFee: number;
  payout: number;
  net: number;
  result: 'won' | 'lost' | 'refunded' | 'free';
};

// ── Iframe panel components ───────────────────────────────────────────────────

function InlineLeagueDashboard({ leagueId }: { leagueId: string }) {
  return (
    <iframe
      key={leagueId}
      src={`/league/${leagueId}?embed=1`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="League Dashboard"
    />
  );
}

function InlineBracketDashboard({ contestId }: { contestId: string }) {
  return (
    <iframe
      key={contestId}
      src={`/brackets/${contestId}`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Bracket"
    />
  );
}

// ── MyLeaguesPage ─────────────────────────────────────────────────────────────

function MyLeaguesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user,            setUser]            = useState<any>(null);
  const [loading,         setLoading]         = useState(true);
  const [leagues,         setLeagues]         = useState<LeagueData[]>([]);
  const [selected,        setSelected]        = useState<Selection>(null);
  const [history,         setHistory]         = useState<HistoryEntry[]>([]);
  const [historyLoading,  setHistoryLoading]  = useState(false);
  const [collapsed,       setCollapsed]       = useState<Record<string, boolean>>({
    season: false, weekly: false, bracket: false,
  });
  const [displayName,     setDisplayName]     = useState('…');
  const [avatarUrl,       setAvatarUrl]       = useState<string | null>(null);
  const [editingProfile,  setEditingProfile]  = useState(false);
  const [newDisplayName,  setNewDisplayName]  = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [walletBalance,      setWalletBalance]      = useState<number | null>(null);
  const [showWallet,         setShowWallet]         = useState(false);
  const [standaloneBrackets, setStandaloneBrackets] = useState<LeagueData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleSection(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Listen for NAVIGATE messages from embedded iframes (e.g. league page guard)
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'NAVIGATE') router.push(e.data.path);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [router]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (!u) { router.push('/'); return; }
      setUser(u);
      setAvatarUrl(u.user_metadata?.avatar_url ?? null);
      setDisplayName(u.user_metadata?.display_name ?? u.email?.split('@')[0] ?? 'User');
      const [{ data: memberships }, walletRes] = await Promise.all([
        supabase
          .from('league_members')
          .select(`
            team_name,
            leagues (
              id, name, league_type, status, buy_in,
              league_size, is_public, week, settings,
              commissioner_id, draft_type, conference_filter
            )
          `)
          .eq('user_id', u.id),
        fetch('/api/wallet'),
      ]);
      const validLeagues = (memberships ?? [])
        .map((m: any) => m.leagues ? { ...m.leagues, team_name: m.team_name } : null)
        .filter(Boolean) as LeagueData[];
      setLeagues(validLeagues);

      // Also fetch standalone bracket contest entries (not linked to a league)
      const { data: bracketEntries } = await supabase
        .from('user_bracket_entries')
        .select('contest_id, entry_name, contest:bracket_contests(id, name, sport, entry_fee_cents, status)')
        .eq('user_id', u.id);

      const linkedContestIds = new Set(
        validLeagues
          .filter(l => l.league_type === 'bracket')
          .map(l => l.settings?.bracket_contest_id)
          .filter(Boolean)
      );

      const standaloneItems: LeagueData[] = (bracketEntries ?? [])
        .filter(e => !linkedContestIds.has(e.contest_id))
        .map(e => {
          const c = (e as any).contest;
          return {
            id:           e.contest_id,
            name:         c?.name ?? 'Bracket',
            league_type:  'bracket',
            is_public:    true,
            buy_in:       (c?.entry_fee_cents ?? 0) / 100,
            league_size:  0,
            status:       c?.status ?? 'open',
            settings:     { bracket_contest_id: e.contest_id },
            team_name:    e.entry_name ?? 'My Bracket',
            isStandalone: true,
          };
        });

      setStandaloneBrackets(standaloneItems);

      if (walletRes.ok) {
        const walletData = await walletRes.json();
        setWalletBalance(walletData.wallet?.balance ?? null);
      }
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    if (selected?.type !== 'history' || !user) return;
    setHistoryLoading(true);
    async function fetchHistory() {
      const { data: memberships } = await supabase
        .from('league_members')
        .select('league_id, team_name, leagues(id, name, status, buy_in, league_type, is_public, settings)')
        .eq('user_id', user.id);
      const completed = (memberships ?? []).filter((m: any) => {
        const s = m.leagues?.status;
        return s === 'completed' || s === 'cancelled';
      });
      const leagueIds = completed.map((m: any) => m.league_id).filter(Boolean);
      let payouts: any[] = [];
      if (leagueIds.length > 0) {
        const { data: txData } = await supabase
          .from('transactions')
          .select('league_id, type, amount_cents, status')
          .eq('user_id', user.id)
          .in('type', ['contest_settlement', 'winnings', 'refund'])
          .eq('status', 'completed')
          .in('league_id', leagueIds);
        payouts = txData ?? [];
      }
      const leagueEntries: HistoryEntry[] = completed
        .filter((m: any) => m.leagues !== null)
        .map((m: any) => {
          const lg = m.leagues;
          const entryFee = Math.round((lg?.buy_in ?? 0) * 100);
          const payoutTx = payouts.find((p: any) => p.league_id === m.league_id);
          const payoutAmount = payoutTx?.amount_cents ?? 0;
          const net = payoutAmount - entryFee;
          let result: HistoryEntry['result'];
          if (entryFee === 0) result = 'free';
          else if (lg?.status === 'cancelled') result = 'refunded';
          else if (payoutAmount > 0) result = 'won';
          else result = 'lost';
          return { league: lg, entryFee, payout: payoutAmount, net, result };
        });

      // Also fetch completed bracket entries
      const { data: bracketEntries } = await supabase
        .from('user_bracket_entries')
        .select('contest_id, rank, total_score, contest:bracket_contests(id, name, entry_fee_cents, entry_count, status, settings)')
        .eq('user_id', user.id);

      const bracketHistoryEntries: HistoryEntry[] = (bracketEntries ?? [])
        .filter(e => (e.contest as any)?.status === 'completed')
        .map(e => {
          const c = e.contest as any;
          const feeCents = c?.entry_fee_cents ?? 0;
          const totalEntries = c?.entry_count ?? 0;
          const netPool = Math.floor(feeCents * totalEntries * 0.95);
          const ps: string = c?.settings?.payout_structure ?? 'winner_take_all';
          const rank = e.rank ?? 999;

          let payoutCents = 0;
          if (feeCents > 0 && netPool > 0) {
            if (ps === 'winner_take_all' && rank === 1) {
              payoutCents = netPool;
            } else if (ps === 'top2') {
              if (rank === 1) payoutCents = Math.floor(netPool * 0.70);
              else if (rank === 2) payoutCents = netPool - Math.floor(netPool * 0.70);
            } else if (ps === 'top3') {
              if (rank === 1) payoutCents = Math.floor(netPool * 0.60);
              else if (rank === 2) payoutCents = Math.floor(netPool * 0.25);
              else if (rank === 3) payoutCents = netPool - Math.floor(netPool * 0.60) - Math.floor(netPool * 0.25);
            } else if (ps === 'double_up') {
              const numWinners = Math.floor(totalEntries / 2);
              if (rank <= numWinners) payoutCents = Math.floor(feeCents * 1.95);
            }
          }

          const net = payoutCents - feeCents;
          let result: HistoryEntry['result'];
          if (feeCents === 0) result = 'free';
          else if (payoutCents > 0) result = 'won';
          else result = 'lost';

          return {
            league: { id: c?.id ?? e.contest_id, name: c?.name ?? 'Bracket Contest', league_type: 'bracket', status: 'completed', is_public: true },
            entryFee: feeCents,
            payout: payoutCents,
            net,
            result,
          };
        });

      setHistory([...leagueEntries, ...bracketHistoryEntries]);
      setHistoryLoading(false);
    }
    fetchHistory();
  }, [selected?.type, user?.id]);

  const userId = user?.id ?? '';

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const { data } = await supabase.storage
      .from('avatars')
      .upload(`${userId}/${Date.now()}.${file.name.split('.').pop()}`, file, { upsert: true });
    if (data) {
      const url = supabase.storage.from('avatars').getPublicUrl(data.path).data.publicUrl;
      setAvatarUrl(url);
      await supabase.auth.updateUser({ data: { avatar_url: url } });
    }
    setUploadingAvatar(false);
  }

  async function handleSaveName() {
    if (!newDisplayName.trim()) return;
    await supabase.auth.updateUser({ data: { display_name: newDisplayName.trim() } });
    setDisplayName(newDisplayName.trim());
    setEditingProfile(false);
  }

  const seasonLeagues     = leagues.filter(l => l.league_type === 'season');
  const weeklyLeagues     = leagues.filter(l => l.league_type === 'weekly');
  const bracketLeagues    = leagues.filter(l => l.league_type === 'bracket');
  const allBracketLeagues = [...bracketLeagues, ...standaloneBrackets];

  // Auto-select from ?contest= or ?league= query params after data loads
  useEffect(() => {
    const contestId = searchParams.get('contest');
    const leagueId  = searchParams.get('league');

    if (contestId && allBracketLeagues.length > 0) {
      const found = allBracketLeagues.find(
        l => l.settings?.bracket_contest_id === contestId || l.id === contestId
      );
      if (found) {
        setSelected({ type: 'bracket', contestId: found.settings?.bracket_contest_id ?? found.id, data: found });
        setCollapsed(prev => ({ ...prev, bracket: false }));
      }
    }

    if (leagueId && (seasonLeagues.length + weeklyLeagues.length) > 0) {
      const found = [...seasonLeagues, ...weeklyLeagues].find(l => l.id === leagueId);
      if (found) {
        setSelected({ type: 'league', id: found.id, data: found });
        setCollapsed(prev => ({ ...prev, [found.league_type]: false }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allBracketLeagues.length, seasonLeagues.length, weeklyLeagues.length]);

  function selectLeague(league: LeagueData) {
    if (league.league_type === 'bracket') {
      setSelected({ type: 'bracket', contestId: league.settings?.bracket_contest_id ?? league.id, data: league });
    } else {
      setSelected({ type: 'league', id: league.id, data: league });
    }
  }

  function renderSection(sectionKey: string, emoji: string, title: string, items: LeagueData[]) {
    const isCollapsed = collapsed[sectionKey];
    return (
      <div>
        <button
          onClick={() => toggleSection(sectionKey)}
          style={{
            width: '100%', padding: '10px 16px',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>{emoji}</span>
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' as const }}>
              {title}
            </span>
            {items.length > 0 && (
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, background: C.surf3, padding: '1px 6px', borderRadius: 10 }}>
                {items.length}
              </span>
            )}
          </div>
          <span style={{ color: C.muted, fontSize: 12, display: 'inline-block', transition: 'transform .2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
            ▾
          </span>
        </button>

        {!isCollapsed && (
          items.length === 0 ? (
            <div style={{ padding: '4px 19px 10px', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, opacity: 0.5 }}>
              No leagues
            </div>
          ) : items.map(league => {
            const isActive =
              (selected?.type === 'league'  && selected.id        === league.id) ||
              (selected?.type === 'bracket' && selected.data?.id  === league.id);
            return (
              <button
                key={league.id}
                onClick={() => selectLeague(league)}
                style={{
                  width: '100%', padding: '9px 16px',
                  background: isActive ? 'rgba(245,166,35,.1)' : 'none',
                  border: 'none',
                  borderLeft: `3px solid ${isActive ? C.gold : 'transparent'}`,
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  {league.buy_in > 0 && (
                    <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.green, flexShrink: 0 }}>$</span>
                  )}
                  <span style={{
                    fontFamily: 'Oswald,sans-serif', fontSize: 12,
                    color: league.is_public ? C.gold : C.text,
                    letterSpacing: 0.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                  }}>
                    {league.name}
                  </span>
                </div>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, flexShrink: 0 }}>
                  {league.status === 'active' ? '🟢' : league.status === 'completed' ? '✓' : '○'}
                </span>
              </button>
            );
          })
        )}
      </div>
    );
  }

  return (
    <>
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: 'sans-serif' }}>

      {/* LEFT SIDEBAR — always visible */}
      <div style={{
        width: 260, flexShrink: 0,
        background: C.surf,
        borderRight: `1px solid ${C.surf3}`,
        display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0, overflowY: 'auto',
      }}>
        {/* Editable profile */}
        <div style={{ padding: '16px', borderBottom: `1px solid ${C.surf3}`, flexShrink: 0 }}>
          {!editingProfile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, border: `2px solid ${C.surf3}`, position: 'relative' }}
                title="Click to change photo"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.bg }}>
                    {displayName[0]?.toUpperCase()}
                  </div>
                )}
                <div
                  style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
                >
                  <span style={{ fontSize: 16 }}>📷</span>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  onClick={() => { setEditingProfile(true); setNewDisplayName(displayName); }}
                  title="Click to edit name"
                  style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, cursor: 'pointer' }}
                >
                  {displayName}
                </div>
                {walletBalance !== null ? (
                  <div
                    onClick={() => setShowWallet(true)}
                    title="Open wallet"
                    style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.green, cursor: 'pointer' }}
                  >
                    ${(walletBalance / 100).toFixed(2)}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>My Leagues</div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
                Edit Display Name
              </div>
              <input
                value={newDisplayName}
                onChange={e => setNewDisplayName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingProfile(false); }}
                autoFocus
                maxLength={32}
                style={{ width: '100%', padding: '8px 10px', background: C.surf2, border: `1px solid ${C.gold}`, borderRadius: 6, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleSaveName} style={{ flex: 1, padding: '7px', background: C.gold, border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: C.bg }}>
                  Save
                </button>
                <button onClick={() => setEditingProfile(false)} style={{ flex: 1, padding: '7px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {uploadingAvatar && (
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: 'center' as const, marginTop: 4 }}>
              Uploading…
            </div>
          )}
        </div>

        {/* Scrollable league list */}
        <div style={{ flex: 1, overflowY: 'auto' as const }}>
          {loading ? (
            <div style={{ padding: '24px 16px', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, letterSpacing: 1 }}>
              Loading…
            </div>
          ) : (
            <>
              {renderSection('season',  '🏈', 'Season Leagues', seasonLeagues)}
              <div style={{ height: 1, background: C.surf3, margin: '4px 16px' }} />
              {renderSection('weekly',  '⚡', 'Weekly Leagues', weeklyLeagues)}
              <div style={{ height: 1, background: C.surf3, margin: '4px 16px' }} />
              {renderSection('bracket', '🏆', 'Bracket',        allBracketLeagues)}
            </>
          )}
        </div>

        {/* Bottom pinned */}
        <div style={{ borderTop: `1px solid ${C.surf3}`, flexShrink: 0 }}>
          <button
            onClick={() => setSelected({ type: 'history' })}
            style={{
              width: '100%', padding: '12px 16px',
              background: selected?.type === 'history' ? 'rgba(245,166,35,.08)' : 'none',
              border: 'none',
              borderLeft: `3px solid ${selected?.type === 'history' ? C.gold : 'transparent'}`,
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ fontSize: 14 }}>📜</span>
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: selected?.type === 'history' ? C.gold : C.sub }}>
              League History
            </span>
          </button>
          <button
            onClick={() => router.push('/')}
            style={{
              width: '100%', padding: '12px 16px',
              background: 'none', border: 'none',
              borderTop: `1px solid ${C.surf3}`,
              cursor: 'pointer', textAlign: 'left' as const,
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ fontSize: 14 }}>🏠</span>
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, letterSpacing: 0.5 }}>
              Home Page
            </span>
          </button>
        </div>
      </div>

      {/* RIGHT PANEL — inline content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Welcome screen */}
        {selected === null && (
          <div style={{ textAlign: 'center', padding: '80px 40px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏟️</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              Welcome, {displayName}
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted }}>
              Select a league from the sidebar to get started
            </div>
          </div>
        )}

        {/* League iframe */}
        {selected?.type === 'league' && (
          <InlineLeagueDashboard leagueId={selected.id} />
        )}

        {/* Bracket iframe */}
        {selected?.type === 'bracket' && (
          <InlineBracketDashboard contestId={selected.contestId} />
        )}

        {/* League History */}
        {selected?.type === 'history' && (
          <div style={{ padding: 32 }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              📜 League History
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginBottom: 24 }}>
              All leagues you've participated in
            </div>

            {historyLoading ? (
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, letterSpacing: 1 }}>Loading history…</div>
            ) : history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 40px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.muted }}>No completed leagues yet</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((entry, i) => (
                  <div key={entry.league?.id ?? i} style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: entry.league?.is_public ? C.gold : C.text, marginBottom: 2 }}>
                        {entry.league?.name}
                      </div>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                        {entry.league?.league_type} · {entry.league?.status}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontFamily: 'Anton,sans-serif', fontSize: 16,
                        color: entry.result === 'won' ? C.green : entry.result === 'refunded' ? C.gold : entry.result === 'free' ? C.sub : C.red,
                      }}>
                        {entry.result === 'won'      ? `+$${(entry.net / 100).toFixed(2)}` :
                         entry.result === 'lost'     ? `-$${(entry.entryFee / 100).toFixed(2)}` :
                         entry.result === 'refunded' ? 'Refunded' : 'Free'}
                      </div>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 2 }}>
                        {entry.result === 'won'      ? '🏆 Won' :
                         entry.result === 'lost'     ? '❌ Lost' :
                         entry.result === 'refunded' ? '↩️ Refunded' : '✓ Free'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    <WalletDrawer isOpen={showWallet} onClose={() => setShowWallet(false)} />
    </>
  );
}

export default function MyLeaguesPage() {
  return (
    <Suspense fallback={<div style={{ background: '#070a12', minHeight: '100vh' }} />}>
      <MyLeaguesContent />
    </Suspense>
  );
}
