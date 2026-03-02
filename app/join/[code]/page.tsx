'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { AuthModal } from '@/components/auth/AuthModal';

const C = { bg:'#05080f', surf:'#0c1220', surf2:'#131d30', surf3:'#1e2d47', gold:'#d4a828', muted:'#4a5d7a', text:'#e8edf5', sub:'#7a90b0', red:'#e74c3c', green:'#2ecc71' };

export default function JoinPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const code = params.code.toUpperCase();
  const [league, setLeague] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) setUser({ id: u.id, email: u.email || '' });
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
    if (memberCount >= league.league_size) { setError('This league is full.'); setJoining(false); return; }
    if (league.status !== 'forming') { setError('This league has already started.'); setJoining(false); return; }
    const { error: joinError } = await supabase.from('league_members').insert({ league_id: league.id, user_id: user.id, team_name: teamName.trim(), draft_slot: memberCount + 1 });
    if (joinError) { setError(joinError.message); setJoining(false); return; }
    router.push('/league/' + league.id + '?joined=1');
  }

  const spotsLeft = league ? league.league_size - memberCount : 0;
  const isFull = spotsLeft <= 0;

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
                {[['League Size',league?.league_size+' teams'],['Spots Left',isFull?'Full':spotsLeft+' open'],['Buy-In',league?.buy_in===0?'Free':'$'+league?.buy_in],['Draft',league?.draft_type==='snake'?'Snake':'Salary']].map(([k,v]) => (
                  <div key={k} style={{ padding:'12px 14px', background:C.surf2, border:'1px solid '+C.surf3, borderRadius:8 }}>
                    <div style={{ fontFamily:'Oswald,sans-serif', fontSize:9, color:C.muted, letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>{k}</div>
                    <div style={{ fontFamily:'Oswald,sans-serif', fontWeight:600, fontSize:14, color:C.text }}>{v}</div>
                  </div>
                ))}
              </div>
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
                  <button onClick={handleJoin} disabled={joining} style={{ width:'100%', padding:15, background:joining?C.surf3:C.gold, border:'none', borderRadius:8, cursor:joining?'wait':'pointer', fontFamily:'Anton,sans-serif', fontSize:15, letterSpacing:2, textTransform:'uppercase', color:C.bg }}>
                    {joining ? 'Joining...' : !user ? 'Sign In to Join' : 'Join League'}
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