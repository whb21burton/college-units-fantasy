'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

const C = { bg:'#05080f', surf:'#0c1220', surf2:'#131d30', surf3:'#1e2d47', gold:'#d4a828', muted:'#4a5d7a', text:'#e8edf5', sub:'#7a90b0', green:'#2ecc71' };

export default function LeaguePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justJoined = searchParams.get('joined') === '1';
  const [league, setLeague] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      setUserId(user.id);
      const { data: leagueData } = await supabase.from('leagues').select('*').eq('id', params.id).single();
      if (!leagueData) { router.push('/'); return; }
      setLeague(leagueData);
      const { data: membersData } = await supabase.from('league_members').select('*, profile:profiles(display_name)').eq('league_id', params.id).order('draft_slot', { ascending: true });
      setMembers(membersData || []);
      setLoading(false);
    }
    load();
    const channel = supabase.channel('league-'+params.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'league_members', filter: 'league_id=eq.'+params.id }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [params.id]);

  const isCommissioner = userId === league?.commissioner_id;
  const spotsLeft = (league?.league_size || 0) - members.length;
  const isFull = spotsLeft <= 0;
  const inviteUrl = league ? appUrl + '/join/' + league.invite_code : '';

  function copyLink() { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }

  async function startDraft() {
    if (!league || !isCommissioner) return;
    setStarting(true);
    const shuffled = [...members].sort(() => Math.random() - .5).map((m: any) => m.user_id);
    await supabase.from('leagues').update({ status: 'drafting', draft_order: shuffled }).eq('id', league.id);
    alert('Draft started! Draft room coming soon.');
    setStarting(false);
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:C.muted, fontFamily:'Oswald,sans-serif', letterSpacing:3 }}>Loading league...</div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:C.bg }}>
      <nav style={{ position:'sticky', top:0, zIndex:100, height:56, display:'flex', alignItems:'center', padding:'0 24px', gap:12, background:'rgba(5,8,15,.95)', borderBottom:'2px solid '+C.gold }}>
        <button onClick={() => router.push('/')} style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:16, letterSpacing:2, color:C.gold }}>🏈 CUF</button>
        <div style={{ width:1, height:20, background:C.surf3 }} />
        <span style={{ fontFamily:'Oswald,sans-serif', fontSize:13, color:C.sub, flex:1 }}>{league?.name}</span>
        <span style={{ fontFamily:'Oswald,sans-serif', fontSize:9, letterSpacing:2, color:C.gold, background:'rgba(212,168,40,.1)', border:'1px solid rgba(212,168,40,.3)', padding:'3px 10px', borderRadius:4 }}>{(league?.status||'').toUpperCase()}</span>
      </nav>

      <div style={{ maxWidth:760, margin:'0 auto', padding:'32px 20px' }}>
        {justJoined && (
          <div style={{ marginBottom:20, padding:'14px 18px', background:'rgba(46,204,113,.1)', border:'1px solid rgba(46,204,113,.3)', borderRadius:10, fontFamily:'Oswald,sans-serif', fontSize:13, color:C.green }}>
            🎉 You joined {league?.name}!
          </div>
        )}

        <h1 style={{ fontFamily:'Anton,sans-serif', fontSize:32, letterSpacing:1.5, color:C.text, textTransform:'uppercase', marginBottom:4 }}>{league?.name}</h1>
        <div style={{ fontFamily:'Oswald,sans-serif', fontSize:12, color:C.sub, marginBottom:28 }}>
          {league?.league_size} teams · {league?.buy_in===0?'Free':'$'+league?.buy_in} · {league?.draft_type==='snake'?'Snake draft':'Salary cap'}
        </div>

        <div style={{ background:C.surf, border:'1px solid '+C.surf3, borderRadius:12, overflow:'hidden', marginBottom:20 }}>
          <div style={{ padding:'16px 20px', background:C.surf2, borderBottom:'1px solid '+C.surf3, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'Anton,sans-serif', fontSize:15, letterSpacing:1.5, color:C.text, textTransform:'uppercase' }}>League Members</span>
            <span style={{ fontFamily:'Oswald,sans-serif', fontSize:12, color:isFull?C.gold:C.sub }}>{members.length} / {league?.league_size}{isFull?' — FULL':' — '+spotsLeft+' spots left'}</span>
          </div>
          {members.map((m: any, i: number) => {
            const isMe = m.user_id === userId;
            const isComm = m.user_id === league?.commissioner_id;
            return (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom:i<members.length-1?'1px solid '+C.surf3:'none', background:isMe?'rgba(212,168,40,.04)':'transparent' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, background:isMe?C.gold:C.surf3, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Anton,sans-serif', fontSize:13, color:isMe?C.bg:C.muted }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontFamily:'Oswald,sans-serif', fontWeight:600, fontSize:15, color:isMe?C.gold:C.text, textTransform:'uppercase' }}>{m.team_name}</span>
                    {isComm && <span style={{ fontFamily:'Oswald,sans-serif', fontSize:8, color:C.gold, background:'rgba(212,168,40,.15)', padding:'2px 7px', borderRadius:3 }}>COMM</span>}
                    {isMe && <span style={{ fontFamily:'Oswald,sans-serif', fontSize:8, color:C.green, background:'rgba(46,204,113,.1)', padding:'2px 7px', borderRadius:3 }}>YOU</span>}
                  </div>
                  <div style={{ fontFamily:'Oswald,sans-serif', fontSize:11, color:C.muted, marginTop:2 }}>{m.profile?.display_name || 'Member'}</div>
                </div>
                <div style={{ fontFamily:'monospace', fontSize:10, color:C.muted }}>Pick #{i+1}</div>
              </div>
            );
          })}
          {Array.from({ length: spotsLeft }).map((_, i) => (
            <div key={'empty-'+i} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom:i<spotsLeft-1?'1px solid '+C.surf3:'none', opacity:.4 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', border:'2px dashed '+C.surf3, display:'flex', alignItems:'center', justifyContent:'center', color:C.muted }}>{members.length+i+1}</div>
              <span style={{ fontFamily:'Oswald,sans-serif', fontSize:13, color:C.muted, fontStyle:'italic' }}>Waiting for invite...</span>
            </div>
          ))}
        </div>

        {league?.status === 'forming' && (
          <div style={{ background:C.surf, border:'1px solid '+C.surf3, borderRadius:12, padding:20, marginBottom:20 }}>
            <div style={{ fontFamily:'Oswald,sans-serif', fontSize:11, color:C.muted, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>📨 Invite Friends</div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <div style={{ flex:1, padding:'11px 14px', background:C.bg, border:'1px solid '+C.surf3, borderRadius:8, fontFamily:'monospace', fontSize:12, color:C.gold, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inviteUrl}</div>
              <button onClick={copyLink} style={{ flexShrink:0, padding:'11px 18px', background:copied?'rgba(46,204,113,.2)':C.gold, border:copied?'1px solid rgba(46,204,113,.4)':'none', borderRadius:8, cursor:'pointer', fontFamily:'Anton,sans-serif', fontSize:12, letterSpacing:2, color:copied?C.green:'#05080f', transition:'all .2s' }}>{copied?'✓ Copied':'Copy'}</button>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[{label:'📱 Text',href:'sms:?body=Join my CFB fantasy league! '+inviteUrl},{label:'💬 WhatsApp',href:'https://wa.me/?text='+encodeURIComponent('Join my CFB league: '+inviteUrl)},{label:'📧 Email',href:'mailto:?subject=Join my CFB Fantasy League&body='+encodeURIComponent('Join here: '+inviteUrl)}].map(({label,href}) => (
                <a key={label} href={href} target="_blank" rel="noreferrer" style={{ flex:1, textAlign:'center', padding:'9px', background:C.surf2, border:'1px solid '+C.surf3, borderRadius:8, textDecoration:'none', fontFamily:'Oswald,sans-serif', fontSize:11, letterSpacing:1, color:C.sub }}>{label}</a>
              ))}
            </div>
          </div>
        )}

        {isCommissioner && league?.status === 'forming' && (
          <div style={{ background:C.surf2, border:'1px solid '+C.surf3, borderRadius:12, padding:20 }}>
            <div style={{ fontFamily:'Oswald,sans-serif', fontSize:11, color:C.muted, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>Commissioner Controls</div>
            <button onClick={startDraft} disabled={starting} style={{ width:'100%', padding:15, background:starting?C.surf3:'linear-gradient(135deg,#d4a828,#f0c94a)', border:'none', borderRadius:8, cursor:starting?'wait':'pointer', fontFamily:'Anton,sans-serif', fontSize:15, letterSpacing:2, textTransform:'uppercase', color:'#05080f' }}>
              {starting ? 'Starting...' : '🏈 Start Draft Now'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}