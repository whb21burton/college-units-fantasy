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

type LeagueEntry = {
  team_name: string;
  league_id: string;
  leagues: {
    id: string;
    name: string;
    league_type: string;
    status: string;
    buy_in: number;
    league_size: number;
    settings: any;
  } | null;
};

const STATUS_COLORS: Record<string, string> = {
  forming:    C.sub,
  drafting:   C.gold,
  active:     C.green,
  completed:  C.muted,
};

export default function MyLeaguesPage() {
  const router = useRouter();
  const [user,          setUser]          = useState<any>(null);
  const [entries,       setEntries]       = useState<LeagueEntry[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState<'season' | 'weekly'>('season');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (!u) { router.push('/'); return; }
      setUser(u);
      const { data } = await supabase
        .from('league_members')
        .select('team_name, league_id, leagues(id, name, league_type, status, buy_in, league_size, settings)')
        .eq('user_id', u.id);
      setEntries((data ?? []) as unknown as LeagueEntry[]);
      setLoading(false);
    });
  }, [router]);

  const displayName = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? '…';
  const initials    = displayName.slice(0, 2).toUpperCase();

  const seasonLeagues = entries.filter(e => e.leagues?.league_type === 'season');
  const weeklyLeagues = entries.filter(e => e.leagues?.league_type === 'weekly');
  const shown         = tab === 'season' ? seasonLeagues : weeklyLeagues;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', fontFamily: 'sans-serif' }}>

      {/* SIDEBAR */}
      <div style={{ width: 240, flexShrink: 0, background: C.surf, borderRight: `1px solid ${C.surf3}`, display: 'flex', flexDirection: 'column', padding: '24px 0' }}>
        {/* Avatar */}
        <div style={{ padding: '0 20px 24px', borderBottom: `1px solid ${C.surf3}` }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton, sans-serif', fontSize: 18, color: C.bg, marginBottom: 10 }}>
            {initials}
          </div>
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 16, letterSpacing: 1, color: C.text, textTransform: 'uppercase' }}>
            {displayName}
          </div>
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginTop: 2 }}>
            My Leagues
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: '16px 0', flex: 1 }}>
          {([
            { key: 'season', label: '🏈 Season Leagues', count: seasonLeagues.length },
            { key: 'weekly', label: '⚡ Weekly Leagues', count: weeklyLeagues.length },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                width: '100%', padding: '12px 20px', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderLeft: tab === key ? `3px solid ${C.gold}` : '3px solid transparent',
                fontFamily: 'Oswald, sans-serif', fontSize: 12, letterSpacing: 1,
                color: tab === key ? C.gold : C.sub, textTransform: 'uppercase', transition: 'all .12s',
              }}
            >
              <span>{label}</span>
              {count > 0 && (
                <span style={{ background: tab === key ? C.gold : C.surf3, color: tab === key ? C.bg : C.sub, borderRadius: 10, padding: '1px 7px', fontSize: 10, fontFamily: 'Oswald, sans-serif' }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Back link */}
        <div style={{ padding: '0 20px', borderTop: `1px solid ${C.surf3}`, paddingTop: 16 }}>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 1, color: C.muted, textTransform: 'uppercase', padding: 0 }}
          >
            ← Back to Home
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 24, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 24 }}>
          {tab === 'season' ? '🏈 Season Leagues' : '⚡ Weekly Leagues'}
        </div>

        {loading ? (
          <div style={{ color: C.muted, fontFamily: 'Oswald, sans-serif', fontSize: 13, letterSpacing: 1 }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 16, color: C.sub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              No {tab === 'season' ? 'season' : 'weekly'} leagues yet
            </div>
            <button
              onClick={() => router.push('/leagues')}
              style={{ marginTop: 16, padding: '10px 24px', background: 'rgba(245,166,35,.12)', border: `1px solid ${C.gold}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: 'uppercase' }}
            >
              Browse Public Contests →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shown.map(entry => {
              const lg = entry.leagues;
              if (!lg) return null;
              const statusColor = STATUS_COLORS[lg.status] ?? C.muted;
              return (
                <div
                  key={`${entry.league_id}-${entry.team_name}`}
                  style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'border-color .12s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.gold + '55')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.surf3)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 1, color: C.text, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lg.name}
                      </div>
                      <span style={{ flexShrink: 0, fontFamily: 'Oswald, sans-serif', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', background: statusColor + '22', border: `1px solid ${statusColor}44`, borderRadius: 4, padding: '2px 7px', color: statusColor }}>
                        {lg.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1 }}>
                        🏈 {entry.team_name}
                      </span>
                      <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1 }}>
                        👥 {lg.league_size} teams
                      </span>
                      <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: lg.buy_in > 0 ? C.gold : C.green, letterSpacing: 1 }}>
                        {lg.buy_in === 0 ? '🆓 Free' : `🪙 $${lg.buy_in.toFixed(2)} entry`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/league/${lg.id}`)}
                    style={{ flexShrink: 0, marginLeft: 20, padding: '10px 20px', background: 'rgba(245,166,35,.1)', border: `1px solid ${C.gold}44`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', transition: 'all .12s', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,166,35,.2)'; e.currentTarget.style.borderColor = C.gold; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,166,35,.1)'; e.currentTarget.style.borderColor = C.gold + '44'; }}
                  >
                    Enter League →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
