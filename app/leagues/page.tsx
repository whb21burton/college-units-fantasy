'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a', muted: '#4a5d7a',
  text: '#e8edf5', sub: '#7a90b0', green: '#2ecc71', red: '#e74c3c',
};

type League = {
  id: string;
  name: string;
  buy_in: number;
  league_size: number;
  draft_type: string;
  league_type: string;
  week: number | null;
  status: string;
  invite_code: string;
  member_count: number;
};

export default function PublicLeaguesPage() {
  const router  = useRouter();
  const [leagues,  setLeagues]  = useState<League[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [user,     setUser]     = useState<any>(null);
  const [filter,   setFilter]   = useState<'all' | 'free' | 'paid'>('all');
  const [joining,  setJoining]  = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null));
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('leagues')
        .select('id, name, buy_in, league_size, draft_type, league_type, week, status, invite_code')
        .eq('is_public', true)
        .eq('status', 'forming')
        .order('created_at', { ascending: false });

      if (error || !data) { setLoading(false); return; }

      // Fetch member counts in parallel
      const counts = await Promise.all(
        data.map(l =>
          supabase
            .from('league_members')
            .select('*', { count: 'exact', head: true })
            .eq('league_id', l.id)
            .then(({ count }) => ({ id: l.id, count: count ?? 0 }))
        )
      );
      const countMap: Record<string, number> = {};
      counts.forEach(c => { countMap[c.id] = c.count; });

      setLeagues(data.map(l => ({ ...l, member_count: countMap[l.id] ?? 0 })));
      setLoading(false);
    }
    load();
  }, []);

  async function handleJoin(league: League) {
    if (!user) { router.push('/'); return; }
    if (league.buy_in > 0) {
      // Redirect to invite join page — it will trigger Stripe checkout
      router.push(`/join/${league.invite_code}`);
    } else {
      // Free league — join directly via invite page
      router.push(`/join/${league.invite_code}`);
    }
  }

  const displayed = leagues.filter(l => {
    if (filter === 'free') return l.buy_in === 0;
    if (filter === 'paid') return l.buy_in > 0;
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '40px 20px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 10, letterSpacing: 4, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>
            🏈 Open Leagues
          </div>
          <h1 style={{ fontFamily: "'Anton',sans-serif", fontSize: 36, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase', margin: 0 }}>
            Find a League
          </h1>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.sub, marginTop: 8 }}>
            Public leagues open to all players. Join now before they fill up.
          </p>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
          {(['all', 'free', 'paid'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '8px 20px',
                borderRadius: 20,
                border: `1px solid ${filter === f ? C.gold : C.surf3}`,
                background: filter === f ? 'rgba(212,168,40,.12)' : 'transparent',
                color: filter === f ? C.gold : C.sub,
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
                cursor: 'pointer', transition: 'all .15s',
                textTransform: 'capitalize',
              }}
            >
              {f === 'all' ? 'All Leagues' : f === 'free' ? 'Free' : 'With Buy-In'}
            </button>
          ))}
        </div>

        {/* League cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: "'Oswald',sans-serif", fontSize: 13, letterSpacing: 2 }}>
            Loading leagues…
          </div>
        ) : displayed.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 24px',
            background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 18, color: C.sub, textTransform: 'uppercase' }}>
              No open leagues right now
            </div>
            <button
              onClick={() => router.push('/')}
              style={{
                marginTop: 20, padding: '12px 28px',
                background: 'linear-gradient(135deg,#d4a828,#f0c94a)',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: "'Anton',sans-serif", fontSize: 13, letterSpacing: 2,
                color: C.bg,
              }}
            >
              Create One →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {displayed.map(league => {
              const spotsLeft = league.league_size - league.member_count;
              const isFull    = spotsLeft <= 0;
              const pctFull   = Math.min(1, league.member_count / league.league_size);

              return (
                <div
                  key={league.id}
                  style={{
                    background: C.surf,
                    border: `1px solid ${C.surf3}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.gold + '66')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.surf3)}
                >
                  {/* Top accent bar */}
                  <div style={{ height: 3, background: `linear-gradient(90deg,#d4a828,transparent)` }} />

                  <div style={{ padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>

                      {/* Left: name + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {league.name}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                          {/* League type */}
                          {league.league_type === 'weekly' ? (
                            <span style={pillStyle('rgba(245,166,35,.15)', '#f5a623')}>
                              ⚡ Weekly{league.week ? ` · Wk ${league.week}` : ''}
                            </span>
                          ) : (
                            <span style={pillStyle(C.sub + '22', C.sub)}>
                              {league.draft_type === 'snake' ? '🐍 Snake' : '💰 Salary'}
                            </span>
                          )}
                          {/* Buy-in */}
                          <span style={pillStyle(
                            league.buy_in > 0 ? 'rgba(212,168,40,.12)' : 'rgba(46,204,113,.1)',
                            league.buy_in > 0 ? C.gold : C.green,
                          )}>
                            {league.buy_in === 0 ? 'Free' : `$${league.buy_in} Buy-In`}
                          </span>
                          {/* Pot size */}
                          {league.buy_in > 0 && (
                            <span style={pillStyle('rgba(212,168,40,.06)', C.sub)}>
                              🏆 ${league.buy_in * league.league_size} pot
                            </span>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted }}>
                              {league.member_count} / {league.league_size} spots filled
                            </span>
                            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: isFull ? C.red : C.green }}>
                              {isFull ? 'Full' : `${spotsLeft} open`}
                            </span>
                          </div>
                          <div style={{ height: 4, background: C.surf3, borderRadius: 2 }}>
                            <div style={{
                              height: '100%', borderRadius: 2,
                              background: isFull
                                ? C.red
                                : pctFull > 0.7
                                  ? 'linear-gradient(90deg,#d4a828,#f0c94a)'
                                  : C.green,
                              width: `${pctFull * 100}%`,
                              transition: 'width .4s',
                            }} />
                          </div>
                        </div>
                      </div>

                      {/* Right: join button */}
                      <div style={{ flexShrink: 0 }}>
                        <button
                          onClick={() => { setJoining(league.id); handleJoin(league).finally(() => setJoining(null)); }}
                          disabled={isFull || joining === league.id}
                          style={{
                            padding: '10px 22px',
                            background: isFull
                              ? C.surf3
                              : 'linear-gradient(135deg,#d4a828,#f0c94a)',
                            border: 'none', borderRadius: 8, cursor: isFull ? 'not-allowed' : 'pointer',
                            fontFamily: "'Anton',sans-serif", fontSize: 13, letterSpacing: 1.5,
                            color: isFull ? C.muted : C.bg,
                            transition: 'opacity .15s',
                            opacity: joining === league.id ? 0.6 : 1,
                          }}
                        >
                          {joining === league.id ? '...' : isFull ? 'Full' : league.buy_in > 0 ? `Join $${league.buy_in + Math.round(league.buy_in * 0.1)}` : 'Join Free'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer CTA */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.muted, marginBottom: 12 }}>
            Don't see what you're looking for?
          </div>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '12px 32px',
              background: 'transparent',
              border: `1px solid ${C.surf3}`,
              borderRadius: 8, cursor: 'pointer',
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
              color: C.sub, transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.gold; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.surf3; e.currentTarget.style.color = C.sub; }}
          >
            Create Your Own League →
          </button>
        </div>
      </div>
    </div>
  );
}

function pillStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center',
    padding: '3px 10px', borderRadius: 20,
    background: bg, color,
    fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600,
  };
}
