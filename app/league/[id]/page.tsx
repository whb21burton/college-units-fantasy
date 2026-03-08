'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import type { TeamEfficiency, SchoolMatchup, WeeklyScore } from '@/types';

type SettingsSection = 'league' | 'team' | 'roster' | 'draft';

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
  const [showSettings, setShowSettings] = useState(false);
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
  const cpuTeams       = (league?.settings?.cpu_teams as string[]) ?? [];
  const totalOccupied  = members.length + cpuTeams.length;
  const spotsLeft      = (league?.league_size || 0) - totalOccupied;
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

  async function addCpu() {
    if (!isCommissioner || isFull || !league) return;
    const existing = (league.settings?.cpu_teams as string[]) ?? [];
    const newName  = `CPU Bot ${existing.length + 1}`;
    const updated  = [...existing, newName];
    await supabase.from('leagues')
      .update({ settings: { ...league.settings, cpu_teams: updated } })
      .eq('id', league.id);
    setLeague((prev: any) => ({ ...prev, settings: { ...(prev.settings ?? {}), cpu_teams: updated } }));
  }

  async function removeCpu(index: number) {
    if (!isCommissioner || !league) return;
    const existing = (league.settings?.cpu_teams as string[]) ?? [];
    const updated  = existing.filter((_: string, i: number) => i !== index);
    await supabase.from('leagues')
      .update({ settings: { ...league.settings, cpu_teams: updated } })
      .eq('id', league.id);
    setLeague((prev: any) => ({ ...prev, settings: { ...(prev.settings ?? {}), cpu_teams: updated } }));
  }

  async function startDraft() {
    if (!isCommissioner || !isFull || !league) return;
    const shuffled = [...members].sort(() => Math.random() - .5).map((m: any) => m.user_id);
    const { error } = await supabase.from('leagues')
      .update({ status: 'drafting', draft_order: shuffled })
      .eq('id', league.id);
    if (!error) {
      setLeague((prev: any) => ({ ...prev, status: 'drafting', draft_order: shuffled }));
      router.push(`/league/${params.id}/mock-draft`);
    }
  }

  if (loading) return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 3, fontSize: 13 }}>Loading league...</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, overflow: 'hidden' }}>

      {showSettings && (
        <LeagueSettingsModal
          league={league}
          myMember={myMember}
          isCommissioner={isCommissioner}
          userId={userId}
          onClose={() => setShowSettings(false)}
          onUpdate={() => loadData()}
        />
      )}

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>MANAGER</div>
                <button
                  onClick={() => setShowSettings(true)}
                  title="League Settings"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 2, color: C.muted, display: 'flex', alignItems: 'center',
                    borderRadius: 4, transition: 'color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.gold}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.muted}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>
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
                {totalOccupied}/{league?.league_size} — {isFull ? 'League full' : spotsLeft + ' spot' + (spotsLeft !== 1 ? 's' : '') + ' left'}
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
              cpuTeams={cpuTeams}
              onCopy={copyLink}
              onStartDraft={startDraft}
              onMockDraft={() => router.push(`/league/${params.id}/mock-draft`)}
              onAddCpu={addCpu}
              onRemoveCpu={removeCpu}
            />
          )}
          {activeTab === 'scores' && (
            <ScoresTab leagueId={params.id} members={members} league={league} userId={userId} />
          )}
          {activeTab !== 'draft' && activeTab !== 'scores' && (
            <PlaceholderTab
              label={TABS.find(t => t.key === activeTab)?.label || ''}
              icon={activeTab === 'team' ? '🏆' : activeTab === 'league' ? '⚙️' : '🏈'}
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
function DraftTab({ league, members, userId, spotsLeft, isFull, isCommissioner, inviteUrl, copied, cpuTeams, onCopy, onStartDraft, onMockDraft, onAddCpu, onRemoveCpu }: {
  league: any; members: any[]; userId: string | null;
  spotsLeft: number; isFull: boolean; isCommissioner: boolean;
  inviteUrl: string; copied: boolean; cpuTeams: string[];
  onCopy: () => void; onStartDraft: () => void; onMockDraft: () => void;
  onAddCpu: () => void; onRemoveCpu: (i: number) => void;
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
            {members.length + cpuTeams.length}/{size} — {isFull ? 'League full! Ready to draft.' : spotsLeft + ' spot' + (spotsLeft !== 1 ? 's' : '') + ' left'}
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
          const slotNum  = i + 1;
          const member   = members[i];
          const cpuIndex = i - members.length;
          const isCpu    = !member && cpuIndex >= 0 && cpuIndex < cpuTeams.length;
          const isEmpty  = !member && !isCpu;
          const isMe     = member?.user_id === userId;
          const isComm   = member?.user_id === league?.commissioner_id;

          if (member) return (
            <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < size - 1 ? '1px solid ' + C.surf3 : 'none', background: isMe ? 'rgba(212,168,40,.05)' : 'transparent' }}>
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
          );

          if (isCpu) return (
            <div key={'cpu-' + cpuIndex} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < size - 1 ? '1px solid ' + C.surf3 : 'none', background: 'rgba(58,130,246,.04)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'rgba(58,130,246,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 14, color: '#3b82f6' }}>{slotNum}</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontWeight: 600, fontSize: 15, color: C.sub, textTransform: 'uppercase' }}>{cpuTeams[cpuIndex]}</span>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: '#3b82f6', background: 'rgba(58,130,246,.15)', padding: '2px 7px', borderRadius: 3, letterSpacing: 1, flexShrink: 0 }}>CPU</span>
              </div>
              {isCommissioner && league?.status === 'forming' && (
                <button onClick={() => onRemoveCpu(cpuIndex)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, lineHeight: 1, padding: '2px 6px', borderRadius: 4 }} title="Remove CPU">×</button>
              )}
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.muted, flexShrink: 0 }}>Pick #{slotNum}</div>
            </div>
          );

          // Empty slot
          return (
            <div key={'empty-' + i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < size - 1 ? '1px solid ' + C.surf3 : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px dashed ' + C.surf3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>{slotNum}</div>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.muted, fontStyle: 'italic', flex: 1 }}>Waiting for invite...</span>
              {isCommissioner && league?.status === 'forming' && (
                <button onClick={onAddCpu} style={{ flexShrink: 0, padding: '5px 12px', background: 'rgba(58,130,246,.1)', border: '1px solid rgba(58,130,246,.3)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: '#3b82f6' }}>+ Add CPU</button>
              )}
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
            Fill <strong style={{ color: C.text }}>{spotsLeft}</strong> more spot{spotsLeft !== 1 ? 's' : ''} (invite managers or add CPUs) to start the draft.
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

/* ── Scores Tab ─────────────────────────────────────────────── */
function multiplierColor(m: number) {
  if (m >= 1.15) return '#16a34a';
  if (m >= 1.10) return '#15803d';
  if (m >= 1.05) return '#a16207';
  return C.muted;
}

function ScoresTab({
  leagueId, members, league, userId,
}: {
  leagueId: string; members: any[]; league: any; userId: string | null;
}) {
  const [efficiency,  setEfficiency]  = useState<Record<string, TeamEfficiency>>({});
  const [matchups,    setMatchups]    = useState<SchoolMatchup[]>([]);
  const [weeklyScore, setWeeklyScore] = useState<WeeklyScore[]>([]);
  const [loadingEff,  setLoadingEff]  = useState(true);

  const season      = new Date().getFullYear();
  const currentWeek = league?.current_week ?? 1;

  useEffect(() => {
    async function load() {
      setLoadingEff(true);
      try {
        const [effRes, schedRes, scoresRes] = await Promise.all([
          fetch(`/api/efficiency?week=${currentWeek}&season=${season}`),
          fetch(`/api/schedule?week=${currentWeek}&season=${season}`),
          supabase
            .from('weekly_scores')
            .select('*')
            .eq('league_id', leagueId)
            .eq('week', currentWeek),
        ]);

        if (effRes.ok) {
          const json = await effRes.json();
          const map: Record<string, TeamEfficiency> = {};
          for (const row of (json.data ?? []) as TeamEfficiency[]) map[row.school] = row;
          setEfficiency(map);
        }
        if (schedRes.ok) {
          const json = await schedRes.json();
          setMatchups(json.data ?? []);
        }
        const { data: scores } = scoresRes;
        setWeeklyScore(scores ?? []);
      } finally {
        setLoadingEff(false);
      }
    }
    load();
  }, [leagueId, currentWeek, season]);

  // Build schedule lookup: school → opponent
  const scheduleMap = new Map<string, string>();
  for (const m of matchups) {
    scheduleMap.set(m.home_school, m.away_school);
    scheduleMap.set(m.away_school, m.home_school);
  }

  // Build standings from weekly_scores adjusted_score
  const standings = [...members].map(member => {
    const score = weeklyScore.find(s => s.user_id === member.user_id);
    return {
      ...member,
      baseScore:     (score as any)?.base_score     ?? 0,
      adjustedScore: (score as any)?.adjusted_score ?? (score?.score ?? 0),
      multiplierUsed:(score as any)?.multiplier_used ?? 1.00,
    };
  }).sort((a, b) => b.adjustedScore - a.adjustedScore);

  const noEffData = Object.keys(efficiency).length === 0;

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
          Week {currentWeek} Scores
        </div>
        {noEffData && !loadingEff && (
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginTop: 4 }}>
            No efficiency data for this week yet. Commissioner can trigger calculation via the admin API.
          </div>
        )}
      </div>

      {/* Efficiency legend */}
      {!noEffData && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {([['≥95th', '1.20×', '#16a34a'], ['≥80th', '1.10×', '#15803d'], ['≥60th', '1.05×', '#a16207'], ['<60th', '1.00×', C.muted]] as const).map(([pct, mult, color]) => (
            <div key={pct} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, letterSpacing: .5 }}>
                {pct} → {mult}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Standings table */}
      <div style={{ background: C.surf, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.surf3}` }}>
        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: '24px 1fr 80px 80px 60px',
          gap: 8, padding: '8px 16px',
          borderBottom: `1px solid ${C.surf3}`,
          fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1,
          color: C.muted, textTransform: 'uppercase',
        }}>
          <div>#</div>
          <div>Team</div>
          <div style={{ textAlign: 'right' }}>Base Pts</div>
          <div style={{ textAlign: 'right' }}>Adj Pts</div>
          <div style={{ textAlign: 'right' }}>Bonus</div>
        </div>

        {standings.map((member, idx) => {
          const bonus = member.adjustedScore - member.baseScore;
          return (
            <div
              key={member.id}
              style={{
                display: 'grid', gridTemplateColumns: '24px 1fr 80px 80px 60px',
                gap: 8, padding: '10px 16px',
                borderBottom: idx < standings.length - 1 ? `1px solid ${C.surf3}` : 'none',
                background: member.user_id === userId ? `${C.surf2}` : 'transparent',
              }}
            >
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.muted, paddingTop: 2 }}>
                {idx + 1}
              </div>
              <div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text }}>
                  {member.team_name}
                </div>
                {!noEffData && (
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 1 }}>
                    Multiplier: {(member.multiplierUsed as number).toFixed(2)}×
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.sub, paddingTop: 2 }}>
                {member.baseScore > 0 ? member.baseScore.toFixed(1) : '—'}
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'Anton,sans-serif', fontSize: 15, color: C.text, paddingTop: 1 }}>
                {member.adjustedScore > 0 ? member.adjustedScore.toFixed(1) : '—'}
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'Anton,sans-serif', fontSize: 12, paddingTop: 2,
                color: bonus > 0 ? '#16a34a' : C.muted }}>
                {bonus > 0 ? `+${bonus.toFixed(1)}` : '—'}
              </div>
            </div>
          );
        })}

        {standings.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted }}>
            No members yet
          </div>
        )}
      </div>

      {/* School efficiency reference */}
      {!noEffData && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 12 }}>
            School Efficiency — Week {currentWeek}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {Object.values(efficiency)
              .sort((a, b) => b.def_percentile - a.def_percentile)
              .slice(0, 20)
              .map(eff => {
                const opponent = scheduleMap.get(eff.school);
                return (
                  <div key={eff.school} style={{
                    background: C.surf2, borderRadius: 8, padding: '10px 14px',
                    border: `1px solid ${C.surf3}`,
                  }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, fontWeight: 600 }}>
                      {eff.school}
                    </div>
                    {opponent && (
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginBottom: 4 }}>
                        vs {opponent}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                        background: multiplierColor(eff.off_multiplier), color: '#fff',
                      }}>
                        OFF {eff.off_multiplier.toFixed(2)}×
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                        background: multiplierColor(eff.def_multiplier), color: '#fff',
                      }}>
                        DEF {eff.def_multiplier.toFixed(2)}×
                      </span>
                    </div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 4 }}>
                      OFF {eff.off_percentile}th · DEF {eff.def_percentile}th percentile
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}
    </div>
  );
}

/* ── League Settings Modal ───────────────────────────────────── */
const SETTINGS_NAV: { key: SettingsSection; label: string; commOnly: boolean }[] = [
  { key: 'league', label: 'League Settings', commOnly: true  },
  { key: 'team',   label: 'Team Settings',   commOnly: false },
  { key: 'roster', label: 'Roster Settings', commOnly: true  },
  { key: 'draft',  label: 'Draft Settings',  commOnly: true  },
];

function LeagueSettingsModal({ league, myMember, isCommissioner, userId, onClose, onUpdate }: {
  league: any; myMember: any; isCommissioner: boolean;
  userId: string | null; onClose: () => void; onUpdate: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>(isCommissioner ? 'league' : 'team');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  // League Settings fields
  const [leagueName, setLeagueName] = useState<string>(league?.name || '');
  const [leagueSize, setLeagueSize] = useState<number>(league?.league_size || 8);

  // Team Settings fields
  const [teamName, setTeamName] = useState<string>(myMember?.team_name || '');

  const canEdit = (commOnly: boolean) => commOnly ? isCommissioner : true;

  async function save() {
    setSaving(true);
    if (section === 'league' && isCommissioner) {
      await supabase.from('leagues')
        .update({ name: leagueName.trim(), league_size: leagueSize })
        .eq('id', league.id);
    }
    if (section === 'team' && userId && myMember) {
      await supabase.from('league_members')
        .update({ team_name: teamName.trim() })
        .eq('id', myMember.id);
    }
    onUpdate();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 13px',
    background: C.bg, border: '1px solid ' + C.surf3,
    borderRadius: 8, color: C.text,
    fontFamily: 'Inter,sans-serif', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .15s',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'Oswald,sans-serif', fontSize: 10,
    letterSpacing: 2, color: C.muted,
    textTransform: 'uppercase', marginBottom: 8, display: 'block',
  };

  function OptionBtn({ value, current, onClick, children }: {
    value: string | number; current: string | number;
    onClick: () => void; children: React.ReactNode;
  }) {
    const active = value === current;
    return (
      <button onClick={onClick} style={{
        flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
        fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1,
        background: active ? 'rgba(212,168,40,0.12)' : C.surf3,
        border: '1px solid ' + (active ? C.gold : C.surf3),
        color: active ? C.gold : C.sub,
        transition: 'all .15s',
      }}>{children}</button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', width: 700, maxWidth: '96vw', height: 520, maxHeight: '90vh',
          background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {/* Left nav */}
        <div style={{
          width: 200, flexShrink: 0, background: C.surf2,
          borderRight: '1px solid ' + C.surf3,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid ' + C.surf3 }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>Settings</div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 3, letterSpacing: .5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{league?.name}</div>
          </div>
          <div style={{ flex: 1, paddingTop: 8 }}>
            {SETTINGS_NAV.map(item => {
              const active  = section === item.key;
              const locked  = item.commOnly && !isCommissioner;
              return (
                <button
                  key={item.key}
                  onClick={() => !locked && setSection(item.key)}
                  style={{
                    width: '100%', textAlign: 'left', background: active ? 'rgba(212,168,40,0.08)' : 'none',
                    border: 'none', borderLeft: active ? '3px solid ' + C.gold : '3px solid transparent',
                    padding: '11px 18px', cursor: locked ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span style={{
                    fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: .5,
                    color: locked ? C.surf3 : (active ? C.gold : C.sub),
                  }}>{item.label}</span>
                  {locked && <span style={{ fontSize: 10, color: C.surf3 }}>🔒</span>}
                </button>
              );
            })}
          </div>
          <button
            onClick={onClose}
            style={{
              margin: 14, padding: '8px 0', background: 'none',
              border: '1px solid ' + C.surf3, borderRadius: 6,
              cursor: 'pointer', fontFamily: 'Oswald,sans-serif',
              fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted,
            }}
          >✕ Close</button>
        </div>

        {/* Right content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Section header */}
          <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid ' + C.surf3, flexShrink: 0 }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
              {SETTINGS_NAV.find(s => s.key === section)?.label}
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginTop: 3 }}>
              {section === 'league' && 'League-wide settings — commissioner only'}
              {section === 'team'   && 'Your team profile — visible to all league members'}
              {section === 'roster' && 'Roster configuration — commissioner only'}
              {section === 'draft'  && 'Draft configuration — commissioner only'}
            </div>
          </div>

          {/* Form body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

            {/* ── League Settings ── */}
            {section === 'league' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={labelStyle}>League Name</label>
                  <input
                    value={leagueName}
                    onChange={e => setLeagueName(e.target.value)}
                    disabled={!isCommissioner}
                    style={{ ...inputStyle, opacity: isCommissioner ? 1 : .5 }}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.gold}
                    onBlur={e  => (e.target as HTMLInputElement).style.borderColor = C.surf3}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Teams</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[4, 6, 8, 10, 12, 14].map(n => (
                      <OptionBtn key={n} value={n} current={leagueSize} onClick={() => isCommissioner && setLeagueSize(n)}>
                        {n}
                      </OptionBtn>
                    ))}
                  </div>
                  {!isCommissioner && (
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 6 }}>Only the commissioner can change these settings.</div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Waiver Type</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Free Agent', 'FAAB Bidding', 'Rolling'].map(type => (
                      <OptionBtn key={type} value={type} current="FAAB Bidding" onClick={() => {}}>
                        {type}
                      </OptionBtn>
                    ))}
                  </div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 6 }}>Waiver wire coming soon.</div>
                </div>
              </div>
            )}

            {/* ── Team Settings ── */}
            {section === 'team' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={labelStyle}>Team Name</label>
                  <input
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    placeholder="Enter your team name..."
                    style={inputStyle}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.gold}
                    onBlur={e  => (e.target as HTMLInputElement).style.borderColor = C.surf3}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Team Logo</label>
                  <div style={{
                    width: 80, height: 80, borderRadius: 12, background: C.surf3,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px dashed ' + C.muted, cursor: 'not-allowed',
                  }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: 'center', letterSpacing: .5 }}>Coming<br/>Soon</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Roster Settings ── */}
            {section === 'roster' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={labelStyle}>Starter Slots</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { pos: 'QB',  slots: 1 },
                      { pos: 'RB',  slots: 2 },
                      { pos: 'WR',  slots: 2 },
                      { pos: 'TE',  slots: 1 },
                      { pos: 'DEF', slots: 1 },
                      { pos: 'K',   slots: 1 },
                    ].map(({ pos, slots }) => (
                      <div key={pos} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: C.surf2, borderRadius: 8, border: '1px solid ' + C.surf3 }}>
                        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text, letterSpacing: .5 }}>{pos}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[1, 2, 3].map(n => (
                            <OptionBtn key={n} value={n === slots ? n : -1} current={slots} onClick={() => {}}>
                              {n}
                            </OptionBtn>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 8 }}>Custom roster slots coming soon.</div>
                </div>
                <div>
                  <label style={labelStyle}>Bench Spots</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[4, 5, 6, 7, 8].map(n => (
                      <OptionBtn key={n} value={n === 7 ? n : -1} current={7} onClick={() => {}}>
                        {n}
                      </OptionBtn>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Draft Settings ── */}
            {section === 'draft' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={labelStyle}>Draft Type</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ v: 'snake', l: '🐍 Snake', sub: 'Serpentine order' }, { v: 'linear', l: '→ Linear', sub: 'Same order every round' }].map(({ v, l, sub }) => (
                      <button key={v} style={{
                        flex: 1, padding: '12px 0', borderRadius: 8, cursor: 'pointer',
                        background: v === 'snake' ? 'rgba(212,168,40,0.1)' : C.surf2,
                        border: '1px solid ' + (v === 'snake' ? C.gold : C.surf3),
                        color: v === 'snake' ? C.gold : C.sub,
                        fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1,
                      }}>
                        {l}
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: v === 'snake' ? 'rgba(212,168,40,0.7)' : C.muted, marginTop: 3 }}>{sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Pick Timer</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[{ l: '30s', v: 30 }, { l: '60s', v: 60 }, { l: '90s', v: 90 }, { l: '2 min', v: 120 }, { l: '∞', v: 0 }].map(({ l, v }) => (
                      <OptionBtn key={v} value={v === 60 ? v : -1} current={60} onClick={() => {}}>
                        {l}
                      </OptionBtn>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Draft Order</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Randomize', 'Manual'].map(t => (
                      <OptionBtn key={t} value={t === 'Randomize' ? t : ''} current="Randomize" onClick={() => {}}>
                        {t}
                      </OptionBtn>
                    ))}
                  </div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 6 }}>Full draft settings customization coming soon.</div>
                </div>
              </div>
            )}
          </div>

          {/* Footer save button — only for sections with saveable data */}
          {(section === 'league' || section === 'team') && canEdit(section === 'league') && (
            <div style={{ padding: '14px 28px', borderTop: '1px solid ' + C.surf3, flexShrink: 0 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  padding: '11px 32px',
                  background: saved ? 'rgba(46,204,113,0.15)' : 'linear-gradient(135deg,#d4a828,#f0c94a)',
                  border: saved ? '1px solid rgba(46,204,113,0.4)' : 'none',
                  borderRadius: 8, cursor: saving ? 'default' : 'pointer',
                  fontFamily: 'Anton,sans-serif', fontSize: 13,
                  letterSpacing: 2, textTransform: 'uppercase',
                  color: saved ? C.green : C.bg,
                  transition: 'all .2s',
                }}
              >
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
