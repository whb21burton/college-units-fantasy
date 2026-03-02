'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { CreateLeagueWizard } from '@/components/league/CreateLeagueWizard';
import type { User } from '@supabase/supabase-js';

const C = { bg:'#05080f', surf:'#0c1220', surf2:'#131d30', surf3:'#1e2d47', gold:'#d4a828', muted:'#4a5d7a', text:'#e8edf5', sub:'#7a90b0', green:'#2ecc71', red:'#e74c3c' };
type View = 'landing' | 'signin' | 'signup' | 'join' | 'dashboard' | 'create';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('landing');
  const [leagues, setLeagues] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authDone, setAuthDone] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u); setLoading(false);
      if (u) { loadLeagues(); setView('dashboard'); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) { loadLeagues(); setView('dashboard'); }
      else setLeagues([]);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadLeagues() {
    const { data } = await supabase.from('league_members').select('team_name, leagues(id, name, status, league_size, buy_in, invite_code)');
    setLeagues(data || []);
  }

  async function handleSignIn() {
    setAuthLoading(true); setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) setAuthError(error.message);
  }

  async function handleSignUp() {
    if (!email || !password) { setAuthError('Email and password required.'); return; }
    if (password.length < 8) { setAuthError('Password must be at least 8 characters.'); return; }
    setAuthLoading(true); setAuthError('');
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/auth/callback' } });
    setAuthLoading(false);
    if (error) { setAuthError(error.message); return; }
    setAuthDone('Check your email for a confirmation link to activate your account.');
  }

  async function handleJoinByCode() {
    const code = inviteCode.trim().replace(/[^A-Za-z0-9]/g,'').toUpperCase();
    if (code.length < 6) { setAuthError('Enter a valid 6-character invite code.'); return; }
    window.location.href = '/join/' + code;
  }

  if (loading) return <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ color:C.muted, fontFamily:'Oswald,sans-serif', letterSpacing:4, fontSize:12 }}>LOADING...</div></div>;

  if (view === 'create') return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <nav style={{ height:56, display:'flex', alignItems:'center', padding:'0 24px', background:'rgba(5,8,15,.95)', borderBottom:'2px solid '+C.gold, position:'sticky', top:0, zIndex:100 }}>
        <button onClick={() => setView('dashboard')} style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'Oswald,sans-serif', fontSize:13, color:C.sub }}>← Back</button>
      </nav>
      <CreateLeagueWizard />
    </div>
  );

  if (view === 'dashboard' && user) return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <nav style={{ height:56, display:'flex', alignItems:'center', padding:'0 24px', gap:16, background:'rgba(5,8,15,.95)', borderBottom:'2px solid '+C.gold, position:'sticky', top:0, zIndex:100 }}>
        <div style={{ marginRight:'auto', fontFamily:'Anton,sans-serif', fontSize:17, letterSpacing:2.5, textTransform:'uppercase', color:C.gold }}>🏈 College Units Fantasy</div>
        <span style={{ fontFamily:'Oswald,sans-serif', fontSize:11, color:C.muted }}>{user.email}</span>
        <button onClick={() => supabase.auth.signOut()} style={{ background:'none', border:'1px solid '+C.surf3, borderRadius:6, padding:'5px 12px', cursor:'pointer', fontFamily:'Oswald,sans-serif', fontSize:10, color:C.muted }}>Sign Out</button>
      </nav>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'32px 20px' }}>
        <h1 style={{ fontFamily:'Anton,sans-serif', fontSize:28, letterSpacing:1.5, color:C.text, textTransform:'uppercase', marginBottom:6 }}>My Leagues</h1>
        <p style={{ fontFamily:'Oswald,sans-serif', fontSize:13, color:C.sub, marginBottom:28 }}>2026 College Football Season</p>
        <div style={{ display:'flex', gap:12, marginBottom:28 }}>
          <button onClick={() => setView('create')} style={{ padding:'12px 24px', background:C.gold, border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:13, letterSpacing:2, textTransform:'uppercase', color:C.bg }}>+ Create League</button>
          <button onClick={() => { setView('join'); setAuthError(''); setInviteCode(''); }} style={{ padding:'12px 24px', background:'none', border:'1px solid '+C.surf3, borderRadius:8, cursor:'pointer', fontFamily:'Oswald,sans-serif', fontSize:13, color:C.sub }}>Join with Code</button>
        </div>
        {leagues.length === 0 ? (
          <div style={{ textAlign:'center', padding:'64px 24px', background:C.surf, border:'1px solid '+C.surf3, borderRadius:12 }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🏟️</div>
            <div style={{ fontFamily:'Anton,sans-serif', fontSize:22, color:C.text, textTransform:'uppercase', marginBottom:8 }}>No Leagues Yet</div>
            <div style={{ fontFamily:'Oswald,sans-serif', color:C.sub, fontSize:13, marginBottom:24 }}>Create your first league or join one with an invite code.</div>
            <button onClick={() => setView('create')} style={{ padding:'14px 32px', background:C.gold, border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:14, letterSpacing:2, color:C.bg }}>Create Your First League</button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {leagues.map((item: any, i: number) => {
              const l = item.leagues;
              if (!l) return null;
              return (
                <div key={i} onClick={() => window.location.href='/league/'+l.id} style={{ padding:'18px 20px', background:C.surf, border:'1px solid '+C.surf3, borderRadius:12, cursor:'pointer', display:'flex', alignItems:'center', gap:16, position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, left:0, bottom:0, width:3, background:C.gold }} />
                  <div style={{ flex:1, paddingLeft:8 }}>
                    <div style={{ fontFamily:'Anton,sans-serif', fontSize:18, color:C.text, textTransform:'uppercase', marginBottom:4 }}>{l.name}</div>
                    <div style={{ fontFamily:'Oswald,sans-serif', fontSize:11, color:C.sub }}>🏷️ {item.team_name} · {l.league_size} teams · {l.buy_in===0?'Free':'$'+l.buy_in}</div>
                  </div>
                  <span style={{ fontFamily:'Oswald,sans-serif', fontSize:9, letterSpacing:2, color:C.gold, background:'rgba(212,168,40,.1)', border:'1px solid rgba(212,168,40,.3)', padding:'3px 8px', borderRadius:4 }}>{(l.status||'FORMING').toUpperCase()}</span>
                  <div style={{ color:C.muted, fontSize:18 }}>›</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (view === 'join') return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:440 }}>
        <div style={{ background:C.surf, border:'1px solid '+C.surf3, borderRadius:14, overflow:'hidden' }}>
          <div style={{ height:3, background:'linear-gradient(90deg,#d4a828,#f0c94a)' }} />
          <div style={{ padding:'32px' }}>
            <div style={{ fontFamily:'Anton,sans-serif', fontSize:11, letterSpacing:4, color:C.gold, textTransform:'uppercase', marginBottom:12 }}>🏈 College Units Fantasy</div>
            <h2 style={{ fontFamily:'Anton,sans-serif', fontSize:26, color:C.text, textTransform:'uppercase', marginBottom:6 }}>Join a League</h2>
            <p style={{ fontFamily:'Oswald,sans-serif', fontSize:13, color:C.sub, marginBottom:28 }}>Enter the invite code from your commissioner</p>
            <label style={{ display:'block', fontFamily:'Oswald,sans-serif', fontSize:11, letterSpacing:2, textTransform:'uppercase', color:C.muted, marginBottom:8 }}>Invite Code</label>
            <input type="text" placeholder="AB12CD" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} maxLength={8} onKeyDown={e => e.key==='Enter' && handleJoinByCode()} style={{ width:'100%', padding:'14px', background:C.bg, border:'1px solid '+C.surf3, borderRadius:8, color:C.gold, fontFamily:'Anton,sans-serif', fontSize:24, letterSpacing:8, outline:'none', boxSizing:'border-box', textAlign:'center', marginBottom:16 }} />
            {authError && <div style={{ marginBottom:12, padding:'10px 14px', background:'rgba(231,76,60,.1)', borderRadius:6, fontFamily:'Oswald,sans-serif', fontSize:12, color:C.red }}>⚠️ {authError}</div>}
            <button onClick={handleJoinByCode} style={{ width:'100%', padding:14, background:C.gold, border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:14, letterSpacing:2, textTransform:'uppercase', color:C.bg, marginBottom:12 }}>Find League →</button>
            <button onClick={() => { setView(user?'dashboard':'landing'); setAuthError(''); }} style={{ width:'100%', padding:10, background:'none', border:'1px solid '+C.surf3, borderRadius:8, cursor:'pointer', fontFamily:'Oswald,sans-serif', fontSize:12, color:C.muted }}>← Back</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (view === 'signup') return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:440 }}>
        <div style={{ background:C.surf, border:'1px solid '+C.surf3, borderRadius:14, overflow:'hidden' }}>
          <div style={{ height:3, background:'linear-gradient(90deg,#d4a828,#f0c94a)' }} />
          <div style={{ padding:'32px' }}>
            <div style={{ fontFamily:'Anton,sans-serif', fontSize:11, letterSpacing:4, color:C.gold, textTransform:'uppercase', marginBottom:12 }}>🏈 College Units Fantasy</div>
            <h2 style={{ fontFamily:'Anton,sans-serif', fontSize:26, color:C.text, textTransform:'uppercase', marginBottom:6 }}>Create Account</h2>
            <p style={{ fontFamily:'Oswald,sans-serif', fontSize:13, color:C.sub, marginBottom:28 }}>Join the only fantasy game built for CFB fans</p>
            {authDone ? (
              <div style={{ textAlign:'center', padding:'24px 0' }}>
                <div style={{ fontSize:48, marginBottom:16 }}>📬</div>
                <div style={{ fontFamily:'Anton,sans-serif', fontSize:20, color:C.gold, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>Check Your Email</div>
                <p style={{ fontFamily:'Oswald,sans-serif', fontSize:13, color:C.sub, lineHeight:1.6 }}>{authDone}</p>
                <button onClick={() => setView('signin')} style={{ marginTop:20, padding:'12px 24px', background:C.gold, border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:13, letterSpacing:2, color:C.bg }}>Go to Sign In</button>
              </div>
            ) : (
              <>
                <label style={{ display:'block', fontFamily:'Oswald,sans-serif', fontSize:11, letterSpacing:2, textTransform:'uppercase', color:C.muted, marginBottom:6 }}>Email</label>
                <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} style={{ width:'100%', padding:12, background:C.bg, border:'1px solid '+C.surf3, borderRadius:8, color:C.text, fontFamily:'Inter,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:16 }} />
                <label style={{ display:'block', fontFamily:'Oswald,sans-serif', fontSize:11, letterSpacing:2, textTransform:'uppercase', color:C.muted, marginBottom:6 }}>Password</label>
                <input type="password" placeholder="Min 8 characters" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==='Enter' && handleSignUp()} style={{ width:'100%', padding:12, background:C.bg, border:'1px solid '+C.surf3, borderRadius:8, color:C.text, fontFamily:'Inter,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:16 }} />
                {authError && <div style={{ marginBottom:12, padding:'10px 14px', background:'rgba(231,76,60,.1)', borderRadius:6, fontFamily:'Oswald,sans-serif', fontSize:12, color:C.red }}>⚠️ {authError}</div>}
                <button onClick={handleSignUp} disabled={authLoading} style={{ width:'100%', padding:14, background:authLoading?C.surf3:C.gold, border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:14, letterSpacing:2, textTransform:'uppercase', color:C.bg, marginBottom:12 }}>{authLoading?'Creating...':'Create Account'}</button>
                <div style={{ textAlign:'center', fontFamily:'Oswald,sans-serif', fontSize:12, color:C.muted }}>Already have an account?{' '}<button onClick={() => { setView('signin'); setAuthError(''); }} style={{ background:'none', border:'none', color:C.gold, cursor:'pointer', fontFamily:'inherit', fontSize:'inherit' }}>Sign In</button></div>
              </>
            )}
            <button onClick={() => { setView('landing'); setAuthError(''); setAuthDone(''); }} style={{ width:'100%', marginTop:16, padding:10, background:'none', border:'1px solid '+C.surf3, borderRadius:8, cursor:'pointer', fontFamily:'Oswald,sans-serif', fontSize:12, color:C.muted }}>← Back</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (view === 'signin') return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:440 }}>
        <div style={{ background:C.surf, border:'1px solid '+C.surf3, borderRadius:14, overflow:'hidden' }}>
          <div style={{ height:3, background:'linear-gradient(90deg,#d4a828,#f0c94a)' }} />
          <div style={{ padding:'32px' }}>
            <div style={{ fontFamily:'Anton,sans-serif', fontSize:11, letterSpacing:4, color:C.gold, textTransform:'uppercase', marginBottom:12 }}>🏈 College Units Fantasy</div>
            <h2 style={{ fontFamily:'Anton,sans-serif', fontSize:26, color:C.text, textTransform:'uppercase', marginBottom:6 }}>Welcome Back</h2>
            <p style={{ fontFamily:'Oswald,sans-serif', fontSize:13, color:C.sub, marginBottom:28 }}>Sign in to your account</p>
            <label style={{ display:'block', fontFamily:'Oswald,sans-serif', fontSize:11, letterSpacing:2, textTransform:'uppercase', color:C.muted, marginBottom:6 }}>Email</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} style={{ width:'100%', padding:12, background:C.bg, border:'1px solid '+C.surf3, borderRadius:8, color:C.text, fontFamily:'Inter,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:16 }} />
            <label style={{ display:'block', fontFamily:'Oswald,sans-serif', fontSize:11, letterSpacing:2, textTransform:'uppercase', color:C.muted, marginBottom:6 }}>Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==='Enter' && handleSignIn()} style={{ width:'100%', padding:12, background:C.bg, border:'1px solid '+C.surf3, borderRadius:8, color:C.text, fontFamily:'Inter,sans-serif', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:16 }} />
            {authError && <div style={{ marginBottom:12, padding:'10px 14px', background:'rgba(231,76,60,.1)', borderRadius:6, fontFamily:'Oswald,sans-serif', fontSize:12, color:C.red }}>⚠️ {authError}</div>}
            <button onClick={handleSignIn} disabled={authLoading} style={{ width:'100%', padding:14, background:authLoading?C.surf3:C.gold, border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:14, letterSpacing:2, textTransform:'uppercase', color:C.bg, marginBottom:12 }}>{authLoading?'Signing in...':'Sign In'}</button>
            <div style={{ textAlign:'center', fontFamily:'Oswald,sans-serif', fontSize:12, color:C.muted }}>No account?{' '}<button onClick={() => { setView('signup'); setAuthError(''); }} style={{ background:'none', border:'none', color:C.gold, cursor:'pointer', fontFamily:'inherit', fontSize:'inherit' }}>Create one</button></div>
            <button onClick={() => { setView('landing'); setAuthError(''); }} style={{ width:'100%', marginTop:16, padding:10, background:'none', border:'1px solid '+C.surf3, borderRadius:8, cursor:'pointer', fontFamily:'Oswald,sans-serif', fontSize:12, color:C.muted }}>← Back</button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:C.bg, backgroundImage:'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212,168,40,.12) 0%, transparent 70%)', display:'flex', flexDirection:'column' }}>
      <nav style={{ height:60, display:'flex', alignItems:'center', padding:'0 32px', borderBottom:'2px solid '+C.gold, background:'rgba(5,8,15,.8)' }}>
        <div style={{ fontFamily:'Anton,sans-serif', fontSize:18, letterSpacing:3, textTransform:'uppercase', marginRight:'auto', color:C.gold }}>🏈 College Units Fantasy</div>
        <button onClick={() => setView('signin')} style={{ padding:'8px 20px', background:C.gold, border:'none', borderRadius:6, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:12, letterSpacing:2, color:C.bg }}>Sign In</button>
      </nav>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 24px', textAlign:'center' }}>
        <div style={{ maxWidth:640 }}>
          <h1 style={{ fontFamily:'Anton,sans-serif', fontSize:80, letterSpacing:2, textTransform:'uppercase', lineHeight:.95, marginBottom:24, color:C.gold }}>College<br/>Units<br/>Fantasy</h1>
          <p style={{ fontFamily:'Oswald,sans-serif', fontSize:17, color:C.sub, lineHeight:1.7, marginBottom:48 }}>Draft whole CFB position units — not individual players.<br/>Real depth charts. Real stakes. True college football strategy.</p>
          <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
            <button onClick={() => setView('signup')} style={{ padding:'16px 44px', background:C.gold, border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:16, letterSpacing:2.5, color:C.bg, textTransform:'uppercase', boxShadow:'0 8px 32px rgba(212,168,40,.3)' }}>Create League →</button>
            <button onClick={() => { setView('join'); setAuthError(''); setInviteCode(''); }} style={{ padding:'16px 32px', background:'none', border:'1px solid '+C.surf3, borderRadius:8, cursor:'pointer', fontFamily:'Oswald,sans-serif', fontSize:13, letterSpacing:2, color:C.sub, textTransform:'uppercase' }}>Join a League</button>
          </div>
          <div style={{ display:'flex', marginTop:56, borderTop:'1px solid '+C.surf3, paddingTop:36 }}>
            {[['130+','Schools'],['500+','Players'],['15','Draft Picks'],['6-Team','Playoffs']].map(([n,l],i) => (
              <div key={l} style={{ flex:1, textAlign:'center', borderRight:i<3?'1px solid '+C.surf3:'none', padding:'0 20px' }}>
                <div style={{ fontFamily:'Anton,sans-serif', fontSize:28, color:C.gold }}>{n}</div>
                <div style={{ fontFamily:'Oswald,sans-serif', fontSize:10, letterSpacing:2.5, color:C.muted, textTransform:'uppercase', marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}