'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { CreateLeagueWizard } from '@/components/league/CreateLeagueWizard';

const C = {
  bg:'#05080f', surf:'#0c1220', surf2:'#131d30', surf3:'#1e2d47',
  gold:'#d4a828', goldLight:'#f0c94a', goldDark:'#a07e18',
  muted:'#4a5d7a', text:'#e8edf5', sub:'#7a90b0',
  green:'#2ecc71', red:'#e74c3c',
};

type View = 'landing' | 'signin' | 'signup' | 'dashboard' | 'create' | 'join';

export default function HomePage() {
  const router = useRouter();
  const [view, setView] = useState<View>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [leagues, setLeagues] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setView('dashboard');
        loadLeagues(session.user.id);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setView('dashboard');
        loadLeagues(session.user.id);
      } else {
        setUser(null);
        setView('landing');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadLeagues(userId: string) {
    const { data } = await supabase
      .from('league_members')
      .select('league_id, leagues(*)')
      .eq('user_id', userId);
    if (data) setLeagues(data.map((d: any) => d.leagues).filter(Boolean));
  }

  async function handleSignIn() {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleSignUp() {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: displayName } },
    });
    if (error) setError(error.message);
    else setMessage('Check your email to confirm your account.');
    setLoading(false);
  }

  async function handleJoin() {
    setLoading(true); setError(null);
    const code = joinCode.trim().toUpperCase();
    const { data: league } = await supabase
      .from('leagues')
      .select('id, name, league_size')
      .eq('invite_code', code)
      .single();
    if (!league) { setError('Invalid invite code.'); setLoading(false); return; }
    router.push(`/join/${code}`);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    background: C.surf2, border: `1px solid ${C.surf3}`,
    borderRadius: 8, color: C.text,
    fontFamily: "'Inter', sans-serif", fontSize: 15,
    outline: 'none', marginBottom: 12,
  };

  const btnStyle: React.CSSProperties = {
    width: '100%', padding: '14px',
    background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontFamily: "'Anton', sans-serif", fontSize: 14,
    letterSpacing: 2, textTransform: 'uppercase', color: C.bg,
  };

  const ghostStyle: React.CSSProperties = {
    width: '100%', padding: '14px',
    background: 'none', border: `1px solid ${C.surf3}`,
    borderRadius: 8, cursor: 'pointer',
    fontFamily: "'Anton', sans-serif", fontSize: 14,
    letterSpacing: 2, textTransform: 'uppercase', color: C.sub,
    marginTop: 10,
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <style>{`
        * { box-sizing: border-box; }
        input:focus { outline: none !important; border-color: ${C.gold} !important; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp .4s ease; }
      `}</style>

      {/* LANDING */}
      {view === 'landing' && (
        <div className="fade-up" style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 5, color: C.gold, textTransform: 'uppercase', marginBottom: 16 }}>
            College Fantasy Football
          </div>
          <h1 style={{ fontFamily: "'Anton', sans-serif", fontSize: 56, letterSpacing: 2, textTransform: 'uppercase', lineHeight: 1, marginBottom: 8 }}>
            UNITS
          </h1>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, color: C.sub, letterSpacing: 1, marginBottom: 48 }}>
            Draft college football units. Dominate your league.
          </div>
          <button onClick={() => setView('signup')} style={{ ...btnStyle, marginBottom: 12 }}>Get Started</button>
          <button onClick={() => setView('signin')} style={ghostStyle}>Sign In</button>
          <div style={{ marginTop: 24 }}>
            <span
              onClick={() => setView('join')}
              style={{ fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.muted, cursor: 'pointer', letterSpacing: 1 }}
            >
              Have an invite code? Join a league →
            </span>
          </div>
        </div>
      )}

      {/* SIGN IN */}
      {view === 'signin' && (
        <div className="fade-up" style={{ maxWidth: 400, margin: '0 auto', padding: '80px 24px' }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 28, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 32, textAlign: 'center' }}>Sign In</div>
          <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12, fontFamily: "'Oswald', sans-serif" }}>{error}</div>}
          <button onClick={handleSignIn} disabled={loading} style={btnStyle}>{loading ? 'Signing in...' : 'Sign In'}</button>
          <button onClick={() => setView('landing')} style={ghostStyle}>← Back</button>
        </div>
      )}

      {/* SIGN UP */}
      {view === 'signup' && (
        <div className="fade-up" style={{ maxWidth: 400, margin: '0 auto', padding: '80px 24px' }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 28, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 32, textAlign: 'center' }}>Create Account</div>
          <input style={inputStyle} type="text" placeholder="Display Name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12, fontFamily: "'Oswald', sans-serif" }}>{error}</div>}
          {message && <div style={{ color: C.green, fontSize: 12, marginBottom: 12, fontFamily: "'Oswald', sans-serif" }}>{message}</div>}
          <button onClick={handleSignUp} disabled={loading} style={btnStyle}>{loading ? 'Creating...' : 'Create Account'}</button>
          <button onClick={() => setView('landing')} style={ghostStyle}>← Back</button>
        </div>
      )}

      {/* JOIN */}
      {view === 'join' && (
        <div className="fade-up" style={{ maxWidth: 400, margin: '0 auto', padding: '80px 24px' }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 28, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 32, textAlign: 'center' }}>Join League</div>
          <input style={inputStyle} type="text" placeholder="Enter invite code" value={joinCode} onChange={e => setJoinCode(e.target.value)} maxLength={6} />
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12, fontFamily: "'Oswald', sans-serif" }}>{error}</div>}
          <button onClick={handleJoin} disabled={loading} style={btnStyle}>{loading ? 'Checking...' : 'Join League'}</button>
          <button onClick={() => setView('landing')} style={ghostStyle}>← Back</button>
        </div>
      )}

      {/* DASHBOARD */}
      {view === 'dashboard' && (
        <div className="fade-up" style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
            <div>
              <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 4, color: C.gold, textTransform: 'uppercase', marginBottom: 6 }}>Welcome back</div>
              <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 28, letterSpacing: 1, textTransform: 'uppercase' }}>{user?.email?.split('@')[0]}</div>
            </div>
            <button onClick={signOut} style={{ ...ghostStyle, width: 'auto', padding: '10px 20px', fontSize: 11 }}>Sign Out</button>
          </div>

          {leagues.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 3, color: C.muted, textTransform: 'uppercase', marginBottom: 16 }}>Your Leagues</div>
              {leagues.map((league: any) => (
                <div
                  key={league.id}
                  onClick={() => router.push(`/league/${league.id}`)}
                  style={{ padding: '16px 20px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, marginBottom: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, letterSpacing: 1, color: C.text }}>{league.name}</div>
                    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, letterSpacing: 1, marginTop: 4 }}>{league.league_size} teams · {league.status}</div>
                  </div>
                  <div style={{ color: C.gold, fontSize: 18 }}>→</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button onClick={() => setView('create')} style={btnStyle}>+ Create League</button>
            <button onClick={() => setView('join')} style={ghostStyle}>Join League</button>
          </div>
        </div>
      )}

      {/* CREATE */}
      {view === 'create' && <CreateLeagueWizard />}
    </div>
  );
}