'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

const C = {
  bg: '#05080f',
  surf: '#0c1220',
  surf2: '#131d30',
  surf3: '#1e2d47',
  surf4: '#243352',
  gold: '#d4a828',
  goldLight: '#f0c94a',
  goldDark: '#a07e18',
  muted: '#4a5d7a',
  text: '#e8edf5',
  sub: '#7a90b0',
  green: '#2ecc71',
  red: '#e74c3c',
  blue: '#3b82f6',
};

type League = {
  id: string;
  name: string;
  status: string;
  league_size: number;
  draft_type: string;
  commissioner_id: string;
  invite_code: string;
};

type Member = {
  id: string;
  user_id: string;
  team_name: string;
  draft_slot: number | null;
  profiles?: { display_name: string };
};

type ChatMessage = {
  id: string;
  user_id: string;
  display_name: string;
  text: string;
  sent_at: string;
};

export default function LeagueLobbyPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeLeague, setActiveLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); showAuth(); return; }
      setUser(user);
      loadLeagues(user.id);
    });
  }, []);

  function showAuth() {
    setLoading(false);
  }

  async function loadLeagues(userId: string) {
    const { data } = await supabase
      .from('league_members')
      .select('league_id, leagues(*)')
      .eq('user_id', userId);
    if (data && data.length > 0) {
      const leagueList = data.map((d: any) => d.leagues).filter(Boolean);
      setLeagues(leagueList);
      setActiveLeague(leagueList[0]);
      loadLeagueData(leagueList[0].id);
    }
    setLoading(false);
  }

  async function loadLeagueData(leagueId: string) {
    const { data: membersData } = await supabase
      .from('league_members')
      .select('*, profiles(display_name)')
      .eq('league_id', leagueId)
      .order('joined_at', { ascending: true });
    if (membersData) setMembers(membersData);
    setChatMessages([
      { id: '1', user_id: 'sys', display_name: 'System', text: '🏈 League created! Invite your friends to get started.', sent_at: new Date().toISOString() },
    ]);
  }

  function selectLeague(league: League) {
    setActiveLeague(league);
    loadLeagueData(league.id);
  }

  function sendChat(e: React.KeyboardEvent | { key: string }) {
    if (e.key !== 'Enter' || !chatInput.trim()) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      user_id: user?.id,
      display_name: user?.email?.split('@')[0] || 'You',
      text: chatInput.trim(),
      sent_at: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, msg]);
    setChatInput('');
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  function copyInviteLink() {
    if (!activeLeague) return;
    const url = `${window.location.origin}/join/${activeLeague.invite_code}`;
    navigator.clipboard.writeText(url);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setLeagues([]);
    setActiveLeague(null);
  }

  const isCommissioner = activeLeague && user && activeLeague.commissioner_id === user.id;
  const spotsLeft = activeLeague ? activeLeague.league_size - members.length : 0;
  const isFull = spotsLeft === 0;

  if (loading) return (
    <div style={{ background: '#05080f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: 4, color: '#d4a828', textTransform: 'uppercase' }}>Loading...</div>
    </div>
  );

  if (!user) return (
    <div style={{ background: '#05080f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
      <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 32, letterSpacing: 3, color: '#d4a828' }}>⚡ UNITS</div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, color: '#7a90b0', letterSpacing: 1 }}>College Fantasy Football</div>
      <button onClick={() => router.push('/?auth=signin')} style={{
        padding: '14px 36px', background: 'linear-gradient(135deg, #d4a828, #f0c94a)',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: 3,
        textTransform: 'uppercase', color: '#05080f',
      }}>Sign In</button>
    </div>
  );

  if (leagues.length === 0) return (
    <div style={{ background: '#05080f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 24, letterSpacing: 2, color: '#e8edf5' }}>No Leagues Yet</div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: '#7a90b0' }}>Create or join a league to get started.</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => router.push('/?view=create')} style={{
          padding: '12px 28px', background: 'linear-gradient(135deg, #d4a828, #f0c94a)',
          border: 'none', borderRadius: 8, cursor: 'pointer',
          fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: 2,
          textTransform: 'uppercase', color: '#05080f',
        }}>Create League</button>
        <button onClick={() => router.push('/?view=join')} style={{
          padding: '12px 28px', background: 'none',
          border: '1px solid #1e2d47', borderRadius: 8, cursor: 'pointer',
          fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: 2,
          textTransform: 'uppercase', color: '#7a90b0',
        }}>Join League</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, overflow: 'hidden', fontFamily: "'Oswald', sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.surf}; }
        ::-webkit-scrollbar-thumb { background: ${C.surf3}; border-radius: 2px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .chat-msg { animation: fadeIn .2s ease; }
        .league-item:hover { background: ${C.surf2} !important; cursor: pointer; }
        .icon-btn:hover { background: ${C.surf3} !important; }
        .member-row:hover { background: ${C.surf2} !important; }
      `}</style>

      {/* LEFT SIDEBAR */}
      <div style={{ width: 220, background: C.surf, borderRight: `1px solid ${C.surf3}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${C.surf3}` }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 15, letterSpacing: 3, color: C.gold, textTransform: 'uppercase' }}>⚡ Units</div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, marginTop: 2 }}>COLLEGE FANTASY</div>
        </div>

        <div style={{ padding: '12px 8px', borderBottom: `1px solid ${C.surf3}` }}>
          <div className="league-item" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, color: C.sub, fontSize: 13, letterSpacing: .5, transition: 'background .15s' }}>
            <span style={{ fontSize: 14 }}>📥</span>Inbox
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', marginBottom: 8 }}>
            <span style={{ fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Leagues</span>
            <button onClick={() => router.push('/?view=create')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, lineHeight: 1, padding: '0 2px' }} title="Create league">+</button>
          </div>
          {leagues.map(league => (
            <div key={league.id} className="league-item" onClick={() => selectLeague(league)} style={{
              padding: '10px 10px', borderRadius: 8,
              background: activeLeague?.id === league.id ? C.surf2 : 'transparent',
              borderLeft: activeLeague?.id === league.id ? `3px solid ${C.gold}` : '3px solid transparent',
              marginBottom: 4, transition: 'all .15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${C.gold}33, ${C.surf3})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🏈</div>
                <div>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 600, lineHeight: 1.3 }}>{league.name}</div>
                  <div style={{ fontSize: 10, color: C.muted, letterSpacing: .5, marginTop: 2 }}>
                    {league.league_size}-Team · {league.status === 'forming' ? '• PRE DRAFT' : league.status.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: C.bg, fontFamily: "'Anton', sans-serif" }}>
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div style={{ fontSize: 11, color: C.sub, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email?.split('@')[0]}
            </div>
          </div>
          <button onClick={signOut} className="icon-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 14, padding: '4px 6px', borderRadius: 4, transition: 'background .15s' }} title="Sign out">↩</button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '0 24px', height: 52, borderBottom: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surf, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.gold}44, ${C.surf3})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏈</div>
            <div>
              <span style={{ fontSize: 15, color: C.text, fontWeight: 700, letterSpacing: .5 }}>{activeLeague?.name}</span>
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 10, letterSpacing: 1 }}>
                {activeLeague?.league_size}-TEAM {activeLeague?.draft_type?.toUpperCase()}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <button style={{ padding: '6px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, letterSpacing: 2, color: C.gold, fontFamily: "'Oswald', sans-serif", borderBottom: `2px solid ${C.gold}`, transition: 'color .15s' }}>DRAFT</button>
          </div>
          <div style={{ width: 120 }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isFull && (
            <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, color: C.text, fontWeight: 600, letterSpacing: .5, marginBottom: 4 }}>Invite friends to play</div>
                <div style={{ fontSize: 11, color: C.sub, letterSpacing: .5 }}>Copy the link and share with your friends</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 420 }}>
                <div style={{ flex: 1, padding: '9px 14px', background: C.bg, border: `1px solid ${C.surf3}`, borderRadius: 8, fontSize: 12, color: C.gold, fontFamily: "'IBM Plex Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/join/${activeLeague?.invite_code}` : ''}
                </div>
                <button onClick={copyInviteLink} style={{ padding: '9px 18px', flexShrink: 0, background: copiedInvite ? 'rgba(46,204,113,.2)' : `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, border: copiedInvite ? '1px solid rgba(46,204,113,.4)' : 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: copiedInvite ? C.green : C.bg, transition: 'all .2s' }}>
                  {copiedInvite ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: 13, color: C.sub, flexShrink: 0 }}>
                <strong style={{ color: C.text, fontFamily: "'Anton', sans-serif", fontSize: 18 }}>{members.length}</strong>
                <span style={{ color: C.muted }}>/{activeLeague?.league_size}</span>
              </div>
            </div>
          )}

          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, color: C.text, fontWeight: 700, letterSpacing: .5 }}>Draftboard</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3, letterSpacing: .5 }}>
                  {isFull ? 'League is full — ready to draft!' : `Waiting for ${spotsLeft} more team${spotsLeft !== 1 ? 's' : ''}`}
                </div>
              </div>
              {isCommissioner && isFull && (
                <button style={{ padding: '10px 22px', background: `linear-gradient(135deg, ${C.green}, #27ae60)`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#fff' }}>Start Draft</button>
              )}
            </div>

            <div style={{ background: `linear-gradient(135deg, ${C.bg}, ${C.surf2})`, padding: '32px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
              {isFull ? (
                [['00','DAYS'],['00','HRS'],['00','MINS'],['00','SECS']].map(([val, label]) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 48, color: C.gold, letterSpacing: 2, lineHeight: 1 }}>{val}</div>
                    <div style={{ fontSize: 10, color: C.muted, letterSpacing: 3, marginTop: 6 }}>{label}</div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
                  <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' }}>Waiting for League to Fill</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 8, letterSpacing: .5 }}>{members.length} of {activeLeague?.league_size} teams joined</div>
                  <div style={{ width: 280, height: 4, background: C.surf3, borderRadius: 2, margin: '16px auto 0' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight})`, width: `${(members.length / (activeLeague?.league_size || 8)) * 100}%`, transition: 'width .4s ease' }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Draft Order</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {Array.from({ length: activeLeague?.league_size || 8 }).map((_, i) => {
                  const member = members[i];
                  return (
                    <div key={i} className="member-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: member ? C.surf2 : C.bg, border: `1px solid ${member ? C.surf3 : C.surf3 + '66'}`, transition: 'background .15s' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: member ? `linear-gradient(135deg, ${C.gold}44, ${C.surf4})` : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Anton', sans-serif", fontSize: 11, color: member ? C.gold : C.muted }}>{i + 1}</div>
                      <div style={{ overflow: 'hidden' }}>
                        {member ? (
                          <>
                            <div style={{ fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.team_name}</div>
                            <div style={{ fontSize: 10, color: C.muted, letterSpacing: .5 }}>{member.profiles?.display_name || 'Player'}</div>
                          </>
                        ) : (
                          <div style={{ fontSize: 11, color: C.muted, letterSpacing: .5 }}>Open slot</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'League Size', value: `${activeLeague?.league_size} Teams` },
              { label: 'Draft Type', value: activeLeague?.draft_type === 'snake' ? '🐍 Snake' : '💰 Salary' },
              { label: 'Status', value: activeLeague?.status?.toUpperCase() || 'FORMING' },
              { label: 'Season', value: 'Wks 1–13' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: CHAT */}
      <div style={{ width: 280, background: C.surf, borderLeft: `1px solid ${C.surf3}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 700, letterSpacing: 1 }}>League Chat</div>
          <div style={{ fontSize: 11, color: C.muted }}>🔔</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {chatMessages.map(msg => (
            <div key={msg.id} className="chat-msg">
              {msg.user_id === 'sys' ? (
                <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', padding: '6px 10px', background: C.surf2, borderRadius: 6, letterSpacing: .5 }}>{msg.text}</div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>{msg.display_name}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>{new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, background: msg.user_id === user?.id ? 'rgba(212,168,40,.08)' : C.surf2, padding: '8px 12px', borderRadius: 8, borderLeft: msg.user_id === user?.id ? `2px solid ${C.gold}` : 'none' }}>{msg.text}</div>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.surf3}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="text" placeholder="Message..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={sendChat} style={{ flex: 1, padding: '9px 12px', background: C.bg, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: "'Oswald', sans-serif", fontSize: 13, outline: 'none' }} />
            <button onClick={() => sendChat({ key: 'Enter' })} style={{ padding: '9px 12px', background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: C.bg }}>➤</button>
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6, letterSpacing: .5, textAlign: 'center' }}>Press Enter to send</div>
        </div>
      </div>
    </div>
  );
}