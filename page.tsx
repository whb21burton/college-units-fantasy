'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { AuthModal } from '@/components/auth/AuthModal';
import { CreateLeagueWizard } from '@/components/league/CreateLeagueWizard';
import type { User } from '@supabase/supabase-js';

const C = {
  bg:'#05080f', surf:'#0c1220', surf2:'#131d30', surf3:'#1e2d47',
  gold:'#d4a828', goldLight:'#f0c94a', goldDark:'#a07e18',
  muted:'#4a5d7a', text:'#e8edf5', sub:'#7a90b0', green:'#2ecc71',
};

export default function Home() {
  const [user, setUser]             = useState<User | null>(null);
  const [leagues, setLeagues]       = useState<any[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [showAuth, setShowAuth]     = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoadingUser(false);
      if (user) loadLeagues();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadLeagues();
      else setLeagues([]);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadLeagues() {
    const { data } = await supabase
      .from('league_members')
      .select('team_name, leagues(id, name, status, league_size, buy_in, invite_code)')
      .order('joined_at', { ascending: false });
    setLeagues(data || []);
  }

  function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = inviteCode.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (code.length >= 6) window.location.href = `/join/${code}`;
  }

  if (loadingUser) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: "'Anton', sans-serif", color: C.muted,
        letterSpacing: 4, fontSize: 12 }}>LOADING...</div>
    </div>
  );

  // ── LOGGED IN: show dashboard ─────────────────────────────
  if (user && !showCreate) return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      backgroundImage: 'radial-gradient(ellipse 80% 30% at 50% -5%, rgba(212,168,40,.07) 0%, transparent 60%)',
    }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        .fi { animation: fadeIn .3s ease; }
      `}</style>

      {/* Nav */}
      <nav style={{
        height: 56, display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 16,
        background: 'rgba(5,8,15,.95)', borderBottom: `2px solid ${C.gold}`,
        position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)',
      }}>
        <div style={{ marginRight: 'auto' }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 17,
            letterSpacing: 2.5, textTransform: 'uppercase',
            background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            College Units Fantasy
          </div>
        </div>
        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11,
          color: C.muted, letterSpacing: 1 }}>{user.email}</span>
        <button onClick={() => supabase.auth.signOut()} style={{
          background: 'none', border: `1px solid ${C.surf3}`,
          borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
          fontFamily: "'Oswald', sans-serif", fontSize: 10,
          letterSpacing: 1.5, color: C.muted,
        }}>Sign Out</button>
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>
        <div className="fi">
          <h1 style={{ fontFamily: "'Anton', sans-serif", fontSize: 28,
            letterSpacing: 1.5, color: C.text, textTransform: 'uppercase',
            marginBottom: 6 }}>My Leagues</h1>
          <p style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13,
            color: C.sub, marginBottom: 28 }}>2026 College Football Season</p>
        </div>

        {/* Action row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
          <button onClick={() => setShowCreate(true)} style={{
            padding: '12px 24px',
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: "'Anton', sans-serif", fontSize: 13,
            letterSpacing: 2, textTransform: 'uppercase', color: C.bg,
          }}>+ Create League</button>

          <form onSubmit={handleJoinSubmit} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Enter invite code..."
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              maxLength={8}
              style={{
                padding: '12px 14px', background: C.surf,
                border: `1px solid ${C.surf3}`, borderRadius: 8,
                color: C.text, fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 14, outline: 'none', width: 180,
                letterSpacing: 2, textTransform: 'uppercase',
              }}
            />
            <button type="submit" style={{
              padding: '12px 18px', background: C.surf2,
              border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer',
              fontFamily: "'Oswald', sans-serif", fontSize: 12,
              letterSpacing: 1.5, color: C.sub,
            }}>Join →</button>
          </form>
        </div>

        {/* Leagues list */}
        {leagues.length === 0 ? (
          <div className="fi" style={{
            textAlign: 'center', padding: '64px 24px',
            background: C.surf, border: `1px solid ${C.surf3}`,
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏟️</div>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22,
              letterSpacing: 1, color: C.text, textTransform: 'uppercase',
              marginBottom: 8 }}>No Leagues Yet</div>
            <div style={{ fontFamily: "'Oswald', sans-serif", color: C.sub,
              fontSize: 13, marginBottom: 24 }}>
              Create your first league or enter an invite code to join a friend's.
            </div>
            <button onClick={() => setShowCreate(true)} style={{
              padding: '14px 32px',
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: "'Anton', sans-serif", fontSize: 14,
              letterSpacing: 2, color: C.bg,
            }}>Create Your First League →</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {leagues.map((item, i) => {
              const l = item.leagues;
              if (!l) return null;
              return (
                <div key={i} className="fi" onClick={() => window.location.href = `/league/${l.id}`}
                  style={{
                    padding: '18px 20px',
                    background: C.surf, border: `1px solid ${C.surf3}`,
                    borderRadius: 12, cursor: 'pointer', transition: 'all .15s',
                    display: 'flex', alignItems: 'center', gap: 16,
                    position: 'relative', overflow: 'hidden',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.background = C.surf2; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.surf3; e.currentTarget.style.background = C.surf; }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
                    background: C.gold }} />
                  <div style={{ flex: 1, paddingLeft: 8 }}>
                    <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18,
                      letterSpacing: 1, color: C.text, textTransform: 'uppercase',
                      marginBottom: 4 }}>{l.name}</div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11,
                        color: C.sub }}>
                        🏷️ {item.team_name}
                      </span>
                      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted }}>
                        {l.league_size} teams · {l.buy_in === 0 ? 'Free' : `$${l.buy_in}`}
                      </span>
                    </div>
                  </div>
                  <StatusChip status={l.status}/>
                  <div style={{ color: C.muted, fontSize: 18 }}>›</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ── CREATE LEAGUE FLOW ────────────────────────────────────
  if (user && showCreate) return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <nav style={{
        height: 56, display: 'flex', alignItems: 'center',
        padding: '0 24px',
        background: 'rgba(5,8,15,.95)', borderBottom: `2px solid ${C.gold}`,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <button onClick={() => setShowCreate(false)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: "'Oswald', sans-serif", fontSize: 13,
          letterSpacing: 1.5, color: C.sub, display: 'flex', alignItems: 'center', gap: 6,
        }}>← Back</button>
      </nav>
      <CreateLeagueWizard />
    </div>
  );

  // ── LOGGED OUT: landing page ──────────────────────────────
  return (
    <>
      <div style={{
        minHeight: '100vh', background: C.bg,
        backgroundImage: `
          radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212,168,40,.12) 0%, transparent 70%),
          linear-gradient(180deg, rgba(12,18,32,0) 0%, ${C.bg} 100%)
        `,
        display: 'flex', flexDirection: 'column',
      }}>
        <style>{`
          @keyframes heroIn {
            from { opacity:0; transform:translateY(24px); }
            to   { opacity:1; transform:translateY(0); }
          }
          .hero-in { animation: heroIn .6s ease forwards; }
          .hero-in-2 { animation: heroIn .6s .12s ease both; }
          .hero-in-3 { animation: heroIn .6s .24s ease both; }
        `}</style>

        {/* Nav */}
        <nav style={{
          height: 60, display: 'flex', alignItems: 'center',
          padding: '0 32px', borderBottom: `2px solid ${C.gold}`,
          background: 'rgba(5,8,15,.8)', backdropFilter: 'blur(12px)',
        }}>
          <div style={{
            fontFamily: "'Anton', sans-serif", fontSize: 18,
            letterSpacing: 3, textTransform: 'uppercase', marginRight: 'auto',
            background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>🏈 College Units Fantasy</div>
          <button onClick={() => setShowAuth(true)} style={{
            padding: '8px 20px',
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
            border: 'none', borderRadius: 6, cursor: 'pointer',
            fontFamily: "'Anton', sans-serif", fontSize: 12,
            letterSpacing: 2, color: C.bg,
          }}>Sign In</button>
        </nav>

        {/* Hero */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ maxWidth: 640 }}>
            <div className="hero-in" style={{
              display: 'inline-block', marginBottom: 20,
              fontFamily: "'Oswald', sans-serif", fontSize: 11,
              letterSpacing: 4, color: C.gold, textTransform: 'uppercase',
              background: 'rgba(212,168,40,.1)', border: '1px solid rgba(212,168,40,.2)',
              padding: '6px 18px', borderRadius: 20,
            }}>🏈 2026 College Football Season</div>

            <h1 className="hero-in-2" style={{
              fontFamily: "'Anton', sans-serif",
              fontSize: 'clamp(52px, 10vw, 88px)',
              letterSpacing: 2, textTransform: 'uppercase',
              lineHeight: .95, marginBottom: 24,
            }}>
              <span style={{
                background: `linear-gradient(135deg, ${C.goldLight} 0%, ${C.gold} 50%, ${C.goldDark} 100%)`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>College<br/>Units<br/>Fantasy</span>
            </h1>

            <p className="hero-in-3" style={{
              fontFamily: "'Oswald', sans-serif", fontSize: 17,
              color: C.sub, letterSpacing: .5, lineHeight: 1.7, marginBottom: 36,
            }}>
              Draft whole CFB position units — not individual players.<br/>
              Real depth charts. Real stakes. True college football strategy.
            </p>

            <div className="hero-in-3" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setShowAuth(true)} style={{
                padding: '16px 44px',
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: "'Anton', sans-serif", fontSize: 16,
                letterSpacing: 2.5, color: C.bg, textTransform: 'uppercase',
                boxShadow: '0 8px 32px rgba(212,168,40,.3)',
              }}>Create League →</button>

              <button onClick={() => setShowAuth(true)} style={{
                padding: '16px 32px',
                background: 'none', border: `1px solid ${C.surf3}`,
                borderRadius: 8, cursor: 'pointer',
                fontFamily: "'Oswald', sans-serif", fontSize: 13,
                letterSpacing: 2, color: C.sub, textTransform: 'uppercase',
              }}>Join a League</button>
            </div>

            {/* Stats row */}
            <div className="hero-in-3" style={{
              display: 'flex', gap: 0, justifyContent: 'center',
              marginTop: 56, borderTop: `1px solid ${C.surf3}`, paddingTop: 36,
            }}>
              {[['130+','Schools'],['500+','Players'],['15','Draft Picks'],['6-Team','Playoffs']].map(([n,l],i) => (
                <div key={l} style={{
                  flex: 1, textAlign: 'center',
                  borderRight: i < 3 ? `1px solid ${C.surf3}` : 'none',
                  padding: '0 20px',
                }}>
                  <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 28,
                    letterSpacing: 1, color: C.gold }}>{n}</div>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10,
                    letterSpacing: 2.5, color: C.muted, textTransform: 'uppercase',
                    marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} />
      )}
    </>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    forming:  ['FORMING',  '#d4a828', 'rgba(212,168,40,.1)'],
    drafting: ['DRAFTING', '#2ecc71', 'rgba(46,204,113,.1)'],
    active:   ['ACTIVE',   '#2ecc71', 'rgba(46,204,113,.1)'],
    playoffs: ['PLAYOFFS', '#f0c94a', 'rgba(240,201,74,.1)'],
    complete: ['COMPLETE', '#7a90b0', 'rgba(122,144,176,.1)'],
  };
  const [label, color, bg] = map[status] || map.forming;
  return (
    <span style={{
      fontFamily: "'Oswald', sans-serif", fontSize: 9, letterSpacing: 2,
      color, background: bg, border: `1px solid ${color}40`,
      padding: '3px 8px', borderRadius: 4, flexShrink: 0,
    }}>{label}</span>
  );
}
