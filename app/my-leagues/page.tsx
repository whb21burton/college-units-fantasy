'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
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
};

type Selection =
  | { type: 'league';  id: string; data: LeagueData }
  | { type: 'bracket'; id: string; data: LeagueData }
  | { type: 'history' }
  | null;

type HistoryEntry = {
  league: any;
  entryFee: number;
  payout: number;
  net: number;
  result: 'won' | 'lost' | 'refunded' | 'free';
};

// ── InlineLeagueView ──────────────────────────────────────────────────────────

function InlineLeagueView({ leagueId, leagueData, onBack }: {
  leagueId: string;
  leagueData: LeagueData;
  onBack?: () => void;
}) {
  const router = useRouter();
  const sb = createClientComponentClient();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb.from('league_members')
      .select('user_id, team_name, is_bot')
      .eq('league_id', leagueId)
      .then(({ data }) => {
        setMembers((data ?? []).filter((m: any) => !m.is_bot));
        setLoading(false);
      });
  }, [leagueId]);

  return (
    <div style={{ padding: '32px 32px', maxWidth: 700 }}>
      {/* Mobile back button */}
      {onBack && (
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1, marginBottom: 20, padding: 0 }}
        >
          ← Back
        </button>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' as const }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 30, color: leagueData.is_public ? C.gold : C.text, letterSpacing: 1, textTransform: 'uppercase', lineHeight: 1 }}>
            {leagueData.name}
          </div>
          <div style={{ padding: '3px 10px', borderRadius: 4, background: leagueData.is_public ? 'rgba(245,166,35,.15)' : 'rgba(255,255,255,.08)', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: leagueData.is_public ? C.gold : C.muted, textTransform: 'uppercase' }}>
            {leagueData.is_public ? '🌐 Public' : '🔒 Private'}
          </div>
          {leagueData.buy_in > 0 && (
            <div style={{ padding: '3px 10px', borderRadius: 4, background: 'rgba(21,198,120,.12)', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.green, textTransform: 'uppercase' }}>
              $ Paid
            </div>
          )}
        </div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted }}>
          {leagueData.league_type === 'season'  ? '🏈 Season Long' :
           leagueData.league_type === 'weekly'  ? `⚡ Weekly Pick'em${leagueData.week ? ` · Week ${leagueData.week}` : ''}` :
           '🏆 Bracket'}
          {leagueData.conference_filter && leagueData.conference_filter !== 'All D1'
            ? ` · ${leagueData.conference_filter}` : ''}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {([
          ['Entry Fee', leagueData.buy_in === 0 ? 'Free' : `$${Number(leagueData.buy_in).toFixed(2)}`],
          ['Teams',     loading ? '…' : `${members.length}/${leagueData.league_size === 999999 ? '∞' : leagueData.league_size}`],
          ['Status',    leagueData.status ?? 'pending'],
          ['Type',      leagueData.draft_type ?? 'snake'],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} style={{ background: C.surf2, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: C.text, textTransform: 'capitalize' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Your team */}
      {leagueData.team_name && (
        <div style={{ marginBottom: 20, padding: '12px 16px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3 }}>Your Team</div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 14, color: C.text }}>{leagueData.team_name}</div>
          </div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: leagueData.status === 'active' ? C.green : C.muted, letterSpacing: 1 }}>
            {leagueData.status === 'active' ? '● ACTIVE' : leagueData.status === 'completed' ? '✓ DONE' : '○ PENDING'}
          </div>
        </div>
      )}

      {/* Members list */}
      {!loading && members.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>
            Members ({members.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {members.slice(0, 8).map((m, i) => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: C.surf2, borderRadius: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 10, color: C.muted, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub }}>
                  {m.team_name || `Team ${i + 1}`}
                </div>
              </div>
            ))}
            {members.length > 8 && (
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, padding: '4px 12px' }}>
                +{members.length - 8} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Open full dashboard */}
      <button
        onClick={() => router.push(`/league/${leagueId}`)}
        style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.bg, textTransform: 'uppercase' }}
      >
        Open Full Dashboard →
      </button>

      {leagueData.league_type === 'bracket' && leagueData.settings?.bracket_contest_id && (
        <button
          onClick={() => router.push(`/brackets/${leagueData.settings.bracket_contest_id}`)}
          style={{ width: '100%', padding: '12px', background: 'none', border: `1px solid ${C.gold}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginTop: 10 }}
        >
          View Bracket →
        </button>
      )}
    </div>
  );
}

// ── MyLeaguesPage ─────────────────────────────────────────────────────────────

export default function MyLeaguesPage() {
  const router = useRouter();
  const [user,           setUser]           = useState<any>(null);
  const [loading,        setLoading]        = useState(true);
  const [leagues,        setLeagues]        = useState<LeagueData[]>([]);
  const [selected,       setSelected]       = useState<Selection>(null);
  const [history,        setHistory]        = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [collapsed,      setCollapsed]      = useState<Record<string, boolean>>({
    season: false, weekly: false, bracket: false,
  });
  const [mobileShowContent, setMobileShowContent] = useState(false);

  function toggleSection(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (!u) { router.push('/'); return; }
      setUser(u);
      const { data: memberships } = await supabase
        .from('league_members')
        .select(`
          team_name,
          leagues (
            id, name, league_type, status, buy_in,
            league_size, is_public, week, settings,
            commissioner_id, draft_type, conference_filter
          )
        `)
        .eq('user_id', u.id);
      const validLeagues = (memberships ?? [])
        .map((m: any) => m.leagues ? { ...m.leagues, team_name: m.team_name } : null)
        .filter(Boolean) as LeagueData[];
      setLeagues(validLeagues);
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
      const entries: HistoryEntry[] = completed
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
      setHistory(entries);
      setHistoryLoading(false);
    }
    fetchHistory();
  }, [selected?.type, user?.id]);

  const displayName = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? '…';

  const seasonLeagues  = leagues.filter(l => l.league_type === 'season');
  const weeklyLeagues  = leagues.filter(l => l.league_type === 'weekly');
  const bracketLeagues = leagues.filter(l => l.league_type === 'bracket');

  function selectLeague(league: LeagueData) {
    const type = league.league_type === 'bracket' ? 'bracket' : 'league';
    setSelected({ type, id: league.id, data: league } as Selection);
    setMobileShowContent(true);
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
            const isActive = (selected?.type === 'league' || selected?.type === 'bracket') && selected.id === league.id;
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

  // On mobile: show sidebar OR content, not both
  const showSidebar = !mobileShowContent || selected === null;
  const showContent = !showSidebar || typeof window === 'undefined' || window.innerWidth >= 768;

  function handleBack() {
    setSelected(null);
    setMobileShowContent(false);
  }

  return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', fontFamily: 'sans-serif', overflow: 'hidden' }}>

      {/* SIDEBAR — hidden on mobile when content is showing */}
      <div style={{
        width: 260, flexShrink: 0,
        background: C.surf,
        borderRight: `1px solid ${C.surf3}`,
        display: mobileShowContent && selected ? 'none' : 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
        className="my-leagues-sidebar"
      >
        {/* User avatar */}
        <div style={{ padding: '20px 16px', borderBottom: `1px solid ${C.surf3}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: C.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.bg, flexShrink: 0,
            }}>
              {displayName[0]?.toUpperCase() ?? '?'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {displayName}
              </div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>My Leagues</div>
            </div>
          </div>
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
              {renderSection('bracket', '🏆', 'Bracket',        bracketLeagues)}
            </>
          )}
        </div>

        {/* Bottom pinned */}
        <div style={{ borderTop: `1px solid ${C.surf3}`, flexShrink: 0 }}>
          <button
            onClick={() => { setSelected({ type: 'history' }); setMobileShowContent(true); }}
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
            onClick={() => router.push('/create-league')}
            style={{
              width: '100%', padding: '12px 16px',
              background: 'none', border: 'none',
              borderTop: `1px solid ${C.surf3}`,
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ fontSize: 14 }}>➕</span>
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.green }}>
              Create League
            </span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflowY: 'auto' as const }}>

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

        {/* Inline league view */}
        {(selected?.type === 'league' || selected?.type === 'bracket') && (
          <InlineLeagueView
            leagueId={selected.id}
            leagueData={selected.data}
            onBack={mobileShowContent ? handleBack : undefined}
          />
        )}

        {/* League History */}
        {selected?.type === 'history' && (
          <div style={{ padding: 32 }}>
            {/* Mobile back */}
            {mobileShowContent && (
              <button
                onClick={handleBack}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1, marginBottom: 20, padding: 0 }}
              >
                ← Back
              </button>
            )}
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
  );
}
