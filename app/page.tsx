'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase-browser';
import AgeVerificationModal from '@/components/compliance/AgeVerificationModal';
import TermsAcceptanceModal from '@/components/compliance/TermsAcceptanceModal';
import WalletDrawer from '@/components/wallet/WalletDrawer';
import { useWallet } from '@/context/WalletContext';
import { PAID_CONTESTS_ENABLED } from '@/lib/config';

const IntroAnimation = dynamic(() => import('@/components/IntroAnimation'), { ssr: false });

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a', goldDark: '#a07e18',
  muted: '#4a5d7a', text: '#e8edf5', sub: '#7a90b0',
  green: '#2ecc71', red: '#e74c3c', border: '#1e2d47',
};

type View = 'landing' | 'signin' | 'signup' | 'dashboard' | 'join';
type Sport = 'baseball' | 'basketball' | 'football';

// ── GameCard ──────────────────────────────────────────────────────────────────

function GameCard({ game }: { game: any }) {
  const isLive  = game.status === 'in';
  const isFinal = game.status === 'post';
  return (
    <div style={{
      background: C.surf2,
      border: `1px solid ${isLive ? 'rgba(46,204,113,.3)' : C.border}`,
      borderRadius: 8, padding: '9px 11px', marginBottom: 6,
      boxShadow: isLive ? '0 0 10px rgba(46,204,113,.05)' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
          color: isLive ? C.green : isFinal ? C.muted : C.gold }}>
          {isLive ? `● LIVE${game.period ? ` · ${game.period}` : ''}` : game.statusText}
        </span>
        {game.broadcast && (
          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 0.5 }}>
            {game.broadcast}
          </span>
        )}
      </div>
      {[game.away, game.home].map((team: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            {team?.logo
              ? <img src={team.logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} />
              : <div style={{ width: 16, height: 16, background: C.surf3, borderRadius: '50%', flexShrink: 0 }} />
            }
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {team?.rank && <span style={{ color: C.gold, marginRight: 3, fontSize: 9 }}>#{team.rank}</span>}
              {team?.abbrev ?? team?.name ?? '—'}
            </span>
          </div>
          <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.text, flexShrink: 0, marginLeft: 8 }}>
            {team?.score ?? '0'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── LiveScoreboard ────────────────────────────────────────────────────────────

const SPORT_TABS: { key: Sport; label: string; icon: string }[] = [
  { key: 'baseball',   label: 'Baseball',   icon: '⚾' },
  { key: 'basketball', label: 'Basketball', icon: '🏀' },
  { key: 'football',   label: 'Football',   icon: '🏈' },
];

function LiveScoreboard() {
  const [sport, setSport]             = useState<Sport>('baseball');
  const [games, setGames]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchScores = useCallback(async () => {
    if (sport === 'football') return;
    setLoading(true);
    try {
      const endpoint = sport === 'baseball'
        ? '/api/scores/college-baseball'
        : '/api/scores/college-basketball';
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setGames(data.games ?? []);
        setLastUpdated(new Date());
      }
    } catch {}
    setLoading(false);
  }, [sport]);

  useEffect(() => {
    setGames([]);
    fetchScores();
    if (timerRef.current) clearInterval(timerRef.current);
    if (sport !== 'football') {
      timerRef.current = setInterval(fetchScores, 30000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sport, fetchScores]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sport tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {SPORT_TABS.map(tab => (
          <button key={tab.key} onClick={() => setSport(tab.key)} style={{
            flex: 1, padding: '9px 4px', background: 'none', border: 'none',
            borderBottom: `2px solid ${sport === tab.key ? C.gold : 'transparent'}`,
            cursor: 'pointer', marginBottom: -1,
            fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1,
            color: sport === tab.key ? C.gold : C.muted,
            textTransform: 'uppercase' as const, transition: 'all .12s',
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Games */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {sport === 'football' ? (
          <div style={{ textAlign: 'center', padding: '36px 12px' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏈</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
              Season Starts August 2025
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>
              Check back for live scores
            </div>
          </div>
        ) : loading && games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 12px', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>
            Loading scores…
          </div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 12px' }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>{sport === 'baseball' ? '⚾' : '🏀'}</div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>No games today</div>
          </div>
        ) : (
          games.map((g: any) => <GameCard key={g.id} game={g} />)
        )}
      </div>

      {/* Last updated footer */}
      {lastUpdated && sport !== 'football' && (
        <div style={{ padding: '5px 8px', borderTop: `1px solid ${C.border}`, flexShrink: 0, fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1, textAlign: 'right' }}>
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · auto-refresh 30s
        </div>
      )}
    </div>
  );
}

// ── NewsSection ───────────────────────────────────────────────────────────────

const FEATURED = {
  headline: 'College Units Fantasy: Draft Your Team Before Week 1',
  summary:  'The 2025 college football season kicks off in August. Build your roster now, lock in your lineup, and compete all season long.',
  date:     'June 10, 2026',
};

const NEWS = [
  { headline: 'Top 10 RB Units to Target in Your Draft',      summary: 'These backfields are primed for big seasons based on returning starters and O-line talent.',    date: 'June 9, 2026'  },
  { headline: 'Salary Cap Strategy Guide for 2025',            summary: 'How to build a winning roster on a $200 budget — sleeper units and value picks.',               date: 'June 8, 2026'  },
  { headline: "Conference Championship Odds: Who's Favored?",  summary: 'Early projections for every Power 4 conference — and which units to invest in.',               date: 'June 7, 2026'  },
];

const VIDEOS = [
  { title: 'How to Draft a Winning Team',     duration: '4:32' },
  { title: '2025 Season Preview & Sleepers',  duration: '7:15' },
];

function NewsSection() {
  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', height: '100%' }}>

      {/* Featured */}
      <div style={{
        background: 'linear-gradient(135deg,#0d1827,#131d30)',
        border: '1px solid rgba(212,168,40,.35)', borderRadius: 12,
        padding: '20px 18px', marginBottom: 16, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 140, height: '100%', background: 'linear-gradient(135deg,rgba(212,168,40,.06),transparent)', pointerEvents: 'none' }} />
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>
          ⭐ Featured
        </div>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 0.5, lineHeight: 1.2, marginBottom: 8 }}>
          {FEATURED.headline}
        </div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>
          {FEATURED.summary}
        </div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>{FEATURED.date}</div>
      </div>

      {/* News grid */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>
          Latest News
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {NEWS.map((story, i) => (
            <div key={i}
              style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 11px', cursor: 'pointer', transition: 'border-color .12s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,168,40,.4)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
            >
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: C.text, lineHeight: 1.35, marginBottom: 5 }}>
                {story.headline}
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.sub, lineHeight: 1.5, marginBottom: 7 }}>
                {story.summary}
              </div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1 }}>{story.date}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Videos */}
      <div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>
          Videos
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {VIDEOS.map((vid, i) => (
            <div key={i}
              style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', transition: 'border-color .12s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,168,40,.4)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
            >
              <div style={{ height: 76, background: 'linear-gradient(135deg,#0d1827,#1e2d47)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(212,168,40,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: C.bg }}>▶</div>
                <span style={{ position: 'absolute', bottom: 5, right: 7, fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted }}>{vid.duration}</span>
              </div>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{vid.title}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [view,        setView]        = useState<View>('landing');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joinCode,    setJoinCode]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [message,     setMessage]     = useState<string | null>(null);
  const [user,        setUser]        = useState<any>(null);
  const { balance: walletBalance } = useWallet();
  const [leagues,      setLeagues]     = useState<any[]>([]);
  const [bracketCount, setBracketCount] = useState(0);
  const [showWallet,   setShowWallet]   = useState(false);
  const [locks, setLocks] = useState({ public_leagues: false, bracket_contests: false, create_season_league: false, create_bracket: false });
  const [showIntro,    setShowIntro]    = useState(false);
  const [introChecked, setIntroChecked] = useState(false);
  const [showAgeModal,   setShowAgeModal]   = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  useEffect(() => {
    try {
      const seen = sessionStorage.getItem('cuf_intro_seen');
      if (!seen) setShowIntro(true);
    } catch {}
    setIntroChecked(true);
  }, []);

  function handleIntroComplete() {
    try { sessionStorage.setItem('cuf_intro_seen', '1'); } catch {}
    setShowIntro(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadLeagues(session.user.id);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = user?.email === 'whb21burton@gmail.com';

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('platform_settings').select('key, value')
      .in('key', ['public_leagues_locked', 'bracket_contests_locked', 'create_season_league_locked', 'create_bracket_locked'])
      .then(({ data }) => {
        const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value === 'true']));
        setLocks({
          public_leagues:       map['public_leagues_locked']       ?? false,
          bracket_contests:     map['bracket_contests_locked']     ?? false,
          create_season_league: map['create_season_league_locked'] ?? false,
          create_bracket:       map['create_bracket_locked']       ?? false,
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function toggleLock(key: string, current: boolean) {
    await supabase.from('platform_settings')
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
      .from('user_verifications').select('is_age_verified').eq('user_id', userId).single();
    if (!verification?.is_age_verified) { setShowAgeModal(true); return; }
    const { data: terms } = await supabase
      .from('user_terms_acceptance').select('id').eq('user_id', userId).eq('terms_version', '1.0').single();
    if (!terms) { setShowTermsModal(true); return; }
    setView('dashboard');
  }

  async function loadLeagues(userId: string) {
    const [{ data: members }, { count }] = await Promise.all([
      supabase.from('league_members').select('league_id, leagues(*)').eq('user_id', userId),
      supabase.from('user_bracket_entries').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    if (members) setLeagues(members.map((d: any) => d.leagues).filter(Boolean));
    setBracketCount(count ?? 0);
  }

  async function handleSignIn() {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleSignUp() {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) setError(error.message);
    else setMessage('Check your email to confirm your account.');
    setLoading(false);
  }

  async function handleJoin() {
    setLoading(true); setError(null);
    const code = joinCode.trim().toUpperCase();
    const { data: league } = await supabase.from('leagues').select('id, name, league_size').eq('invite_code', code).single();
    if (!league) { setError('Invalid invite code.'); setLoading(false); return; }
    router.push(`/join/${code}`);
    setLoading(false);
  }

  async function signOut() { await supabase.auth.signOut(); }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 13px',
    background: C.surf2, border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.text,
    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
    outline: 'none', marginBottom: 10,
  };

  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '12px',
    background: `linear-gradient(135deg,${C.gold},${C.goldLight})`,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontFamily: "'Anton',sans-serif", fontSize: 13,
    letterSpacing: 2, textTransform: 'uppercase', color: C.bg,
    marginBottom: 0,
  };

  if (!introChecked) return null;

  // Right column content — determined by view + user state
  const showLoggedIn  = !!user && (view === 'dashboard' || view === 'landing');
  const showLoggedOut = !user && view === 'landing';

  return (
    <>
      {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}
      <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
        <style>{`
          * { box-sizing: border-box; }
          input:focus { outline: none !important; border-color: ${C.gold} !important; }
          @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
          .fade-up { animation: fadeUp .35s ease; }
          .hub-grid {
            display: grid;
            grid-template-columns: 25% 50% 25%;
            height: calc(100vh - 52px);
            overflow: hidden;
          }
          .hub-left   { border-right: 1px solid ${C.border}; display: flex; flex-direction: column; overflow: hidden; }
          .hub-middle { border-right: 1px solid ${C.border}; overflow-y: auto; }
          .hub-right  { overflow-y: auto; }
          @media (max-width: 1024px) {
            .hub-grid { grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; height: auto; overflow: visible; }
            .hub-left   { grid-column: 1; grid-row: 2; border-right: none; border-top: 1px solid ${C.border}; height: 380px; }
            .hub-middle { grid-column: 2; grid-row: 1 / 3; min-height: 100vh; }
            .hub-right  { grid-column: 1; grid-row: 1; border-bottom: 1px solid ${C.border}; }
          }
          @media (max-width: 640px) {
            .hub-grid { grid-template-columns: 1fr; height: auto; overflow: visible; }
            .hub-right  { grid-row: 1; }
            .hub-middle { grid-row: 2; border-right: none; border-bottom: 1px solid ${C.border}; }
            .hub-left   { grid-row: 3; border-right: none; border-top: 1px solid ${C.border}; height: 340px; }
          }
        `}</style>

        {/* ── Top bar ────────────────────────────────────────────────────────── */}
        <div style={{
          height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', borderBottom: `1px solid ${C.border}`,
          background: 'linear-gradient(180deg,#0a1020,#05080f)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="CUF" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
              College Units Fantasy
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {user ? (
              <>
                {PAID_CONTESTS_ENABLED && (
                  <button onClick={() => setShowWallet(true)} style={{ padding: '5px 12px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.gold }}>
                    💰 {walletBalance > 0 ? `$${(walletBalance / 100).toFixed(2)}` : 'Wallet'}
                  </button>
                )}
                <button onClick={() => router.push('/my-leagues')} style={{ padding: '5px 12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.sub }}>
                  My Leagues
                </button>
                <button onClick={signOut} style={{ padding: '5px 12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.muted }}>
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setView('signin')} style={{ padding: '5px 12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.sub }}>
                  Sign In
                </button>
                <button onClick={() => setView('signup')} style={{ padding: '5px 14px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.bg }}>
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── 3-column grid ──────────────────────────────────────────────────── */}
        <div className="hub-grid">

          {/* LEFT — Live Scores */}
          <div className="hub-left">
            <div style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>
                Live Scores
              </span>
            </div>
            <LiveScoreboard />
          </div>

          {/* MIDDLE — News */}
          <div className="hub-middle">
            <div style={{ padding: '10px 20px 8px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>
                News & Updates
              </span>
            </div>
            <NewsSection />
          </div>

          {/* RIGHT — Fantasy panel / auth forms */}
          <div className="hub-right">

            {/* ── Logged-in panel ── */}
            {showLoggedIn && (
              <div style={{ padding: '20px 16px' }} className="fade-up">
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 3 }}>
                    Welcome back
                  </div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, letterSpacing: 1, color: C.text, textTransform: 'uppercase' }}>
                    {user?.user_metadata?.display_name ?? user?.email?.split('@')[0]}
                  </div>
                </div>

                <button onClick={() => router.push('/my-leagues')} style={{ width: '100%', padding: '13px 14px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, textAlign: 'left' as const }}>
                  <div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.text, letterSpacing: 1, textTransform: 'uppercase' }}>My Leagues</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginTop: 2 }}>
                      {leagues.length} active{bracketCount > 0 ? ` · ${bracketCount} bracket${bracketCount !== 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                  <span style={{ color: C.gold, fontSize: 14 }}>→</span>
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <button onClick={() => router.push('/create-league')} style={{ padding: '10px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.bg, textTransform: 'uppercase' as const }}>
                    + Create
                  </button>
                  <button onClick={() => setView('join')} style={{ padding: '10px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase' as const }}>
                    Join
                  </button>
                </div>

                <button onClick={() => router.push('/leagues')} style={{ width: '100%', padding: '10px', background: 'rgba(212,168,40,.1)', border: `1px solid rgba(212,168,40,.3)`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.gold, textTransform: 'uppercase' as const, marginBottom: 7 }}>
                  🏟️ Browse Public Leagues
                  {isAdmin && (
                    <span onClick={e => { e.stopPropagation(); toggleLock('public_leagues_locked', locks.public_leagues); }}
                      style={{ marginLeft: 8, fontSize: 13, cursor: 'pointer' }} title={locks.public_leagues ? 'Unlock' : 'Lock'}>
                      {locks.public_leagues ? '🔒' : '🔓'}
                    </span>
                  )}
                </button>

                <button onClick={() => router.push('/brackets')} style={{ width: '100%', padding: '10px', background: 'rgba(46,204,113,.08)', border: '1px solid rgba(46,204,113,.25)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.green, textTransform: 'uppercase' as const, marginBottom: 7 }}>
                  🏆 Bracket Contests
                  {isAdmin && (
                    <span onClick={e => { e.stopPropagation(); toggleLock('bracket_contests_locked', locks.bracket_contests); }}
                      style={{ marginLeft: 8, fontSize: 13, cursor: 'pointer' }} title={locks.bracket_contests ? 'Unlock' : 'Lock'}>
                      {locks.bracket_contests ? '🔒' : '🔓'}
                    </span>
                  )}
                </button>

                {isAdmin && (
                  <button onClick={() => router.push('/admin/platform')} style={{ width: '100%', padding: '10px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.25)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: '#f03a5a', textTransform: 'uppercase' as const }}>
                    ⚡ Platform Manager
                  </button>
                )}
              </div>
            )}

            {/* ── Logged-out panel ── */}
            {showLoggedOut && (
              <div style={{ padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }} className="fade-up">
                <img src="/logo.png" alt="CUF" style={{ width: 68, height: 68, objectFit: 'contain', marginBottom: 12, filter: 'drop-shadow(0 4px 16px rgba(212,168,40,.3))' }} />
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, letterSpacing: 2, color: C.text, textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 }}>
                  College Units Fantasy
                </div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1, textAlign: 'center', marginBottom: 6, lineHeight: 1.5 }}>
                  The college football fantasy experience
                </div>
                <div style={{ padding: '3px 10px', background: 'rgba(212,168,40,.12)', border: '1px solid rgba(212,168,40,.3)', borderRadius: 20, fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 22 }}>
                  Season Starts Aug 2025
                </div>
                <button onClick={() => setView('signup')} style={{ ...btnPrimary, marginBottom: 8 }}>
                  Create Account
                </button>
                <button onClick={() => setView('signin')} style={{ width: '100%', padding: '12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.sub, textTransform: 'uppercase', marginBottom: 8 }}>
                  Sign In
                </button>
                <button onClick={() => router.push('/leagues')} style={{ width: '100%', padding: '12px', background: 'rgba(212,168,40,.07)', border: '1px solid rgba(212,168,40,.2)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 1.5, color: C.gold, textTransform: 'uppercase' }}>
                  🏟️ Browse Public Leagues
                </button>
              </div>
            )}

            {/* ── Sign-in form ── */}
            {view === 'signin' && (
              <div style={{ padding: '20px 16px' }} className="fade-up">
                <button onClick={() => { setView('landing'); setError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.muted, marginBottom: 14 }}>
                  ← Back
                </button>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', color: C.text, marginBottom: 18 }}>Sign In</div>
                <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSignIn(); }} />
                {error && <div style={{ color: C.red, fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{error}</div>}
                <button onClick={handleSignIn} disabled={loading} style={btnPrimary}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 14, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                  No account?{' '}
                  <span onClick={() => { setView('signup'); setError(null); }} style={{ color: C.gold, cursor: 'pointer' }}>Create one →</span>
                </div>
              </div>
            )}

            {/* ── Sign-up form ── */}
            {view === 'signup' && (
              <div style={{ padding: '20px 16px' }} className="fade-up">
                <button onClick={() => { setView('landing'); setError(null); setMessage(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.muted, marginBottom: 14 }}>
                  ← Back
                </button>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', color: C.text, marginBottom: 18 }}>Create Account</div>
                <input style={inputStyle} type="text"     placeholder="Display Name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                <input style={inputStyle} type="email"    placeholder="Email"        value={email}       onChange={e => setEmail(e.target.value)} />
                <input style={inputStyle} type="password" placeholder="Password"     value={password}    onChange={e => setPassword(e.target.value)} />
                {error   && <div style={{ color: C.red,   fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{error}</div>}
                {message && <div style={{ color: C.green, fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{message}</div>}
                <button onClick={handleSignUp} disabled={loading} style={btnPrimary}>
                  {loading ? 'Creating…' : 'Create Account'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 14, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                  Already have an account?{' '}
                  <span onClick={() => { setView('signin'); setError(null); setMessage(null); }} style={{ color: C.gold, cursor: 'pointer' }}>Sign in →</span>
                </div>
              </div>
            )}

            {/* ── Join form ── */}
            {view === 'join' && (
              <div style={{ padding: '20px 16px' }} className="fade-up">
                <button onClick={() => { setView(user ? 'dashboard' : 'landing'); setError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.muted, marginBottom: 14 }}>
                  ← Back
                </button>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', color: C.text, marginBottom: 18 }}>Join League</div>
                <input style={inputStyle} type="text" placeholder="Enter invite code" value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={10}
                  onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }} />
                {error && <div style={{ color: C.red, fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{error}</div>}
                <button onClick={handleJoin} disabled={loading} style={btnPrimary}>
                  {loading ? 'Checking…' : 'Join League'}
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {PAID_CONTESTS_ENABLED && <WalletDrawer isOpen={showWallet} onClose={() => setShowWallet(false)} />}

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
