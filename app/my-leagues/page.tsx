'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import WalletDrawer from '@/components/wallet/WalletDrawer';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { useWallet } from '@/context/WalletContext';

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
  invite_code?: string;
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

function InlineLeagueDashboard({ leagueId, nonce, onLoad }: { leagueId: string; nonce?: number; onLoad?: () => void }) {
  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <iframe
        key={`league-${leagueId}-${nonce ?? 0}`}
        src={`/league/${leagueId}?embed=1&t=${nonce ?? 0}`}
        tabIndex={-1}
        {...{ scrolling: 'no' } as any}
        onLoad={(e) => {
          const iframeEl = e.target as HTMLIFrameElement;
          try {
            iframeEl.contentWindow?.scrollTo(0, 0);
            iframeEl.contentDocument?.documentElement?.scrollTo(0, 0);
            iframeEl.contentDocument?.body?.scrollTo(0, 0);
            if (iframeEl.contentDocument) {
              iframeEl.contentDocument.documentElement.scrollTop = 0;
              iframeEl.contentDocument.body.scrollTop = 0;
            }
          } catch {}
          onLoad?.();
          ;(document.activeElement as HTMLElement)?.blur?.();
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="League Dashboard"
      />
    </div>
  );
}

function InlineBracketDashboard({ contestId, leagueData, userId }: {
  contestId: string
  leagueData?: any
  userId?: string
}) {
  const isCommissioner = leagueData?.commissioner_id === userId

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100vh' }}>
      {isCommissioner && leagueData?.invite_code && (
        <div style={{ padding: '12px 20px', background: '#0c1422', borderBottom: '1px solid #1e2d47', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap' as const }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: '#f5a623', textTransform: 'uppercase' as const }}>
            🔑 Invite Code (only you see this):
          </div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 6, color: '#f5a623' }}>
            {leagueData.invite_code}
          </div>
          <button onClick={() => navigator.clipboard.writeText(leagueData.invite_code)}
            style={{ padding: '5px 10px', background: 'none', border: '1px solid #1e2d47', borderRadius: 5, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#7a90aa' }}>
            Copy Code
          </button>
          <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${leagueData.invite_code}`)}
            style={{ padding: '5px 10px', background: 'none', border: '1px solid #1e2d47', borderRadius: 5, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#7a90aa' }}>
            Copy Link
          </button>
          <button onClick={() => {
            const url = `${window.location.origin}/join/${leagueData.invite_code}`
            if (navigator.share) navigator.share({ title: leagueData.name, text: 'Join my bracket!', url })
            else navigator.clipboard.writeText(url)
          }}
            style={{ padding: '5px 10px', background: 'rgba(245,166,35,.1)', border: '1px solid #f5a623', borderRadius: 5, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#f5a623' }}>
            📤 Share
          </button>
        </div>
      )}
      <iframe
        key={contestId}
        src={`/brackets/${contestId}?embed=1`}
        style={{ flex: 1, border: 'none', width: '100%', height: '100%', display: 'block' }}
        title="Bracket"
      />
    </div>
  )
}

// ── MyLeaguesPage ─────────────────────────────────────────────────────────────

function MyLeaguesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { balance: walletBalance } = useWallet();
  const [user,            setUser]            = useState<any>(null);
  const [loading,         setLoading]         = useState(true);
  const [leagues,         setLeagues]         = useState<LeagueData[]>([]);
  const [selected,        setSelected]        = useState<Selection>(null);
  const [iframeNonce,     setIframeNonce]     = useState(0);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [archivedLeagues, setArchivedLeagues] = useState<any[]>([]);
  const [historyFilter,   setHistoryFilter]   = useState<'all' | 'season' | 'weekly' | 'bracket'>('all');
  const [loadingHistory,  setLoadingHistory]  = useState(false);
  const [collapsed,       setCollapsed]       = useState<Record<string, boolean>>({
    season: false, weekly: false, bracket: false,
  });
  const [displayName,     setDisplayName]     = useState('…');
  const [avatarUrl,       setAvatarUrl]       = useState<string | null>(null);
  const [editingProfile,  setEditingProfile]  = useState(false);
  const [newDisplayName,  setNewDisplayName]  = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showWallet,         setShowWallet]         = useState(false);
  const [standaloneBrackets, setStandaloneBrackets] = useState<LeagueData[]>([]);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const touchStartX     = useRef<number>(0);
  const touchStartY     = useRef<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile,    setIsMobile]    = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (isMobile && selected) setSidebarOpen(false);
  }, [selected, isMobile]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (deltaX < -60 && deltaY < 80) setSidebarOpen(false);
    if (deltaX >  60 && deltaY < 80) setSidebarOpen(true);
  }

  function toggleSection(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Scroll right panel to top whenever selection changes
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    rightPanelRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    const t1 = setTimeout(() => rightPanelRef.current?.scrollTo({ top: 0, behavior: 'instant' }), 100)
    const t2 = setTimeout(() => rightPanelRef.current?.scrollTo({ top: 0, behavior: 'instant' }), 500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [selected])

  // Listen for NAVIGATE messages from embedded iframes (e.g. league page guard, mock draft exit)
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'SCROLL_TOP') {
        rightPanelRef.current?.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }
      if (e.data?.type === 'NAVIGATE') {
        const url: string = e.data.url ?? e.data.path ?? '';
        const leagueMatch = url.match(/\/league\/([^/?]+)/);
        if (leagueMatch) {
          // Reload the league iframe back to the league hub (increment nonce to force remount)
          setIframeNonce(n => n + 1);
        } else if (url) {
          window.scrollTo({ top: 0, behavior: 'instant' });
          router.push(url);
        }
      }
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
      const { data: memberships } = await supabase
        .from('league_members')
        .select(`
          team_name,
          league_id,
          leagues (
            id, name, league_type, status, buy_in,
            league_size, is_public, week, settings,
            commissioner_id, invite_code, draft_type, conference_filter
          )
        `)
        .eq('user_id', u.id)
        .eq('is_archived', false)
        .eq('is_deleted', false);
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
      setLoading(false);
    });
  }, [router]);

  const userId = user?.id ?? '';

  useEffect(() => {
    if (selected?.type !== 'history' || !userId) return;
    setLoadingHistory(true);

    Promise.all([
      supabase.from('league_members')
        .select('team_name, league_id, archived_at, leagues(id, name, league_type, buy_in, status, is_public, settings)')
        .eq('user_id', userId)
        .eq('is_archived', true)
        .eq('is_deleted', false),

      supabase.from('transactions')
        .select('league_id, type, amount_cents, status')
        .eq('user_id', userId)
        .in('type', ['contest_entry', 'contest_settlement', 'refund', 'winnings'])
        .eq('status', 'completed'),

      supabase.from('user_bracket_entries')
        .select('contest_id, entry_name, total_score, rank, submitted_at, archived_at, bracket_contests(id, name, sport, entry_fee_cents, status)')
        .eq('user_id', userId)
        .eq('is_archived', true)
        .order('archived_at', { ascending: false }),
    ]).then(([{ data: archived }, { data: txs }, { data: bracketEntries }]) => {
      const txMap: Record<string, { paid: number; won: number }> = {};
      for (const tx of txs ?? []) {
        if (!tx.league_id) continue;
        if (!txMap[tx.league_id]) txMap[tx.league_id] = { paid: 0, won: 0 };
        if (tx.type === 'contest_entry') txMap[tx.league_id].paid += Number(tx.amount_cents);
        if (['contest_settlement', 'winnings', 'refund'].includes(tx.type)) txMap[tx.league_id].won += Number(tx.amount_cents);
      }

      const historyItems = (archived ?? []).map((m: any) => {
        const league = m.leagues as any;
        if (!league) return null;
        const tx = txMap[league.id] ?? { paid: 0, won: 0 };
        const net = tx.won - tx.paid;
        const result = tx.paid === 0 ? 'free' : net > 0 ? 'won' : net < 0 ? 'lost' : 'even';
        return {
          id: league.id,
          name: league.name,
          type: league.league_type,
          is_public: league.is_public,
          buy_in: league.buy_in,
          status: league.status,
          team_name: m.team_name,
          archived_at: m.archived_at,
          paid: tx.paid,
          won: tx.won,
          net,
          result,
        };
      }).filter(Boolean);

      const archivedBrackets = (bracketEntries ?? []).map((e: any) => {
        const contest = e.bracket_contests as any;
        const paid = (contest?.entry_fee_cents ?? 0);
        return {
          id: contest?.id,
          name: contest?.name,
          type: 'bracket',
          sport: contest?.sport,
          team_name: e.entry_name,
          status: contest?.status,
          buy_in: paid / 100,
          paid,
          net: 0,
          result: contest?.status === 'completed' ? 'completed' : 'free',
          archived_at: e.archived_at ?? e.submitted_at,
        };
      });

      setArchivedLeagues([...historyItems, ...archivedBrackets]);
      setLoadingHistory(false);
    });
  }, [selected?.type, userId]);

  useEffect(() => {
    if (!userId) return;

    // Auto-archive completed/cancelled leagues
    const completedLeagues = leagues.filter(l => l.status === 'completed' || l.status === 'cancelled');
    if (completedLeagues.length > 0) {
      supabase.from('league_members')
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq('user_id', userId)
        .in('league_id', completedLeagues.map(l => l.id))
        .eq('is_archived', false)
        .then(() => {});
    }

    // Auto-archive completed bracket contests
    supabase
      .from('user_bracket_entries')
      .select('contest_id, bracket_contests(id, status)')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .then(async ({ data }) => {
        const completedContestIds = (data ?? [])
          .filter(e => (e.bracket_contests as any)?.status === 'completed')
          .map(e => e.contest_id);
        if (completedContestIds.length === 0) return;
        await supabase
          .from('user_bracket_entries')
          .update({ is_archived: true, archived_at: new Date().toISOString() })
          .eq('user_id', userId)
          .in('contest_id', completedContestIds);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, leagues.length]);

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
              <div
                key={league.id}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%',
                  borderLeft: `3px solid ${isActive ? C.gold : 'transparent'}`,
                  background: isActive ? 'rgba(245,166,35,.1)' : 'none',
                }}
              >
                <button
                  onClick={() => { window.scrollTo({ top: 0, behavior: 'instant' }); selectLeague(league); }}
                  style={{
                    flex: 1, padding: '9px 16px',
                    background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    minWidth: 0,
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
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Move "${league.name}" to League History?`)) return;
                    if (league.isStandalone) {
                      await supabase.from('user_bracket_entries')
                        .update({ is_archived: true, archived_at: new Date().toISOString() })
                        .eq('contest_id', league.id)
                        .eq('user_id', userId);
                      setStandaloneBrackets(prev => prev.filter(b => b.id !== league.id));
                    } else {
                      await supabase.from('league_members')
                        .update({ is_archived: true, archived_at: new Date().toISOString() })
                        .eq('league_id', league.id)
                        .eq('user_id', userId);
                      setLeagues(prev => prev.filter(l => l.id !== league.id));
                    }
                  }}
                  style={{ padding: '3px 6px', paddingRight: 12, background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 11, flexShrink: 0 }}
                  title="Move to history"
                >
                  →
                </button>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <>
    <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: 'sans-serif', position: 'relative' as const, overflow: 'hidden' }}>

      {/* LEFT SIDEBAR */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          width: 260, flexShrink: 0,
          background: C.surf,
          borderRight: `1px solid ${C.surf3}`,
          display: 'flex', flexDirection: 'column',
          height: '100vh', overflowY: 'auto' as const,
          ...(isMobile ? {
            position: 'fixed' as const,
            top: 0, left: 0, bottom: 0,
            width: '80vw',
            maxWidth: 320,
            zIndex: 1000,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.6)' : 'none',
            overflowY: 'auto' as const,
          } : {
            position: 'sticky' as const,
            top: 0,
          }),
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
                <div
                  onClick={() => setShowWallet(true)}
                  title="Open wallet"
                  style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.green, cursor: 'pointer' }}
                >
                  ${(walletBalance / 100).toFixed(2)}
                </div>
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

      {/* Mobile backdrop — tap to close sidebar */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed' as const, inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)' }}
        />
      )}

      {/* RIGHT PANEL — inline content */}
      <div
        ref={rightPanelRef}
        tabIndex={-1}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          flex: 1,
          height: '100vh',
          overflowY: 'auto' as const,
          overflowX: 'hidden' as const,
          overscrollBehavior: 'contain',
          isolation: 'isolate' as const,
          contain: 'strict' as const,
          ...(isMobile ? {
            width: '100%',
            minHeight: '100vh',
            overflowY: 'auto' as const,
            paddingBottom: 80,
          } : {}),
        }}>

        {/* Mobile header */}
        {isMobile && (
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', gap: 12, background: C.surf }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gold, fontSize: 20, padding: 4, lineHeight: 1 }}>
              ☰
            </button>
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 1, textTransform: 'uppercase' as const }}>
              {selected?.type === 'history' ? '📜 League History' :
               selected?.type === 'league'  ? (selected.data?.name ?? 'League') :
               selected?.type === 'bracket' ? (selected.data?.name ?? 'Bracket') :
               'My Leagues'}
            </span>
          </div>
        )}

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

        {/* Bracket league — invite strip is handled inside InlineBracketDashboard */}
        {selected?.type === 'league' && selected.data.league_type === 'bracket' && (
          <InlineBracketDashboard
            contestId={selected.data.settings?.bracket_contest_id ?? selected.id}
            leagueData={selected.data}
            userId={userId}
          />
        )}

        {/* Season/weekly league — invite strip is handled inside league hub page */}
        {selected?.type === 'league' && selected.data.league_type !== 'bracket' && (
          <div style={{ height: '100vh', overflow: 'hidden', position: 'relative' }}>
            <InlineLeagueDashboard leagueId={selected.id} nonce={iframeNonce} onLoad={() => rightPanelRef.current?.scrollTo({ top: 0, behavior: 'instant' })} />
          </div>
        )}

        {/* Standalone bracket iframe */}
        {selected?.type === 'bracket' && (
          <InlineBracketDashboard contestId={selected.data?.settings?.bracket_contest_id ?? selected.contestId} />
        )}

        {/* League History */}
        {selected?.type === 'history' && (
          <div style={{ padding: 32 }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              📜 League History
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginBottom: 20 }}>
              All past leagues and contests
            </div>

            {/* Category filter tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' as const }}>
              {([
                { key: 'all',     label: 'All' },
                { key: 'season',  label: '🏈 Season' },
                { key: 'weekly',  label: '⚡ Weekly' },
                { key: 'bracket', label: '🏆 Bracket' },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setHistoryFilter(f.key)}
                  style={{ padding: '6px 14px', background: historyFilter === f.key ? 'rgba(245,166,35,.1)' : C.surf2, border: `1px solid ${historyFilter === f.key ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: historyFilter === f.key ? C.gold : C.muted, textTransform: 'uppercase' as const }}>
                  {f.label}
                </button>
              ))}
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11 }}>Loading history…</div>
            ) : archivedLeagues.filter(l => historyFilter === 'all' || l.type === historyFilter).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 40px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.muted }}>No history yet</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 4 }}>
                  Move leagues here using the → button in the sidebar
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {archivedLeagues
                  .filter(l => historyFilter === 'all' || l.type === historyFilter)
                  .map(league => (
                    <div key={`${league.id}-${league.team_name}`} style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: league.is_public ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {league.name}
                          </span>
                          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, background: C.surf2, padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>
                            {league.type}
                          </span>
                        </div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                          {league.team_name} · {league.buy_in === 0 ? 'Free' : `$${league.buy_in} entry`}
                        </div>
                      </div>

                      {/* Win/Loss indicator */}
                      <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                        {league.result === 'free' || league.buy_in === 0 ? (
                          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted }}>Free</div>
                        ) : league.result === 'won' ? (
                          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.green }}>
                            +${(league.net / 100).toFixed(2)}
                          </div>
                        ) : league.result === 'lost' ? (
                          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.red }}>
                            -${(league.paid / 100).toFixed(2)}
                          </div>
                        ) : (
                          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted }}>—</div>
                        )}
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, marginTop: 1 }}>
                          {league.result === 'won' ? '🏆 Won' : league.result === 'lost' ? '❌ Lost' : league.result === 'free' ? '✓ Free' : ''}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => setSelected({ type: 'league', id: league.id, data: league })}
                          style={{ padding: '6px 10px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.sub }}>
                          View
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Remove "${league.name}" from your history? This cannot be undone.`)) return;
                            await supabase.from('league_members')
                              .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                              .eq('league_id', league.id)
                              .eq('user_id', userId);
                            setArchivedLeagues(prev => prev.filter(l => !(l.id === league.id && l.team_name === league.team_name)));
                          }}
                          style={{ padding: '6px 8px', background: 'rgba(240,58,90,.08)', border: '1px solid rgba(240,58,90,.2)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: C.red }}>
                          🗑️
                        </button>
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
