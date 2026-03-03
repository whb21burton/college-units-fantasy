'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', muted: '#4a5d7a', text: '#e8edf5', sub: '#7a90b0',
  green: '#2ecc71', red: '#e74c3c',
};

type Tab = 'draft' | 'team' | 'league' | 'players' | 'scores';

const TABS: { key: Tab; label: string }[] = [
  { key: 'draft',   label: 'Draft'    },
  { key: 'team',    label: 'Team'     },
  { key: 'league',  label: 'League'   },
  { key: 'players', label: 'Players'  },
  { key: 'scores',  label: 'Scores'   },
];

export default function LeaguePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [league,       setLeague]       = useState<any>(null);
  const [members,      setMembers]      = useState<any[]>([]);
  const [userId,       setUserId]       = useState<string | null>(null);
  const [userEmail,    setUserEmail]    = useState('');
  const [myLeagues,    setMyLeagues]    = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [copied,       setCopied]       = useState(false);
  const [activeTab,    setActiveTab]    = useState<Tab>('draft');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput,    setChatInput]    = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  async function loadData(uid?: string) {
    const resolvedUid = uid ?? userId;

    const { data: leagueData } = await supabase
      .from('leagues').select('*').eq('id', params.id).single();
    if (!leagueData) { router.push('/'); return; }
    setLeague(leagueData);

    const { data: membersData } = await supabase
      .from('league_members').select('*').eq('league_id', params.id)
      .order('draft_slot', { ascending: true });
    setMembers(membersData || []);

    if (resolvedUid) {
      const { data: myMemberships } = await supabase
        .from('league_members').select('league_id').eq('user_id', resolvedUid);
      if (myMemberships?.length) {
        const ids = myMemberships.map((m: any) => m.league_id);
        const { data: leaguesData } = await supabase
          .from('leagues').select('id, name, status').in('id', ids);
        setMyLeagues(leaguesData || []);
      }
    }

    const { data: msgs } = await supabase
      .from('league_messages').select('*').eq('league_id', params.id)
      .order('created_at', { ascending: true }).limit(100);
    setChatMessages(msgs || []);
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      setUserId(user.id);
      setUserEmail(user.email || '');
      await loadData(user.id);
      setLoading(false);
    }
    init();

    const membersCh = supabase.channel('members-' + params.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_members', filter: 'league_id=eq.' + params.id }, () => loadData())
      .subscribe();

    const chatCh = supabase.channel('chat-' + params.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'league_messages', filter: 'league_id=eq.' + params.id }, (payload) => {
        setChatMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(membersCh); supabase.removeChannel(chatCh); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const isCommissioner = userId === league?.commissioner_id;
  const myMember       = members.find((m: any) => m.user_id === userId);
  const spotsLeft      = (league?.league_size || 0) - members.length;
  const isFull         = spotsLeft <= 0;
  const inviteUrl      = league ? appUrl + '/join/' + league.invite_code : '';
  const userInitial    = (userEmail || 'U').charAt(0).toUpperCase();

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function sendChat() {
    if (!chatInput.trim() || !userId) return;
    const msg = chatInput.trim();
    setChatInput('');
    await supabase.from('league_messages').insert({
      league_id: params.id,
      user_id:   userId,
      message:   msg,
      team_name: myMember?.team_name || userEmail.split('@')[0],
    });
  }

  async function startDraft() {
    if (!isCommissioner || !isFull || !league) return;
    const shuffled = [...members].sort(() => Math.random() - .5).map((m: any) => m.user_id);
    await supabase.from('leagues')
      .update({ status: 'drafting', draft_order: shuffled })
      .eq('id', league.id);
  }

  if (loading) return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 3, fontSize: 13 }}>Loading league...</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, overflow: 'hidden' }}>

      {/* ══════════════════════════════════════════════
          LEFT SIDEBAR
      ══════════════════════════════════════════════ */}
      <aside style={{
        width: 220, flexShrink: 0, background: C.surf,
        borderRight: '1px solid ' + C.surf3,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid ' + C.surf3, flexShrink: 0 }}>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, color: C.gold }}
          >🏈 CUF</button>
        </div>

        {/* My Leagues */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px 6px', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>My Leagues</div>
          {myLeagues.map((lg: any) => {
            const active = lg.id === params.id;
            return (
              <button
                key={lg.id}
                onClick={() => router.push('/league/' + lg.id)}
                style={{
                  width: '100%', textAlign: 'left', background: active ? 'rgba(212,168,40,.08)' : 'none',
                  border: 'none', borderLeft: active ? '3px solid ' + C.gold : '3px solid transparent',
                  padding: '10px 16px', cursor: 'pointer',
                }}
              >
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: active ? C.gold : C.text, fontWeight: active ? 600 : 400, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{lg.name}</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.muted, textTransform: 'uppercase', marginTop: 2 }}>{lg.status}</div>
              </button>
            );
          })}
        </div>

        {/* User footer */}
        <div style={{ padding: 14, borderTop: '1px solid ' + C.surf3, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#d4a828,#f0c94a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.bg,
            }}>{userInitial}</div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {myMember?.team_name || userEmail.split('@')[0]}
              </div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>MANAGER</div>
            </div>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
            style={{ width: '100%', padding: '7px', background: 'none', border: '1px solid ' + C.surf3, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted }}
          >Sign Out</button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* League header + tabs */}
        <div style={{ background: C.surf, borderBottom: '1px solid ' + C.surf3, flexShrink: 0 }}>
          <div style={{ padding: '14px 24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase', margin: 0 }}>{league?.name}</h1>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.gold, background: 'rgba(212,168,40,.1)', border: '1px solid rgba(212,168,40,.3)', padding: '2px 8px', borderRadius: 4 }}>
                {(league?.status || 'FORMING').toUpperCase()}
              </span>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: isFull ? C.gold : C.sub }}>
                {members.length}/{league?.league_size} — {isFull ? 'League full' : spotsLeft + ' spot' + (spotsLeft !== 1 ? 's' : '') + ' left'}
              </span>
            </div>
            <div style={{ display: 'flex' }}>
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '8px 18px', background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'Oswald,sans-serif', fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                    color: activeTab === tab.key ? C.gold : C.sub,
                    borderBottom: activeTab === tab.key ? '2px solid ' + C.gold : '2px solid transparent',
                    marginBottom: -1, transition: 'color .15s',
                  }}
                >{tab.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {activeTab === 'draft' && (
            <DraftTab
              league={league}
              members={members}
              userId={userId}
              spotsLeft={spotsLeft}
              isFull={isFull}
              isCommissioner={isCommissioner}
              inviteUrl={inviteUrl}
              copied={copied}
              onCopy={copyLink}
              onStartDraft={startDraft}
              onMockDraft={() => router.push(`/league/${params.id}/mock-draft`)}
            />
          )}
          {activeTab !== 'draft' && (
            <PlaceholderTab
              label={TABS.find(t => t.key === activeTab)?.label || ''}
              icon={activeTab === 'team' ? '🏆' : activeTab === 'league' ? '⚙️' : activeTab === 'players' ? '🏈' : '📊'}
            />
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          RIGHT CHAT PANEL
      ══════════════════════════════════════════════ */}
      <aside style={{
        width: 280, flexShrink: 0, background: C.surf,
        borderLeft: '1px solid ' + C.surf3,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid ' + C.surf3, flexShrink: 0 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>League Chat</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 2 }}>{league?.name}</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {chatMessages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, opacity: .5 }}>
              <div style={{ fontSize: 28 }}>💬</div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>No messages yet.<br/>Start the conversation!</div>
            </div>
          )}
          {chatMessages.map((msg: any, i: number) => {
            const isMe = msg.user_id === userId;
            return (
              <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 3 }}>
                  {isMe ? 'You' : (msg.team_name || 'Unknown')}
                </div>
                <div style={{
                  maxWidth: '85%', padding: '8px 11px',
                  borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isMe ? 'rgba(212,168,40,.12)' : C.surf2,
                  border: isMe ? '1px solid rgba(212,168,40,.22)' : '1px solid ' + C.surf3,
                  fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text, lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}>
                  {msg.message}
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid ' + C.surf3, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Message..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              style={{ flex: 1, padding: '9px 11px', background: C.bg, border: '1px solid ' + C.surf3, borderRadius: 8, color: C.text, fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none', minWidth: 0 }}
            />
            <button
              onClick={sendChat}
              disabled={!chatInput.trim()}
              style={{ padding: '9px 13px', background: chatInput.trim() ? C.gold : C.surf3, border: 'none', borderRadius: 8, cursor: chatInput.trim() ? 'pointer' : 'default', fontFamily: 'Anton,sans-serif', fontSize: 14, color: chatInput.trim() ? C.bg : C.muted, transition: 'all .15s', flexShrink: 0 }}
            >↑</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ── Draft Tab ──────────────────────────────────────────────── */
function DraftTab({ league, members, userId, spotsLeft, isFull, isCommissioner, inviteUrl, copied, onCopy, onStartDraft, onMockDraft }: {
  league: any; members: any[]; userId: string | null;
  spotsLeft: number; isFull: boolean; isCommissioner: boolean;
  inviteUrl: string; copied: boolean;
  onCopy: () => void; onStartDraft: () => void; onMockDraft: () => void;
}) {
  const size = league?.league_size || 0;

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Invite friends banner */}
      {league?.status === 'forming' && (
        <div style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>📨 Invite Friends</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, padding: '9px 13px', background: C.bg, border: '1px solid ' + C.surf3, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: C.gold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{inviteUrl}</div>
            <button
              onClick={onCopy}
              style={{ flexShrink: 0, padding: '9px 16px', background: copied ? 'rgba(46,204,113,.2)' : C.gold, border: copied ? '1px solid rgba(46,204,113,.4)' : 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 2, color: copied ? C.green : C.bg, transition: 'all .2s' }}
            >{copied ? '✓ Copied' : 'Copy Link'}</button>
          </div>
        </div>
      )}

      {/* Draftboard header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase' }}>Draftboard</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: isFull ? C.gold : C.sub, marginTop: 2 }}>
            {members.length}/{size} — {isFull ? 'League full! Ready to draft.' : spotsLeft + ' spot' + (spotsLeft !== 1 ? 's' : '') + ' left'}
          </div>
        </div>
        <button
          onClick={onMockDraft}
          style={{ padding: '9px 18px', background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: C.sub, transition: 'all .15s' }}
        >Mock Draft</button>
      </div>

      {/* Slots */}
      <div style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        {Array.from({ length: size }).map((_, i) => {
          const member  = members[i];
          const isMe    = member?.user_id === userId;
          const isComm  = member?.user_id === league?.commissioner_id;
          const slotNum = i + 1;

          return member ? (
            <div
              key={member.id}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < size - 1 ? '1px solid ' + C.surf3 : 'none', background: isMe ? 'rgba(212,168,40,.05)' : 'transparent' }}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: isMe ? 'linear-gradient(135deg,#d4a828,#f0c94a)' : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 14, color: isMe ? C.bg : C.muted }}>{slotNum}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Oswald,sans-serif', fontWeight: 600, fontSize: 15, color: isMe ? C.gold : C.text, textTransform: 'uppercase', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{member.team_name}</span>
                  {isComm && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.gold, background: 'rgba(212,168,40,.15)', padding: '2px 7px', borderRadius: 3, letterSpacing: 1, flexShrink: 0 }}>COMM</span>}
                  {isMe   && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.green, background: 'rgba(46,204,113,.1)',  padding: '2px 7px', borderRadius: 3, letterSpacing: 1, flexShrink: 0 }}>YOU</span>}
                </div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.muted, flexShrink: 0 }}>Pick #{slotNum}</div>
            </div>
          ) : (
            <div
              key={'empty-' + i}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < size - 1 ? '1px solid ' + C.surf3 : 'none', opacity: .42 }}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px dashed ' + C.surf3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>{slotNum}</div>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.muted, fontStyle: 'italic' }}>Waiting for invite...</span>
            </div>
          );
        })}
      </div>

      {/* Commissioner controls */}
      {isCommissioner && league?.status === 'forming' && (
        isFull ? (
          <button
            onClick={onStartDraft}
            style={{ width: '100%', padding: 17, background: 'linear-gradient(135deg,#d4a828,#f0c94a)', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 3, textTransform: 'uppercase', color: C.bg }}
          >🏈 Start Draft</button>
        ) : (
          <div style={{ padding: '13px 18px', background: 'rgba(212,168,40,.05)', border: '1px solid rgba(212,168,40,.18)', borderRadius: 10, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, textAlign: 'center' }}>
            Waiting for <strong style={{ color: C.text }}>{spotsLeft}</strong> more manager{spotsLeft !== 1 ? 's' : ''} before you can start the draft.
          </div>
        )
      )}
    </div>
  );
}

/* ── Placeholder tabs ───────────────────────────────────────── */
function PlaceholderTab({ label, icon }: { label: string; icon: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 12, opacity: .6 }}>
      <div style={{ fontSize: 44 }}>{icon}</div>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.surf3, letterSpacing: 1 }}>Coming soon</div>
    </div>
  );
}
