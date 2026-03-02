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
  const [user, setUser] = useState<User | null>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
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
    if (code.length >= 6) window.location.href = '/join/' + code;
  }

  if (loadingUser) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'Anton, sans-serif', color: C.muted, letterSpacing: 4, fontSize: 12 }}>LOADING...</div>
    </div>
  );

  if (user && !showCreate) return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <nav style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, background: 'rgba(5,8,15,.95)', borderBottom: '2px solid ' + C.gold, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ marginRight: 'auto', fontFamily: 'Anton, sans-serif', fontSize: 17, letterSpacing: 2.5, textTransform: 'uppercase', color: C.gold }}>College Units Fantasy</div>
        <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: C.muted }}>{user.email}</span>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: '1px solid ' + C.surf3, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 10, color: C.muted }}>Sign Out</button>
      </nav>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontFamily: 'Anton, sans-serif', fontSize: 28, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase', marginBottom: 6 }}>My Leagues</h1>
        <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: 13, color: C.sub, marginBottom: 28 }}>2026 College Football Season</p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
          <button onClick={() => setShowCreate(true)} style={{ padding: '12px 24px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: C.bg }}>+ Create League</button>
          <form onSubmit={handleJoinSubmit} style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="Enter invite code..." value={inviteCode} onChange={e => setInviteCode(e.target.value)} maxLength={8} style={{ padding: '12px 14px', background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 8, color: C.text, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, outline: 'none', width: 180, letterSpacing: 2, textTransform: 'uppercase' }} />
            <button type="submit" style={{ padding: '12px 18px', background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub }}>Join</button>
          </form>
        </div>
        {leagues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏟️</div>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 22, color: C.text, textTransform: 'uppercase', marginBottom: 8 }}>No Leagues Yet</div>
            <button onClick={() => setShowCreate(true)} style={{ padding: '14px 32px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: 14, letterSpacing: 2, color: C.bg }}>Create Your First League</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {leagues.map((item, i) => {
              const l = item.leagues;
              if (!l) return null;
              return (
                <div key={i} onClick={() => window.location.href = '/league/' + l.id} style={{ padding: '18px 20px', background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, color: C.text, textTransform: 'uppercase', marginBottom: 4 }}>{l.name}</div>
                    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: C.sub }}>{item.team_name} · {l.league_size} teams · {l.buy_in === 0 ? 'Free' : '$' + l.buy_in}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );

  if (user && showCreate) return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <nav style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', background: 'rgba(5,8,15,.95)', borderBottom: '2px solid ' + C.gold, position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 13, color: C.sub }}>Back</button>
      </nav>
      <CreateLeagueWizard />
    </div>
  );

  return (
    <>
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
        <nav style={{ height: 60, display: 'flex', alignItems: 'center', padding: '0 32px', borderBottom: '2px solid ' + C.gold, background: 'rgba(5,8,15,.8)' }}>
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 3, textTransform: 'uppercase', marginRight: 'auto', color: C.gold }}>🏈 College Units Fantasy</div>
          <button onClick={() => setShowAuth(true)} style={{ padding: '8px 20px', background: C.gold, border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: 12, letterSpacing: 2, color: C.bg }}>Sign In</button>
        </nav>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ maxWidth: 640 }}>
            <h1 style={{ fontFamily: 'Anton, sans-serif', fontSize: 80, letterSpacing: 2, textTransform: 'uppercase', lineHeight: .95, marginBottom: 24, color: C.gold }}>College Units Fantasy</h1>
            <p style={{ fontFamily: 'Oswald, sans-serif', fontSize: 17, color: C.sub, lineHeight: 1.7, marginBottom: 36 }}>Draft whole CFB position units — not individual players. Real depth charts. Real stakes.</p>
            <button onClick={() => setShowAuth(true)} style={{ padding: '16px 44px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton, sans-serif', fontSize: 16, letterSpacing: 2.5, color: C.bg, textTransform: 'uppercase' }}>Create League</button>
          </div>
        </div>
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
