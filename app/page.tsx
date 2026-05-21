'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase-browser';
import AgeVerificationModal from '@/components/compliance/AgeVerificationModal';
import TermsAcceptanceModal from '@/components/compliance/TermsAcceptanceModal';
import WalletDrawer from '@/components/wallet/WalletDrawer';

const IntroAnimation = dynamic(() => import('@/components/IntroAnimation'), { ssr: false });

const C = {
  bg:'#05080f', surf:'#0c1220', surf2:'#131d30', surf3:'#1e2d47',
  gold:'#d4a828', goldLight:'#f0c94a', goldDark:'#a07e18',
  muted:'#4a5d7a', text:'#e8edf5', sub:'#7a90b0',
  green:'#2ecc71', red:'#e74c3c',
};

type View = 'landing' | 'signin' | 'signup' | 'dashboard' | 'join';

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
  const [walletBalance, setWalletBalance] = useState(0);
  const [showWallet, setShowWallet] = useState(false);
  const [locks, setLocks] = useState({ public_leagues: false, bracket_contests: false, create_season_league: false, create_bracket: false });
  const [showIntro, setShowIntro] = useState(false);
  const [introChecked, setIntroChecked] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  useEffect(() => {
    try {
      const seen = sessionStorage.getItem('cuf_intro_seen')
      if (!seen) {
        setShowIntro(true)
      }
    } catch (e) {}
    setIntroChecked(true)
  }, [])

  function handleIntroComplete() {
    try {
      sessionStorage.setItem('cuf_intro_seen', '1')
    } catch (e) {}
    setShowIntro(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadLeagues(session.user.id);
        fetch('/api/wallet').then(r => r.json()).then(d => {
          setWalletBalance(d.wallet?.available ?? d.wallet?.balance ?? 0);
        }).catch(() => {});
        checkCompliance(session.user.id);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadLeagues(session.user.id);
        checkCompliance(session.user.id);
      } else {
        setUser(null);
        setView('landing');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const isAdmin = user?.email === 'whb21burton@gmail.com';

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['public_leagues_locked', 'bracket_contests_locked', 'create_season_league_locked', 'create_bracket_locked'])
      .then(({ data }) => {
        const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value === 'true']));
        setLocks({
          public_leagues:       map['public_leagues_locked'] ?? false,
          bracket_contests:     map['bracket_contests_locked'] ?? false,
          create_season_league: map['create_season_league_locked'] ?? false,
          create_bracket:       map['create_bracket_locked'] ?? false,
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function toggleLock(key: string, current: boolean) {
    await supabase
      .from('platform_settings')
      .upsert({ key, value: (!current).toString(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    const keyToField: Record<string, keyof typeof locks> = {
      public_leagues_locked:       'public_leagues',
      bracket_contests_locked:     'bracket_contests',
      create_season_league_locked: 'create_season_league',
      create_bracket_locked:       'create_bracket',
    };
    const field = keyToField[key];
    if (field) setLocks(prev => ({ ...prev, [field]: !current }));
  }

  async function checkCompliance(userId: string) {
    const { data: verification } = await supabase
      .from('user_verifications')
      .select('is_age_verified')
      .eq('user_id', userId)
      .single();

    if (!verification?.is_age_verified) {
      setShowAgeModal(true);
      return;
    }

    const { data: terms } = await supabase
      .from('user_terms_acceptance')
      .select('id')
      .eq('user_id', userId)
      .eq('terms_version', '1.0')
      .single();

    if (!terms) {
      setShowTermsModal(true);
      return;
    }

    setView('dashboard');
  }

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

  if (!introChecked) return null;

  return (
    <>
    {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <style>{`
        * { box-sizing: border-box; }
        input:focus { outline: none !important; border-color: ${C.gold} !important; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp .4s ease; }
      `}</style>

      {/* LANDING */}
      {view === 'landing' && (
        <div className="fade-up" style={{ maxWidth: 480, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
          {/* Logo */}
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
            <img
              src="/logo.png"
              alt="College Units Fantasy"
              style={{ width: 180, height: 180, objectFit: 'contain', filter: 'drop-shadow(0 4px 24px rgba(212,168,40,.35))' }}
            />
          </div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, color: C.sub, letterSpacing: 1, marginBottom: 36 }}>
            Draft college football units. Dominate your league.
          </div>
          <button onClick={() => setView('signup')} style={{ ...btnStyle, marginBottom: 12 }}>Get Started</button>
          <button onClick={() => setView('signin')} style={ghostStyle}>Sign In</button>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <span
              onClick={() => setView('join')}
              style={{ fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.muted, cursor: 'pointer', letterSpacing: 1 }}
            >
              Have an invite code? Join a league →
            </span>
            <span
              onClick={() => router.push('/leagues')}
              style={{ fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.gold, cursor: 'pointer', letterSpacing: 1 }}
            >
              🏟️ Browse public leagues →
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src="/logo.png" alt="College Units Fantasy" style={{ width: 52, height: 52, objectFit: 'contain' }} />
              <div>
                <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 4, color: C.gold, textTransform: 'uppercase', marginBottom: 4 }}>Welcome back</div>
                <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: 1, textTransform: 'uppercase' }}>{user?.email?.split('@')[0]}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowWallet(true)} style={{ ...ghostStyle, width: 'auto', padding: '10px 20px', fontSize: 11 }}>
                {walletBalance > 0 ? `$${(walletBalance / 100).toFixed(2)}` : '💰 Wallet'}
              </button>
              <button onClick={signOut} style={{ ...ghostStyle, width: 'auto', padding: '10px 20px', fontSize: 11 }}>Sign Out</button>
            </div>
          </div>

          <button
            onClick={() => router.push('/my-leagues')}
            style={{ width: '100%', padding: '20px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 32 }}>🏟️</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: 1, color: C.text, textTransform: 'uppercase' }}>
                  {(user?.user_metadata?.display_name ?? user?.email?.split('@')[0])}'s Leagues
                </div>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, letterSpacing: 1, marginTop: 3 }}>
                  {leagues.length} active league{leagues.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <div style={{ color: C.gold, fontSize: 22 }}>→</div>
          </button>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => toggleLock('create_season_league_locked', locks.create_season_league)}
                style={{ flex: 1, padding: '9px 12px', background: locks.create_season_league ? 'rgba(240,58,90,.15)' : 'rgba(21,198,120,.1)', border: `1px solid ${locks.create_season_league ? '#f03a5a' : '#15c678'}`, borderRadius: 8, cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 1, color: locks.create_season_league ? '#f03a5a' : '#15c678' }}
                title={locks.create_season_league ? 'Unlock Season League Creation' : 'Lock Season League Creation'}>
                {locks.create_season_league ? '🔒' : '🔓'} Season League
              </button>
              <button onClick={() => toggleLock('create_bracket_locked', locks.create_bracket)}
                style={{ flex: 1, padding: '9px 12px', background: locks.create_bracket ? 'rgba(240,58,90,.15)' : 'rgba(21,198,120,.1)', border: `1px solid ${locks.create_bracket ? '#f03a5a' : '#15c678'}`, borderRadius: 8, cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 1, color: locks.create_bracket ? '#f03a5a' : '#15c678' }}
                title={locks.create_bracket ? 'Unlock Bracket Creation' : 'Lock Bracket Creation'}>
                {locks.create_bracket ? '🔒' : '🔓'} Bracket
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <button onClick={() => router.push('/create-league')} style={btnStyle}>+ Create League</button>
            <button onClick={() => setView('join')} style={{ ...ghostStyle, marginTop: 0 }}>Join League</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => router.push('/leagues')}
              style={{ flex: 1, padding: '14px', background: 'rgba(212,168,40,.12)', border: `1px solid ${C.gold}`, borderRadius: 8, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' as const, color: C.gold }}>
              🏟️ Browse Public Leagues
            </button>
            {isAdmin && (
              <button onClick={() => toggleLock('public_leagues_locked', locks.public_leagues)}
                style={{ padding: '14px 16px', background: locks.public_leagues ? 'rgba(240,58,90,.15)' : 'rgba(21,198,120,.1)', border: `1px solid ${locks.public_leagues ? '#f03a5a' : '#15c678'}`, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}
                title={locks.public_leagues ? 'Unlock Public Leagues' : 'Lock Public Leagues'}>
                {locks.public_leagues ? '🔒' : '🔓'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => router.push('/brackets')}
              style={{ flex: 1, padding: '14px', background: 'rgba(21,198,120,.12)', border: '1px solid #15c678', borderRadius: 8, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' as const, color: '#15c678' }}>
              🏆 Bracket Contests
            </button>
            {isAdmin && (
              <button onClick={() => toggleLock('bracket_contests_locked', locks.bracket_contests)}
                style={{ padding: '14px 16px', background: locks.bracket_contests ? 'rgba(240,58,90,.15)' : 'rgba(21,198,120,.1)', border: `1px solid ${locks.bracket_contests ? '#f03a5a' : '#15c678'}`, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}
                title={locks.bracket_contests ? 'Unlock Bracket Contests' : 'Lock Bracket Contests'}>
                {locks.bracket_contests ? '🔒' : '🔓'}
              </button>
            )}
          </div>
          {user?.email === 'whb21burton@gmail.com' && (
            <button
              onClick={() => router.push('/admin/platform')}
              style={{
                width: '100%', padding: '14px',
                background: 'rgba(240,58,90,.12)',
                border: '1px solid rgba(240,58,90,.3)',
                borderRadius: 8, cursor: 'pointer',
                fontFamily: "'Anton', sans-serif", fontSize: 14,
                letterSpacing: 2, textTransform: 'uppercase',
                color: '#f03a5a',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginTop: 10,
              }}
            >
              ⚡ Platform Manager
            </button>
          )}
        </div>
      )}


    </div>

    <WalletDrawer isOpen={showWallet} onClose={() => setShowWallet(false)} />

    {/* COMPLIANCE MODALS */}
    {showTermsModal && (
      <TermsAcceptanceModal
        onAccepted={() => { setShowTermsModal(false); setShowAgeModal(true); }}
        onDecline={() => { supabase.auth.signOut(); setShowTermsModal(false); }}
      />
    )}
    {showAgeModal && (
      <AgeVerificationModal
        onVerified={() => { setShowAgeModal(false); setView('dashboard'); }}
        onDecline={() => { supabase.auth.signOut(); setShowAgeModal(false); }}
      />
    )}
    </>
  );
}