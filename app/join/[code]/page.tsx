'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { AuthModal } from '@/components/auth/AuthModal';

const C = { bg:'#05080f', surf:'#0c1220', surf2:'#131d30', surf3:'#1e2d47', gold:'#d4a828', muted:'#4a5d7a', text:'#e8edf5', sub:'#7a90b0', red:'#e74c3c', green:'#2ecc71' };

export default function JoinPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const code = params.code.toUpperCase();
  const [league,       setLeague]       = useState<any>(null);
  const [user,         setUser]         = useState<any>(null);
  const [walletCents,  setWalletCents]  = useState<number | null>(null);
  const [teamName,     setTeamName]     = useState('');
  const [loading,      setLoading]      = useState(true);
  const [joining,      setJoining]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [alreadyMember,setAlreadyMember]= useState(false);
  const [showAuth,     setShowAuth]     = useState(false);
  const [memberCount,  setMemberCount]  = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) {
        setUser({ id: u.id, email: u.email || '' });
        // Load wallet balance
        const walletRes = await fetch('/api/wallet');
        if (walletRes.ok) {
          const d = await walletRes.json();
          setWalletCents(d.wallet?.balance ?? 0);
        }
      }
      const { data: leagueData } = await supabase.from('leagues').select('*').eq('invite_code', code).single();
      if (!leagueData) { setError('League not found.'); setLoading(false); return; }
      setLeague(leagueData);
      const { count } = await supabase.from('league_members').select('*', { count: 'exact', head: true }).eq('league_id', leagueData.id);
      setMemberCount(count || 0);
      if (u) {
        const { data: m } = await supabase.from('league_members').select('id').eq('league_id', leagueData.id).eq('user_id', u.id).single();
        if (m) setAlreadyMember(true);
      }
      setLoading(false);
    }
    load();
  }, [code]);

  async function handleJoin() {
    if (!user) { setShowAuth(true); return; }
    if (!teamName.trim() || teamName.trim().length < 2) { setError('Team name must be at least 2 characters.'); return; }
    if (!league) return;
    setJoining(true); setError(null);
    // For private leagues enforce capacity before calling the API
    if (!league.is_public && memberCount >= league.league_size) { setError('This league is full.'); setJoining(false); return; }
    if (league.status !== 'forming') { setError('This league has already started.'); setJoining(false); return; }

    // POST to /api/wallet/join-contest (atomically deducts balance)
    const res  = await fetch('/api/wallet/join-contest', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ league_id: league.id, team_name: teamName.trim() }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.code === 'INSUFFICIENT_BALANCE') {
        const needDollars = ((data.required ?? 0) / 100).toFixed(2);
        const haveDollars = ((data.balance  ?? 0) / 100).toFixed(2);
        setError(`Not enough funds. Need $${needDollars}, you have $${haveDollars}.`);
      } else {
        setError(data.error ?? 'Could not join. Please try again.');
      }
      setJoining(false);
      return;
    }

    // API returns redirect; fall back based on league type
    const defaultDest = league.league_type === 'weekly'
      ? '/league/' + league.id + '/lineup'
      : '/league/' + league.id + '?joined=1';
    const dest = data.redirect ?? defaultDest;
    router.push(dest);
  }

  const spotsLeft   = league ? league.league_size - memberCount : 0;
  const isFull      = spotsLeft <= 0;
  const buyIn       = league?.buy_in ?? 0;
  const buyInCents  = Math.round(buyIn * 100);
  const hasBalance  = walletCents !== null && walletCents >= buyInCents;

  if (loading) return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:C.muted, fontFamily:'Oswald,sans-serif', letterSpacing:3 }}>Loading...</div>
    </div>
  );

  if (error && !league) return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🏈</div>
        <div style={{ fontFamily:'Anton,sans-serif', fontSize:22, color:C.red, textTransform:'uppercase', marginBottom:12 }}>League Not Found</div>
        <div style={{ fontFamily:'Oswald,sans-serif', color:C.sub, fontSize:14 }}>{error}</div>
        <button onClick={() => router.push('/')} style={{ marginTop:24, padding:'12px 24px', background:C.gold, border:'none', borderRadius:8, fontFamily:'Anton,sans-serif', fontSize:13, letterSpacing:2, color:C.bg, cursor:'pointer' }}>Back to Home</button>
      </div>
    </div>
  );

  return (
    <>
      <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ width:'100%', maxWidth:480 }}>
          <div style={{ background:C.surf, border:'1px solid '+C.surf3, borderRadius:14, overflow:'hidden', marginBottom:20, boxShadow:'0 24px 64px rgba(0,0,0,.6)' }}>
            <div style={{ height:4, background:'linear-gradient(90deg,#d4a828,#f0c94a)' }} />
            <div style={{ padding:28 }}>
              <div style={{ fontFamily:'Oswald,sans-serif', fontSize:10, color:C.muted, letterSpacing:3, textTransform:'uppercase', marginBottom:8 }}>You are invited to join</div>
              <h1 style={{ fontFamily:'Anton,sans-serif', fontSize:30, letterSpacing:1, color:C.text, textTransform:'uppercase', marginBottom:20, lineHeight:1.1 }}>{league?.name}</h1>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
                {[
                  ['League Size', league?.league_size+' teams'],
                  ['Spots Left',  isFull ? 'Full' : spotsLeft+' open'],
                  ['Buy-In',      buyIn === 0 ? 'Free' : `$${buyIn}`],
                  ['Type',        league?.league_type === 'weekly' ? 'Weekly Pick\'em' : league?.draft_type === 'snake' ? 'Snake Draft' : 'Salary Draft'],
                ].map(([k,v]) => (
                  <div key={k} style={{ padding:'12px 14px', background:C.surf2, border:'1px solid '+C.surf3, borderRadius:8 }}>
                    <div style={{ fontFamily:'Oswald,sans-serif', fontSize:9, color:C.muted, letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>{k}</div>
                    <div style={{ fontFamily:'Oswald,sans-serif', fontWeight:600, fontSize:14, color:C.text }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Prize pool callout for paid leagues */}
              {buyIn > 0 && (
                <div style={{ padding:'12px 14px', background:'rgba(212,168,40,.08)', border:'1px solid rgba(212,168,40,.2)', borderRadius:8, marginBottom:16, fontFamily:'Oswald,sans-serif', fontSize:12, color:C.sub }}>
                  🏆 Prize pool: <strong style={{ color:C.gold }}>${buyIn * league.league_size}</strong>
                  <span style={{ color:C.muted }}> · 80% to 1st, 20% to 2nd</span>
                  <br/>
                  <span style={{ fontSize:11 }}>Paid from your wallet balance.</span>
                </div>
              )}

              {/* Wallet balance indicator for paid leagues */}
              {buyIn > 0 && user && walletCents !== null && (
                <div style={{
                  padding:'10px 14px', borderRadius:8, marginBottom:16,
                  background: hasBalance ? 'rgba(46,204,113,.08)' : 'rgba(231,76,60,.08)',
                  border: `1px solid ${hasBalance ? 'rgba(46,204,113,.25)' : 'rgba(231,76,60,.25)'}`,
                  fontFamily:'Oswald,sans-serif', fontSize:12,
                  color: hasBalance ? C.green : C.red,
                }}>
                  💰 Your wallet: <strong>${(walletCents / 100).toFixed(2)}</strong>
                  {hasBalance
                    ? ` ✓ Sufficient`
                    : ` — need $${(buyInCents / 100).toFixed(2)} more`
                  }
                  {!hasBalance && (
                    <button
                      onClick={() => router.push('/wallet')}
                      style={{ display:'block', marginTop:8, padding:'7px 14px', background:'rgba(231,76,60,.15)', border:'1px solid rgba(231,76,60,.3)', borderRadius:6, fontFamily:'Oswald,sans-serif', fontSize:11, letterSpacing:1, color:C.red, cursor:'pointer', textTransform:'uppercase' }}
                    >
                      Add Funds →
                    </button>
                  )}
                </div>
              )}

              <div style={{ textAlign:'center', padding:10, background:C.bg, borderRadius:8, border:'1px solid '+C.surf3, marginBottom:24 }}>
                <span style={{ fontFamily:'Oswald,sans-serif', fontSize:10, color:C.muted, letterSpacing:2 }}>CODE: </span>
                <span style={{ fontFamily:'Anton,sans-serif', fontSize:22, letterSpacing:6, color:C.gold }}>{code}</span>
              </div>

              {alreadyMember ? (
                <button onClick={() => router.push('/league/'+league?.id)} style={{ width:'100%', padding:15, background:C.gold, border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:15, letterSpacing:2, color:C.bg }}>Go to League Dashboard</button>
              ) : isFull ? (
                <div style={{ textAlign:'center', padding:16, background:'rgba(231,76,60,.08)', border:'1px solid rgba(231,76,60,.2)', borderRadius:8, fontFamily:'Oswald,sans-serif', color:C.red, fontSize:13 }}>This league is full.</div>
              ) : (
                <>
                  {!user && <div style={{ marginBottom:16, padding:'12px 14px', background:'rgba(212,168,40,.08)', border:'1px solid rgba(212,168,40,.2)', borderRadius:8, fontFamily:'Oswald,sans-serif', fontSize:12, color:C.sub }}>You need to sign in before joining.</div>}
                  <div style={{ marginBottom:16 }}>
                    <label style={{ display:'block', fontFamily:'Oswald,sans-serif', fontSize:11, letterSpacing:2, textTransform:'uppercase', color:C.muted, marginBottom:8 }}>Your Team Name</label>
                    <input type="text" placeholder="e.g. Athens Ave Dawgs" value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={32} onKeyDown={e => e.key==='Enter' && handleJoin()} style={{ width:'100%', padding:14, background:C.bg, border:'1px solid '+C.surf3, borderRadius:8, color:C.text, fontFamily:'Inter,sans-serif', fontSize:15, outline:'none', boxSizing:'border-box' }} />
                  </div>
                  {error && <div style={{ marginBottom:12, padding:'10px 14px', background:'rgba(231,76,60,.1)', border:'1px solid rgba(231,76,60,.3)', borderRadius:6, fontFamily:'Oswald,sans-serif', fontSize:12, color:C.red }}>⚠️ {error}</div>}
                  <button
                    onClick={handleJoin}
                    disabled={joining || (buyIn > 0 && user && !hasBalance)}
                    style={{ width:'100%', padding:15, background:joining?C.surf3:(buyIn > 0 && user && !hasBalance)?C.surf3:C.gold, border:'none', borderRadius:8, cursor:(joining||(buyIn > 0 && user && !hasBalance))?'not-allowed':'pointer', fontFamily:'Anton,sans-serif', fontSize:15, letterSpacing:2, textTransform:'uppercase', color:C.bg }}
                  >
                    {joining
                      ? 'Joining...'
                      : !user
                        ? 'Sign In to Join'
                        : buyIn > 0
                          ? hasBalance ? `Pay $${buyIn} & Join` : 'Insufficient Balance'
                          : 'Join League'}
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={{ textAlign:'center', fontFamily:'Oswald,sans-serif', fontSize:11, color:C.muted, letterSpacing:1 }}>College Units Fantasy · 2026 Season</div>
        </div>
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} redirectTo={'/join/'+code} />}
    </>
  );
}
