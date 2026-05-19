'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  team_name: string;
};

type Selection =
  | { type: 'league'; id: string; data: LeagueData }
  | { type: 'history' }
  | null;

type HistoryEntry = {
  league: any;
  entryFee: number;
  payout: number;
  net: number;
  result: 'won' | 'lost' | 'refunded' | 'free';
};

export default function MyLeaguesPage() {
  const router = useRouter();
  const [user,           setUser]           = useState<any>(null);
  const [loading,        setLoading]        = useState(true);
  const [leagues,        setLeagues]        = useState<LeagueData[]>([]);
  const [selected,       setSelected]       = useState<Selection>(null);
  const [memberCount,    setMemberCount]    = useState<number | null>(null);
  const [history,        setHistory]        = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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
            commissioner_id
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

  const selectedLeagueId = selected?.type === 'league' ? selected.id : null;

  useEffect(() => {
    if (!selectedLeagueId) { setMemberCount(null); return; }
    supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', selectedLeagueId)
      .then(({ count }) => setMemberCount(count));
  }, [selectedLeagueId]);

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

  function renderSection(emoji: string, title: string, items: LeagueData[]) {
    return (
      <div>
        <div style={{ padding: '12px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' as const }}>
            {emoji} {title}{items.length > 0 ? ` (${items.length})` : ''}
          </div>
        </div>
        {items.length === 0 ? (
          <div style={{ padding: '4px 19px 10px', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, opacity: 0.5 }}>
            No leagues
          </div>
        ) : items.map(league => {
          const isActive = selected?.type === 'league' && selected.id === league.id;
          return (
            <button
              key={league.id}
              onClick={() => setSelected({ type: 'league', id: league.id, data: league })}
              style={{
                width: '100%', padding: '9px 16px',
                background: isActive ? 'rgba(245,166,35,.1)' : 'none',
                border: 'none',
                borderLeft: `3px solid ${isActive ? C.gold : 'transparent'}`,
                cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span style={{
                fontFamily: 'Oswald,sans-serif', fontSize: 12,
                color: league.is_public ? C.gold : C.text,
                letterSpacing: 0.5,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                maxWidth: 155,
                display: 'block',
              }}>
                {league.name}
              </span>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, flexShrink: 0, marginLeft: 4 }}>
                {league.status}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', fontFamily: 'sans-serif', overflow: 'hidden' }}>

      {/* SIDEBAR */}
      <div style={{
        width: 260, flexShrink: 0,
        background: C.surf,
        borderRight: `1px solid ${C.surf3}`,
        display: 'flex', flexDirection: 'column',
        height: '100vh',
      }}>
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
              {renderSection('🏈', 'Season Leagues', seasonLeagues)}
              <div style={{ height: 1, background: C.surf3, margin: '4px 16px' }} />
              {renderSection('⚡', 'Weekly Leagues', weeklyLeagues)}
              <div style={{ height: 1, background: C.surf3, margin: '4px 16px' }} />
              {renderSection('🏆', 'Bracket', bracketLeagues)}
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

        {/* League detail */}
        {selected?.type === 'league' && (
          <div style={{ padding: 32 }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' as const }}>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, color: selected.data.is_public ? C.gold : C.text, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {selected.data.name}
                </div>
                <div style={{ padding: '3px 10px', borderRadius: 4, background: selected.data.is_public ? 'rgba(245,166,35,.15)' : 'rgba(255,255,255,.08)', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: selected.data.is_public ? C.gold : C.muted, textTransform: 'uppercase' }}>
                  {selected.data.is_public ? 'Public' : 'Private'}
                </div>
              </div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted }}>
                {selected.data.league_type === 'season' ? '🏈 Season Long' : selected.data.league_type === 'weekly' ? "⚡ Weekly Pick'em" : '🏆 Bracket'}
                {selected.data.week ? ` · Week ${selected.data.week}` : ''}
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              {([
                ['Entry Fee', selected.data.buy_in === 0 ? 'Free' : `$${selected.data.buy_in}`],
                ['Teams', `${memberCount ?? '?'}/${selected.data.league_size === 999999 ? '∞' : selected.data.league_size}`],
                ['Status', selected.data.status],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} style={{ background: C.surf2, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Your team name */}
            {selected.data.team_name && (
              <div style={{ marginBottom: 24, padding: '12px 16px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8 }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Your Team</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 14, color: C.text }}>{selected.data.team_name}</div>
              </div>
            )}

            <button
              onClick={() => router.push(`/league/${selected.id}`)}
              style={{ width: '100%', padding: '14px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.bg, textTransform: 'uppercase' }}
            >
              Enter League →
            </button>

            {selected.data.league_type === 'bracket' && selected.data.settings?.bracket_contest_id && (
              <button
                onClick={() => router.push(`/brackets/${selected.data.settings.bracket_contest_id}`)}
                style={{ width: '100%', padding: '14px', background: 'none', border: `1px solid ${C.gold}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginTop: 10 }}
              >
                View Bracket →
              </button>
            )}
          </div>
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
  );
}
