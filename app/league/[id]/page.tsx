'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import type { DraftUnit } from '@/lib/playerPool';
import type { TeamEfficiency, SchoolMatchup, WeeklyScore } from '@/types';

type SettingsSection = 'league' | 'team' | 'roster' | 'draft' | 'danger';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', muted: '#4a5d7a', text: '#e8edf5', sub: '#7a90b0',
  green: '#2ecc71', red: '#e74c3c',
};

const SEASON_GAMES = 12;
function weeklyProj(seasonPts: number): number {
  return seasonPts / SEASON_GAMES;
}

type MatchupCtx = {
  opponentMap: Record<string, string>;
  offPct: Record<string, number>;
  defPct: Record<string, number>;
} | null;

function offMatchupMult(opponentDefPct: number): number {
  if (opponentDefPct >= 85) return 0.70;
  if (opponentDefPct >= 70) return 0.83;
  if (opponentDefPct >= 55) return 0.93;
  if (opponentDefPct >= 40) return 1.00;
  if (opponentDefPct >= 25) return 1.10;
  if (opponentDefPct >= 10) return 1.20;
  return 1.30;
}
function defMatchupMult(opponentOffPct: number): number {
  if (opponentOffPct >= 85) return 0.70;
  if (opponentOffPct >= 70) return 0.83;
  if (opponentOffPct >= 55) return 0.93;
  if (opponentOffPct >= 40) return 1.00;
  if (opponentOffPct >= 25) return 1.10;
  if (opponentOffPct >= 10) return 1.20;
  return 1.30;
}

/** Returns adjusted weekly projection + opponent info for a pick or pool unit. */
function matchupProj(seasonPts: number, school: string, unitType: string, ctx: MatchupCtx): { pts: number; mult: number; opponent: string | null } {
  const base = weeklyProj(seasonPts);
  if (!ctx) return { pts: base, mult: 1.0, opponent: null };
  const opponent = ctx.opponentMap[school] ?? null;
  if (!opponent) return { pts: base, mult: 1.0, opponent: null };
  const mult = unitType === 'DEF'
    ? defMatchupMult(ctx.offPct[opponent] ?? 50)
    : offMatchupMult(ctx.defPct[opponent] ?? 50);
  return { pts: base * mult, mult, opponent };
}

function MatchupBadge({ mult, opponent }: { mult: number; opponent: string | null }) {
  if (!opponent) return null;
  let label: string; let color: string;
  if (mult >= 1.20)      { label = 'Easy';  color = '#2ecc71'; }
  else if (mult >= 1.08) { label = 'Good';  color = '#a3c65e'; }
  else if (mult >= 0.93) { label = 'Avg';   color = '#4a5d7a'; }
  else if (mult >= 0.80) { label = 'Hard';  color = '#f39c12'; }
  else                   { label = 'Tough'; color = '#e74c3c'; }
  return (
    <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color, letterSpacing: .5 }}>
      vs {opponent.length > 10 ? opponent.split(' ').pop() : opponent} · {label}
    </span>
  );
}

type Tab = 'draft' | 'matchup' | 'team' | 'league' | 'players' | 'scores';

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

  // Auto-switch to Matchup tab when draft completes
  useEffect(() => {
    if (league?.status === 'active' && activeTab === 'draft') {
      setActiveTab('matchup');
    }
  }, [league?.status]);

  const isCommissioner = userId === league?.commissioner_id;
  const myMember       = members.find((m: any) => m.user_id === userId);
  const cpuTeams       = (league?.settings?.cpu_teams as string[]) ?? [];
  const totalOccupied  = members.length + cpuTeams.length;
  const spotsLeft      = (league?.league_size || 0) - totalOccupied;
  const isFull         = spotsLeft <= 0;

  // Replace Draft tab with Matchup tab once league is active
  const computedTabs = TABS.map(t =>
    t.key === 'draft' && league?.status === 'active'
      ? { key: 'matchup' as Tab, label: 'Matchup' }
      : t
  );
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
    // Navigate to real draft room — the draft page handles slot assignment and status change
    router.push(`/league/${params.id}/draft`);
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
          <div style={{ padding: '12px 16px 6px', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            My Leagues
            <button
              onClick={() => router.push('/')}
              title="Create new league"
              style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px', marginRight: 2 }}
            >+</button>
          </div>
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
              {computedTabs.map(tab => (
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
          {activeTab === 'matchup' && (
            <MatchupTab league={league} userId={userId} />
          )}
          {activeTab === 'team' && (
            <TeamTab league={league} userId={userId} />
          )}
          {activeTab === 'league' && (
            <LeagueTab league={league} userId={userId} />
          )}
          {activeTab === 'scores' && (
            <ScoresTab leagueId={params.id} members={members} league={league} userId={userId} />
          )}
          {activeTab === 'players' && (
            <WaiverTab league={league} userId={userId} />
          )}
          {activeTab !== 'draft' && activeTab !== 'matchup' && activeTab !== 'team' && activeTab !== 'league' && activeTab !== 'scores' && activeTab !== 'players' && (
            <PlaceholderTab
              label={computedTabs.find(t => t.key === activeTab)?.label || ''}
              icon="🏈"
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

      {/* Commissioner controls — forming */}
      {isCommissioner && league?.status === 'forming' && (
        isFull ? (
          <button
            onClick={onStartDraft}
            style={{ width: '100%', padding: 17, background: 'linear-gradient(135deg,#d4a828,#f0c94a)', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 3, textTransform: 'uppercase', color: C.bg }}
          >🏈 Enter Draft Room</button>
        ) : (
          <div style={{ padding: '13px 18px', background: 'rgba(212,168,40,.05)', border: '1px solid rgba(212,168,40,.18)', borderRadius: 10, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, textAlign: 'center' }}>
            Fill <strong style={{ color: C.text }}>{spotsLeft}</strong> more spot{spotsLeft !== 1 ? 's' : ''} (invite managers or add CPUs) to start the draft.
          </div>
        )
      )}

      {/* All members — join live draft when it's active */}
      {league?.status === 'drafting' && (
        <button
          onClick={onStartDraft}
          style={{ width: '100%', padding: 17, background: 'linear-gradient(135deg,#d4a828,#f0c94a)', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 3, textTransform: 'uppercase', color: C.bg }}
        >🏈 Join Draft Room</button>
      )}
    </div>
  );
}

/* ── Waiver Wire Tab ─────────────────────────────────────────── */
function WaiverTab({ league, userId }: { league: any; userId: string | null }) {
  const [allPicks,    setAllPicks]    = useState<any[]>([]);
  const [myPicks,     setMyPicks]     = useState<any[]>([]);
  const [pool,        setPool]        = useState<DraftUnit[]>([]);
  const [posFilter,   setPosFilter]   = useState<string>('ALL');
  const [search,      setSearch]      = useState('');
  const [adding,      setAdding]      = useState<any | null>(null);
  const [dropping,    setDropping]    = useState<any | null>(null);
  const [busy,        setBusy]        = useState(false);
  const [toast,       setToast]       = useState('');
  const [loading,     setLoading]     = useState(true);

  const POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF', 'K'];

  useEffect(() => {
    if (!league?.id || !userId) return;
    async function load() {
      const [picksRes, poolRes] = await Promise.all([
        supabase.from('draft_picks').select('*').eq('league_id', league.id),
        fetch('/api/player-pool').then(r => r.json()),
      ]);
      const all = picksRes.data || [];
      setAllPicks(all);
      setMyPicks(all.filter((p: any) => p.user_id === userId));
      setPool(Array.isArray(poolRes) ? poolRes : []);
      setLoading(false);
    }
    load();
  }, [league?.id, userId]);

  const draftedIds = new Set(allPicks.map((p: any) => p.player_data?.id).filter(Boolean));

  const freeAgents = pool
    .filter(p => !draftedIds.has(p.id))
    .filter(p => posFilter === 'ALL' || p.unitType === posFilter)
    .filter(p => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return p.school.toLowerCase().includes(q) ||
        (p.playerName ?? '').toLowerCase().includes(q) ||
        p.unitType.toLowerCase().includes(q);
    })
    .sort((a, b) => a.adp - b.adp);

  async function confirmAdd() {
    if (!adding || !dropping || !userId) return;
    setBusy(true);
    // Remove dropped pick
    await supabase.from('draft_picks').delete().eq('id', dropping.id);
    // Insert new pick with next pick_number (just use a high number so it doesn't conflict)
    const maxPick = allPicks.reduce((m: number, p: any) => Math.max(m, p.pick_number ?? 0), 0);
    await supabase.from('draft_picks').insert({
      league_id: league.id,
      user_id: userId,
      pick_number: maxPick + 1,
      player_data: adding,
    });
    // Refresh
    const { data } = await supabase.from('draft_picks').select('*').eq('league_id', league.id);
    const all = data || [];
    setAllPicks(all);
    setMyPicks(all.filter((p: any) => p.user_id === userId));
    setAdding(null);
    setDropping(null);
    setBusy(false);
    setToast(`Added ${adding.playerName || adding.school} ${adding.unitType}, dropped ${dropping.player_data?.playerName || dropping.player_data?.school} ${dropping.player_data?.unitType}`);
    setTimeout(() => setToast(''), 4000);
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
      Loading waiver wire…
    </div>
  );

  /* ── Drop modal ── */
  if (adding) {
    const faName = adding.playerName || adding.school;
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', paddingTop: 8 }}>
        <button onClick={() => { setAdding(null); setDropping(null); }} style={{ background: 'none', border: 'none', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, cursor: 'pointer', marginBottom: 16, letterSpacing: 1 }}>
          ← BACK
        </button>
        {/* Adding banner */}
        <div style={{ background: C.surf, border: '1px solid ' + C.green, borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.green, letterSpacing: 1, marginBottom: 4 }}>ADDING</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 15, color: C.text }}>{faName}</div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted }}>{adding.unitType} · {adding.school} · {weeklyProj(adding.projectedPoints).toFixed(1)} pts/wk</div>
            </div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, color: C.green }}>{weeklyProj(adding.projectedPoints).toFixed(1)}</div>
          </div>
        </div>
        {/* Pick a player to drop */}
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>SELECT A PLAYER TO DROP</div>
        {myPicks.length === 0 && (
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted, textAlign: 'center', padding: 20 }}>You have no players on your roster yet.</div>
        )}
        {myPicks
          .slice()
          .sort((a: any, b: any) => (a.player_data?.adp ?? 999) - (b.player_data?.adp ?? 999))
          .map((pick: any) => {
          const pd = pick.player_data;
          const name = pd?.playerName || pd?.school;
          const isSelected = dropping?.id === pick.id;
          return (
            <div key={pick.id} onClick={() => setDropping(isSelected ? null : pick)}
              style={{ background: isSelected ? '#3d1515' : C.surf, border: '1px solid ' + (isSelected ? C.red : C.surf3), borderRadius: 8, padding: '12px 16px', marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'border-color .15s' }}>
              <div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text }}>{name}</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>{pd?.unitType} · {pd?.school} · {weeklyProj(pd?.projectedPoints ?? 0).toFixed(1)} pts/wk</div>
              </div>
              {isSelected && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.red, letterSpacing: 1 }}>DROP</div>}
            </div>
          );
        })}
        {dropping && (
          <button onClick={confirmAdd} disabled={busy} style={{ marginTop: 16, width: '100%', padding: '12px 0', background: C.green, border: 'none', borderRadius: 8, fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 1, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .6 : 1 }}>
            {busy ? 'PROCESSING…' : `ADD ${(adding.playerName || adding.school).toUpperCase()} / DROP ${(dropping.player_data?.playerName || dropping.player_data?.school || '').toUpperCase()}`}
          </button>
        )}
      </div>
    );
  }

  /* ── Free agent list ── */
  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {toast && (
        <div style={{ background: '#14532d', border: '1px solid ' + C.green, borderRadius: 8, padding: '10px 16px', marginBottom: 14, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.green }}>
          {toast}
        </div>
      )}
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {POS_FILTERS.map(f => (
          <button key={f} onClick={() => setPosFilter(f)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid ' + (posFilter === f ? C.gold : C.surf3), background: posFilter === f ? C.gold : C.surf2, color: posFilter === f ? C.bg : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: .5 }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…" style={{ flex: 1, minWidth: 140, background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 8, padding: '6px 12px', color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12, outline: 'none' }} />
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px', gap: 8, padding: '4px 12px', marginBottom: 4 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>PLAYER</div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1, textAlign: 'right' }}>PROJ</div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1, textAlign: 'right' }}>ADP</div>
        <div />
      </div>

      {freeAgents.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>No free agents found.</div>
      )}

      {freeAgents.map(p => {
        const name = p.playerName || p.school;
        const posColor: Record<string, string> = { QB: '#ef4444', RB: '#3b82f6', WR: '#d4a828', TE: '#a855f7', DEF: '#10b981', K: '#f97316' };
        return (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px', gap: 8, alignItems: 'center', background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 8, padding: '10px 12px', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: posColor[p.unitType] || C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 11, color: '#fff', flexShrink: 0 }}>
                {p.unitType}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>{p.school} · {p.conference} · {p.tier}</div>
              </div>
            </div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.gold, textAlign: 'right' }}>{weeklyProj(p.projectedPoints).toFixed(1)}</div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, textAlign: 'right' }}>{p.adp.toFixed(1)}</div>
            <button onClick={() => setAdding(p)} style={{ padding: '6px 0', background: C.surf3, border: '1px solid ' + C.surf3, borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, fontWeight: 700, color: C.gold, cursor: 'pointer', letterSpacing: .5 }}>
              + ADD
            </button>
          </div>
        );
      })}
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

/* ── Matchup Tab ─────────────────────────────────────────────── */
const STARTER_SLOT_LABELS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DEF', 'K'];
const POS_COLORS: Record<string, string> = {
  QB: '#ef4444', RB: '#3b82f6', WR: '#d4a828', TE: '#a855f7',
  DEF: '#10b981', K: '#f97316', FLEX: '#06b6d4',
};

function snakeIdx(pickNum: number, numTeams: number): number {
  const round = Math.floor(pickNum / numTeams);
  const pos   = pickNum % numTeams;
  return round % 2 === 0 ? pos : numTeams - 1 - pos;
}

function assignRoster(picks: any[]): { starters: (any | null)[]; bench: any[] } {
  const byPos: Record<string, any[]> = { QB: [], RB: [], WR: [], TE: [], DEF: [], K: [] };
  for (const p of picks) {
    const pos = p.player_data?.unitType as string;
    if (pos && byPos[pos]) byPos[pos].push(p);
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  }
  const starters: (any | null)[] = [];
  const usedIds = new Set<string>();
  function take(arr: any[]) {
    const p = arr.find(x => !usedIds.has(x.id)) ?? null;
    if (p) usedIds.add(p.id);
    return p;
  }
  starters.push(take(byPos.QB));  // QB1
  starters.push(take(byPos.RB));  // RB1
  starters.push(take(byPos.RB));  // RB2
  starters.push(take(byPos.WR));  // WR1
  starters.push(take(byPos.WR));  // WR2
  starters.push(take(byPos.TE));  // TE1
  // FLEX: best unused RB/WR/TE
  const flexPool = [...byPos.RB, ...byPos.WR, ...byPos.TE]
    .filter(p => !usedIds.has(p.id))
    .sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  const flex = flexPool[0] ?? null;
  if (flex) usedIds.add(flex.id);
  starters.push(flex);            // FLEX
  starters.push(take(byPos.DEF)); // DEF
  starters.push(take(byPos.K));   // K
  const bench = picks
    .filter(p => !usedIds.has(p.id))
    .sort((a, b) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  return { starters, bench };
}

function MatchupPlayerCell({ pick, align, ctx }: { pick: any | null; align: 'left' | 'right'; ctx: MatchupCtx }) {
  const isRight = align === 'right';
  if (!pick) return (
    <div style={{
      display: 'flex', alignItems: 'center', minHeight: 44,
      justifyContent: isRight ? 'flex-end' : 'flex-start',
      padding: '9px 14px', background: C.surf,
      borderRadius: isRight ? '8px 0 0 8px' : '0 8px 8px 0',
      border: '1px solid ' + C.surf3,
      borderRight: isRight ? 'none' : undefined,
      borderLeft: isRight ? undefined : 'none',
    }}>
      <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>Empty</span>
    </div>
  );
  const mp   = matchupProj(pick.player_data?.projectedPoints ?? 0, pick.player_data?.school, pick.player_data?.unitType, ctx);
  const pts  = mp.pts.toFixed(1);
  const name = pick.player_data?.playerName || pick.player_data?.school;
  const sub  = pick.player_data?.playerName ? pick.player_data.school : pick.player_data?.conference;
  const info = (
    <div style={{ minWidth: 0, textAlign: isRight ? 'right' : 'left' }}>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text, fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{name}</div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>{sub}</div>
      <MatchupBadge mult={mp.mult} opponent={mp.opponent} />
    </div>
  );
  const score = (
    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: isRight ? C.gold : C.sub, flexShrink: 0, minWidth: 46, textAlign: isRight ? 'right' : 'left' }}>
      {pts}
    </div>
  );
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: isRight ? 'flex-end' : 'flex-start',
      gap: 12, padding: '9px 14px', background: C.surf2,
      borderRadius: isRight ? '8px 0 0 8px' : '0 8px 8px 0',
      border: '1px solid ' + C.surf3,
      borderRight: isRight ? 'none' : undefined,
      borderLeft: isRight ? undefined : 'none',
    }}>
      {isRight ? <>{info}{score}</> : <>{score}{info}</>}
    </div>
  );
}

function MatchupTab({ league, userId }: { league: any; userId: string | null }) {
  const [picks,      setPicks]      = useState<any[]>([]);
  const [week,       setWeek]       = useState(1);
  const [matchupCtx, setMatchupCtx] = useState<MatchupCtx>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!league?.id) return;
    supabase.from('draft_picks').select('*').eq('league_id', league.id)
      .order('pick_number', { ascending: true })
      .then(({ data }) => { setPicks(data || []); setLoading(false); });
  }, [league?.id]);

  useEffect(() => {
    fetch(`/api/matchup-context?week=${week}&season=2025`)
      .then(r => r.json()).then(setMatchupCtx).catch(() => setMatchupCtx(null));
  }, [week]);

  const draftOrder: any[] = league?.settings?.draft_order || [];
  const numTeams = draftOrder.length;

  const myEntry    = draftOrder.find((t: any) => t.userId === userId);
  const mySlotIdx  = myEntry ? myEntry.slot - 1 : -1;
  const oppSlotIdx = mySlotIdx < 0 ? -1
    : mySlotIdx % 2 === 0 ? mySlotIdx + 1 : mySlotIdx - 1;
  const oppEntry   = oppSlotIdx >= 0 && oppSlotIdx < numTeams ? draftOrder[oppSlotIdx] : null;

  const myPicksRaw  = picks.filter(p => numTeams > 0 && snakeIdx(p.pick_number, numTeams) === mySlotIdx);
  const oppPicksRaw = picks.filter(p => numTeams > 0 && snakeIdx(p.pick_number, numTeams) === oppSlotIdx);

  const myRoster  = assignRoster(myPicksRaw);
  const oppRoster = assignRoster(oppPicksRaw);

  // Total = starters only, matchup-adjusted
  const myTotal  = myRoster.starters.reduce((s, p) => s + matchupProj(p?.player_data?.projectedPoints ?? 0, p?.player_data?.school, p?.player_data?.unitType, matchupCtx).pts, 0);
  const oppTotal = oppRoster.starters.reduce((s, p) => s + matchupProj(p?.player_data?.projectedPoints ?? 0, p?.player_data?.school, p?.player_data?.unitType, matchupCtx).pts, 0);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
      Loading matchup…
    </div>
  );

  if (!myEntry || numTeams === 0) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13 }}>
      Draft not yet complete or no matchup data available.
    </div>
  );

  const myTeamName  = myEntry.teamName;
  const oppTeamName = oppEntry?.teamName ?? 'BYE';
  const iAhead      = myTotal >= oppTotal;
  const benchLen    = Math.max(myRoster.bench.length, oppRoster.bench.length);

  return (
    <div style={{ maxWidth: 820 }}>

      {/* Week selector + label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => setWeek(w => Math.max(1, w - 1))} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>‹</button>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 3, color: C.muted, textTransform: 'uppercase' }}>
          Week {week} · Projected{matchupCtx ? ' (matchup-adjusted)' : ''}
        </div>
        <button onClick={() => setWeek(w => Math.min(15, w + 1))} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>›</button>
      </div>

      {/* Score header card */}
      <div style={{
        background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 14,
        padding: '22px 28px', marginBottom: 24,
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center',
      }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, letterSpacing: 1, color: iAhead ? C.gold : C.sub, lineHeight: 1 }}>{myTotal.toFixed(1)}</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 14, color: C.text, fontWeight: 600, marginTop: 6 }}>{myTeamName}</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginTop: 2 }}>YOUR TEAM · STARTERS</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 3, color: C.muted }}>VS</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, letterSpacing: 1, color: !iAhead ? C.gold : C.sub, lineHeight: 1 }}>{oppTotal.toFixed(1)}</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 14, color: C.text, fontWeight: 600, marginTop: 6 }}>{oppTeamName}</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginTop: 2 }}>OPPONENT · STARTERS</div>
        </div>
      </div>

      {/* Starters section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 1, background: C.surf3 }} />
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Starters</span>
        <div style={{ flex: 1, height: 1, background: C.surf3 }} />
      </div>

      {STARTER_SLOT_LABELS.map((label, i) => {
        const color = POS_COLORS[label] || C.muted;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', marginBottom: 4 }}>
            <MatchupPlayerCell pick={myRoster.starters[i] ?? null} align="right" ctx={matchupCtx} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: color + '22', border: '1px solid ' + color + '44', borderLeft: 'none', borderRight: 'none' }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1, color, fontWeight: 700 }}>{label}</span>
            </div>
            <MatchupPlayerCell pick={oppRoster.starters[i] ?? null} align="left" ctx={matchupCtx} />
          </div>
        );
      })}

      {/* Bench section */}
      {benchLen > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 1, background: C.surf3 }} />
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Bench</span>
            <div style={{ flex: 1, height: 1, background: C.surf3 }} />
          </div>
          {Array.from({ length: benchLen }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', marginBottom: 4 }}>
              <MatchupPlayerCell pick={myRoster.bench[i] ?? null} align="right" ctx={matchupCtx} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.muted + '22', border: '1px solid ' + C.muted + '44', borderLeft: 'none', borderRight: 'none' }}>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1, color: C.muted, fontWeight: 700 }}>BN</span>
              </div>
              <MatchupPlayerCell pick={oppRoster.bench[i] ?? null} align="left" ctx={matchupCtx} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ── Team Tab ────────────────────────────────────────────────── */
const SLOT_ELIGIBLE: Record<string, string[]> = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'], DEF: ['DEF'], K: ['K'],
};

function canFillSlot(unitType: string, slotLabel: string): boolean {
  return (SLOT_ELIGIBLE[slotLabel] ?? []).includes(unitType);
}

function TeamTab({ league, userId }: { league: any; userId: string | null }) {
  const [myPicks,       setMyPicks]       = useState<any[]>([]);
  const [lineups,       setLineups]       = useState<Record<string, (string | null)[]>>({});
  const [week,          setWeek]          = useState(1);
  const [matchupCtx,    setMatchupCtx]    = useState<MatchupCtx>(null);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [memberId,      setMemberId]      = useState<string | null>(null);
  const [memberSlot,    setMemberSlot]    = useState<number | null>(null);
  const [memberName,    setMemberName]    = useState<string>('');
  const [selectedBench, setSelectedBench] = useState<any | null>(null);

  const TOTAL_WEEKS = 13;
  const isCommissioner = league?.commissioner_id === userId;

  useEffect(() => {
    fetch(`/api/matchup-context?week=${week}&season=2025`)
      .then(r => r.json()).then(setMatchupCtx).catch(() => setMatchupCtx(null));
  }, [week]);

  useEffect(() => {
    if (!league?.id || !userId) return;
    async function load() {
      try {
        const [{ data: memberData }, { data: allPicksData }] = await Promise.all([
          supabase.from('league_members')
            .select('id, roster, draft_slot, team_name')
            .eq('league_id', league.id)
            .eq('user_id', userId)
            .single(),
          // Load ALL league picks — needed to find commissioner's slot via snakeIdx
          supabase.from('draft_picks')
            .select('*')
            .eq('league_id', league.id)
            .order('pick_number', { ascending: true }),
        ]);

        let slot: number | null = null;
        if (memberData) {
          setMemberId(memberData.id);
          if (memberData.draft_slot) { slot = memberData.draft_slot; setMemberSlot(slot); }
          if (memberData.team_name) setMemberName(memberData.team_name);
          const r = memberData.roster;
          if (r && typeof r === 'object' && !Array.isArray(r) && r.lineups) {
            setLineups(r.lineups);
          }
        }

        const allPicks: any[] = allPicksData || [];
        // For non-commissioners: each human's picks are stored with their own user_id — simple filter
        // For commissioners: their picks AND CPU picks all share commissioner's user_id, need snakeIdx
        let mine: any[] = [];
        if (!isCommissioner) {
          mine = allPicks.filter((p: any) => p.user_id === userId);
        } else {
          const draftOrder: any[] = league?.settings?.draft_order || [];
          const numTeams = draftOrder.length;
          const myEntry  = draftOrder.find((t: any) => t.userId === userId);
          const slotIdx  = myEntry ? myEntry.slot - 1 : (slot !== null ? slot - 1 : -1);
          if (numTeams > 0 && slotIdx >= 0) {
            mine = allPicks.filter(p => snakeIdx(p.pick_number, numTeams) === slotIdx);
          }
          // Commissioner fallback: if snakeIdx found nothing, show user_id picks
          if (mine.length === 0) {
            mine = allPicks.filter((p: any) => p.user_id === userId);
          }
        }
        setMyPicks(mine);
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.id, userId]);

  const draftOrder: any[] = league?.settings?.draft_order || [];
  const myEntry           = draftOrder.find((t: any) => t.userId === userId);
  const myTeamName        = myEntry?.teamName || memberName;
  const myPicksRaw        = myPicks;

  const weekKey   = String(week);
  const savedIds  = lineups[weekKey]; // (string | null)[] length 9

  let starters: (any | null)[];
  let bench: any[];

  if (savedIds && savedIds.length === 9) {
    const pickMap = new Map(myPicksRaw.map((p: any) => [p.id, p]));
    starters = savedIds.map(id => (id ? pickMap.get(id) ?? null : null));
    const starterIdSet = new Set(savedIds.filter(Boolean));
    bench = myPicksRaw
      .filter((p: any) => !starterIdSet.has(p.id))
      .sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
  } else {
    const r = assignRoster(myPicksRaw);
    starters = r.starters;
    bench    = r.bench;
  }

  const starterTotal = starters.reduce((s, p) => s + matchupProj(p?.player_data?.projectedPoints ?? 0, p?.player_data?.school, p?.player_data?.unitType, matchupCtx).pts, 0);

  async function doSwap(starterIdx: number) {
    if (!selectedBench) return;
    const newStarters = [...starters];
    const evicted = newStarters[starterIdx];
    newStarters[starterIdx] = selectedBench;
    const newBench = bench.filter((p: any) => p.id !== selectedBench.id);
    if (evicted) newBench.push(evicted);
    newBench.sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
    const newIds: (string | null)[] = newStarters.map(p => p?.id ?? null);
    const newLineups = { ...lineups, [weekKey]: newIds };
    setLineups(newLineups);
    setSelectedBench(null);
    if (memberId) {
      setSaving(true);
      await supabase.from('league_members').update({ roster: { lineups: newLineups } }).eq('id', memberId);
      setSaving(false);
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
      Loading roster…
    </div>
  );

  if (myPicksRaw.length === 0) return (
    <div style={{ textAlign: 'center', padding: 60, fontFamily: 'Oswald,sans-serif' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 15, color: C.text, marginBottom: 6 }}>No roster found</div>
      <div style={{ fontSize: 11, color: C.muted }}>
        Complete the real draft first — mock drafts don&apos;t save picks here.
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 540 }}>

      {/* Week tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map(w => (
          <button
            key={w}
            onClick={() => { setWeek(w); setSelectedBench(null); }}
            style={{
              padding: '5px 13px',
              background: week === w ? 'rgba(212,168,40,.14)' : C.surf2,
              border: '1px solid ' + (week === w ? C.gold : C.surf3),
              borderRadius: 6, cursor: 'pointer',
              fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
              color: week === w ? C.gold : C.sub,
            }}
          >Wk {w}</button>
        ))}
      </div>

      {/* Projected score header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 10,
        padding: '14px 18px', marginBottom: 20,
      }}>
        <div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Projected · Starters Only</div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, color: C.gold, letterSpacing: 1, marginTop: 2 }}>{starterTotal.toFixed(1)}</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, marginTop: 2 }}>{myTeamName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.muted }}>WEEK {week}</div>
          {saving && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, marginTop: 4 }}>Saving…</div>}
        </div>
      </div>

      {/* Swap hint */}
      {selectedBench && (
        <div style={{
          padding: '9px 14px', marginBottom: 12,
          background: 'rgba(212,168,40,.08)', border: '1px solid rgba(212,168,40,.3)',
          borderRadius: 8, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.gold,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>Move {selectedBench.player_data?.playerName || selectedBench.player_data?.school} — tap a highlighted slot</span>
          <button
            onClick={() => setSelectedBench(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gold, fontSize: 14, lineHeight: 1, padding: '0 4px' }}
          >✕</button>
        </div>
      )}

      {/* Starters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 1, background: C.surf3 }} />
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Starters</span>
        <div style={{ flex: 1, height: 1, background: C.surf3 }} />
      </div>

      {STARTER_SLOT_LABELS.map((label, i) => {
        const pick    = starters[i];
        const color   = POS_COLORS[label] || C.muted;
        const isTarget = selectedBench != null && canFillSlot(selectedBench.player_data?.unitType, label);
        const mp      = matchupProj(pick?.player_data?.projectedPoints ?? 0, pick?.player_data?.school, pick?.player_data?.unitType, matchupCtx);
        const pts     = mp.pts.toFixed(1);
        const name    = pick?.player_data?.playerName || pick?.player_data?.school;
        const sub     = pick?.player_data?.playerName ? pick.player_data.school : pick?.player_data?.conference;
        const tier    = pick?.player_data?.tier;

        return (
          <div
            key={i}
            onClick={() => { if (isTarget) doSwap(i); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', marginBottom: 4,
              background: isTarget ? color + '18' : C.surf2,
              border: '1px solid ' + (isTarget ? color + '88' : C.surf3),
              borderRadius: 8, cursor: isTarget ? 'pointer' : 'default',
              transition: 'all .15s',
            }}
          >
            {/* Slot badge */}
            <div style={{
              width: 36, flexShrink: 0, textAlign: 'center',
              fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700,
              letterSpacing: 1, color,
              background: color + '22', border: '1px solid ' + color + '44',
              borderRadius: 4, padding: '3px 0',
            }}>{label}</div>

            {/* Player info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {pick ? (
                <>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text, fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>{sub}{tier ? ' · ' + tier : ''}</div>
                  <MatchupBadge mult={mp.mult} opponent={mp.opponent} />
                </>
              ) : (
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>Empty</span>
              )}
            </div>

            {/* Projected pts */}
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, color: pick ? C.gold : C.surf3, flexShrink: 0, minWidth: 42, textAlign: 'right' }}>
              {pick ? pts : '—'}
            </div>

            {/* Swap indicator */}
            {isTarget && (
              <div style={{
                flexShrink: 0, padding: '3px 9px', borderRadius: 5,
                background: color + '33', border: '1px solid ' + color + '88',
                fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color,
              }}>SWAP</div>
            )}
          </div>
        );
      })}

      {/* Bench */}
      {bench.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 1, background: C.surf3 }} />
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Bench</span>
            <div style={{ flex: 1, height: 1, background: C.surf3 }} />
          </div>

          {bench.map((pick: any) => {
            const isSelected = selectedBench?.id === pick.id;
            const bmp  = matchupProj(pick.player_data?.projectedPoints ?? 0, pick.player_data?.school, pick.player_data?.unitType, matchupCtx);
            const pts  = bmp.pts.toFixed(1);
            const name = pick.player_data?.playerName || pick.player_data?.school;
            const sub  = pick.player_data?.playerName ? pick.player_data.school : pick.player_data?.conference;
            const tier = pick.player_data?.tier;
            const pos  = pick.player_data?.unitType as string;
            const col  = POS_COLORS[pos] || C.muted;

            return (
              <div
                key={pick.id}
                onClick={() => setSelectedBench(isSelected ? null : pick)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', marginBottom: 4,
                  background: isSelected ? 'rgba(212,168,40,.1)' : C.surf,
                  border: '1px solid ' + (isSelected ? 'rgba(212,168,40,.5)' : C.surf3),
                  borderRadius: 8, cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {/* BN badge */}
                <div style={{
                  width: 36, flexShrink: 0, textAlign: 'center',
                  fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700,
                  letterSpacing: 1, color: C.muted,
                  background: C.muted + '22', border: '1px solid ' + C.muted + '44',
                  borderRadius: 4, padding: '3px 0',
                }}>BN</div>

                {/* Pos dot */}
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0 }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: isSelected ? C.gold : C.text, fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>{sub}{tier ? ' · ' + tier : ''}</div>
                </div>

                {/* Pts */}
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, color: isSelected ? C.gold : C.sub, flexShrink: 0, minWidth: 42, textAlign: 'right' }}>
                  {pts}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ── League Tab ──────────────────────────────────────────────── */
function PickCheckbox({ pick, checked, onToggle, accent }: { pick: any; checked: boolean; onToggle: () => void; accent: string }) {
  const pos = pick.player_data?.unitType as string;
  const col = POS_COLORS[pos] || C.muted;
  return (
    <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 3, background: checked ? accent + '18' : C.surf, border: '1px solid ' + (checked ? accent : C.surf3), borderRadius: 7, cursor: 'pointer', transition: 'all .12s' }}>
      <div style={{ width: 13, height: 13, borderRadius: 3, border: '2px solid ' + (checked ? accent : C.surf3), background: checked ? accent : 'none', flexShrink: 0 }} />
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: col, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.player_data?.playerName || pick.player_data?.school}</div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>{pos} · {weeklyProj(pick.player_data?.projectedPoints ?? 0).toFixed(1)} pts</div>
      </div>
    </div>
  );
}

function getWeekMatchups(teams: any[], week: number): [any, any][] {
  const n = teams.length;
  if (n < 2 || n % 2 !== 0) return [];
  // Round-robin: fix index 0, rotate the rest by week-1
  const rest = teams.slice(1);
  const rotated = rest.map((_, i) => rest[(i + week - 1) % rest.length]);
  const ordered = [teams[0], ...rotated];
  const result: [any, any][] = [];
  for (let i = 0; i < n / 2; i++) result.push([ordered[i], ordered[n - 1 - i]]);
  return result;
}

function LeagueTab({ league, userId }: { league: any; userId: string | null }) {
  type LView = 'matchups' | 'roster' | 'trade';
  const [view,          setView]          = useState<LView>('matchups');
  const [selectedTeam,  setSelectedTeam]  = useState<any>(null);
  const [selectedPlayer,setSelectedPlayer]= useState<any>(null);
  const [week,          setWeek]          = useState(1);
  const [matchupCtx,    setMatchupCtx]    = useState<MatchupCtx>(null);
  const [allPicks,      setAllPicks]      = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tradeOffer,    setTradeOffer]    = useState<Set<string>>(new Set());
  const [tradeRequest,  setTradeRequest]  = useState<Set<string>>(new Set());
  const [submitting,    setSubmitting]    = useState(false);
  const [trades,        setTrades]        = useState<any[]>([]);
  const [tradeMsg,      setTradeMsg]      = useState('');

  const draftOrder: any[] = league?.settings?.draft_order || [];
  const numTeams           = draftOrder.length;
  const isCommissioner     = league?.commissioner_id === userId;
  const myEntry            = draftOrder.find((t: any) => t.userId === userId);
  const mySlotIdx          = myEntry ? myEntry.slot - 1 : -1;

  useEffect(() => {
    fetch(`/api/matchup-context?week=${week}&season=2025`)
      .then(r => r.json()).then(setMatchupCtx).catch(() => setMatchupCtx(null));
  }, [week]);

  useEffect(() => {
    if (!league?.id || !userId) return;
    async function load() {
      try {
        const [{ data: picksData }, { data: tradesData }] = await Promise.all([
          supabase.from('draft_picks').select('*').eq('league_id', league.id).order('pick_number'),
          supabase.from('trades').select('*').eq('league_id', league.id)
            .or(`proposer_id.eq.${userId},receiver_id.eq.${userId}`),
        ]);
        setAllPicks(picksData || []);
        setTrades(tradesData || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [league?.id, userId]);

  function getTeamPicks(team: any): any[] {
    if (numTeams === 0) return [];
    const slotIdx = team.slot - 1;
    return allPicks.filter(p => snakeIdx(p.pick_number, numTeams) === slotIdx);
  }

  function getMyPicks(): any[] {
    if (!isCommissioner) return allPicks.filter((p: any) => p.user_id === userId);
    if (numTeams > 0 && mySlotIdx >= 0)
      return allPicks.filter(p => snakeIdx(p.pick_number, numTeams) === mySlotIdx);
    return allPicks.filter((p: any) => p.user_id === userId);
  }

  async function proposeTrade() {
    if (!userId || tradeOffer.size === 0 || tradeRequest.size === 0 || !selectedTeam?.userId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('trades').insert({
        league_id: league.id,
        proposer_id: userId,
        receiver_id: selectedTeam.userId,
        offer_pick_ids: Array.from(tradeOffer),
        request_pick_ids: Array.from(tradeRequest),
        status: 'pending',
      });
      if (!error) {
        setView('roster');
        setTradeOffer(new Set());
        setTradeRequest(new Set());
        setTradeMsg('Trade sent!');
        setTimeout(() => setTradeMsg(''), 3000);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function respondTrade(tradeId: string, status: 'accepted' | 'declined') {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;
    if (status === 'accepted') {
      // Swap pick ownership
      await Promise.all([
        ...trade.offer_pick_ids.map((id: string) =>
          supabase.from('draft_picks').update({ user_id: userId }).eq('id', id)
        ),
        ...trade.request_pick_ids.map((id: string) =>
          supabase.from('draft_picks').update({ user_id: trade.proposer_id }).eq('id', id)
        ),
        supabase.from('trades').update({ status: 'accepted' }).eq('id', tradeId),
      ]);
      const { data } = await supabase.from('draft_picks').select('*').eq('league_id', league.id).order('pick_number');
      setAllPicks(data || []);
    } else {
      await supabase.from('trades').update({ status }).eq('id', tradeId);
    }
    setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, status } : t));
  }

  const matchups = getWeekMatchups(draftOrder, week);
  const myPicks  = getMyPicks();
  const pendingIncoming = trades.filter(t => t.receiver_id === userId && t.status === 'pending');

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
      Loading league…
    </div>
  );

  /* ── Matchups view ── */
  if (view === 'matchups') return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>Matchups</div>
        <select
          value={week}
          onChange={e => setWeek(Number(e.target.value))}
          style={{ background: C.surf2, border: '1px solid ' + C.surf3, color: C.text, padding: '7px 14px', borderRadius: 7, fontFamily: 'Oswald,sans-serif', fontSize: 12, cursor: 'pointer', outline: 'none' }}
        >
          {Array.from({ length: 13 }, (_, i) => i + 1).map(w => (
            <option key={w} value={w}>Wk. {w}</option>
          ))}
        </select>
      </div>

      {matchups.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>
          Complete the draft first to see matchups.
        </div>
      ) : matchups.map(([teamA, teamB], i) => {
        const totA = assignRoster(getTeamPicks(teamA)).starters.reduce((s, p) => s + matchupProj(p?.player_data?.projectedPoints ?? 0, p?.player_data?.school, p?.player_data?.unitType, matchupCtx).pts, 0);
        const totB = assignRoster(getTeamPicks(teamB)).starters.reduce((s, p) => s + matchupProj(p?.player_data?.projectedPoints ?? 0, p?.player_data?.school, p?.player_data?.unitType, matchupCtx).pts, 0);
        const isMeA = teamA.userId === userId;
        const isMeB = teamB.userId === userId;
        return (
          <div key={i} style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 12, padding: '16px 20px', marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr 36px 1fr', alignItems: 'center', gap: 8 }}>
            {/* Team A */}
            <button onClick={() => { setSelectedTeam(teamA); setSelectedPlayer(null); setView('roster'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: isMeA ? 'linear-gradient(135deg,#d4a828,#f0c94a)' : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 15, color: isMeA ? C.bg : C.sub, flexShrink: 0 }}>
                  {(teamA.teamName || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: isMeA ? C.gold : C.text, fontWeight: 600 }}>{teamA.teamName}</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, lineHeight: 1.2 }}>{totA > 0 ? totA.toFixed(1) : '—'}</div>
                </div>
              </div>
            </button>
            <div style={{ textAlign: 'center', fontFamily: 'Anton,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted }}>VS</div>
            {/* Team B */}
            <button onClick={() => { setSelectedTeam(teamB); setSelectedPlayer(null); setView('roster'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'right', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: isMeB ? C.gold : C.text, fontWeight: 600 }}>{teamB.teamName}</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, lineHeight: 1.2, textAlign: 'right' }}>{totB > 0 ? totB.toFixed(1) : '—'}</div>
                </div>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: isMeB ? 'linear-gradient(135deg,#d4a828,#f0c94a)' : C.surf3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 15, color: isMeB ? C.bg : C.sub, flexShrink: 0 }}>
                  {(teamB.teamName || '?').charAt(0).toUpperCase()}
                </div>
              </div>
            </button>
          </div>
        );
      })}

      {/* Pending incoming trades */}
      {pendingIncoming.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 12 }}>
            Incoming Trades ({pendingIncoming.length})
          </div>
          {pendingIncoming.map(trade => {
            const fromTeam = draftOrder.find((t: any) => t.userId === trade.proposer_id);
            const offered  = allPicks.filter(p => trade.offer_pick_ids.includes(p.id));
            const requested= allPicks.filter(p => trade.request_pick_ids.includes(p.id));
            return (
              <div key={trade.id} style={{ background: C.surf, border: '1px solid rgba(212,168,40,.3)', borderRadius: 10, padding: '14px 18px', marginBottom: 10 }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.gold, marginBottom: 10 }}>
                  From {fromTeam?.teamName || 'Unknown'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>They offer</div>
                    {offered.map(p => (
                      <div key={p.id} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 2 }}>
                        {p.player_data?.playerName || p.player_data?.school}
                        <span style={{ color: C.muted, fontSize: 10 }}> · {p.player_data?.unitType}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>They want</div>
                    {requested.map(p => (
                      <div key={p.id} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 2 }}>
                        {p.player_data?.playerName || p.player_data?.school}
                        <span style={{ color: C.muted, fontSize: 10 }}> · {p.player_data?.unitType}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => respondTrade(trade.id, 'accepted')} style={{ flex: 1, padding: '8px', background: 'rgba(46,204,113,.12)', border: '1px solid rgba(46,204,113,.4)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: C.green }}>
                    Accept
                  </button>
                  <button onClick={() => respondTrade(trade.id, 'declined')} style={{ flex: 1, padding: '8px', background: 'rgba(231,76,60,.08)', border: '1px solid rgba(231,76,60,.25)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: C.red }}>
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  /* ── Roster view ── */
  if (view === 'roster' && selectedTeam) {
    const teamPicks  = getTeamPicks(selectedTeam);
    const roster     = assignRoster(teamPicks);
    const starterPts = roster.starters.reduce((s, p) => s + matchupProj(p?.player_data?.projectedPoints ?? 0, p?.player_data?.school, p?.player_data?.unitType, matchupCtx).pts, 0);
    const isMyTeam   = selectedTeam.userId === userId;
    const canTrade   = !isMyTeam && selectedTeam.type === 'human';

    return (
      <div style={{ maxWidth: 540 }}>
        <button onClick={() => { setSelectedTeam(null); setSelectedPlayer(null); setView('matchups'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, padding: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Matchups
        </button>

        <div style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 1, color: isMyTeam ? C.gold : C.text }}>{selectedTeam.teamName}</div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginTop: 2 }}>Proj. {starterPts.toFixed(1)} pts · starters only</div>
            {tradeMsg && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.green, marginTop: 4 }}>{tradeMsg}</div>}
          </div>
          {canTrade && (
            <button onClick={() => { setTradeOffer(new Set()); setTradeRequest(new Set()); setView('trade'); }} style={{ padding: '8px 16px', background: 'rgba(212,168,40,.12)', border: '1px solid rgba(212,168,40,.35)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: C.gold }}>
              Propose Trade
            </button>
          )}
        </div>

        {/* Player detail panel */}
        {selectedPlayer && (
          <div style={{ background: C.surf2, border: '1px solid ' + C.surf3, borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 1, color: C.text }}>{selectedPlayer.player_data?.playerName || selectedPlayer.player_data?.school}</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {selectedPlayer.player_data?.school} · {selectedPlayer.player_data?.conference} · {selectedPlayer.player_data?.unitType}
                </div>
                {selectedPlayer.player_data?.tier && (
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.gold, marginTop: 2 }}>{selectedPlayer.player_data.tier}</div>
                )}
              </div>
              <button onClick={() => setSelectedPlayer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, padding: '0 4px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Projected</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 24, color: C.gold }}>{matchupProj(selectedPlayer.player_data?.projectedPoints ?? 0, selectedPlayer.player_data?.school, selectedPlayer.player_data?.unitType, matchupCtx).pts.toFixed(1)}</div>
              </div>
              {selectedPlayer.player_data?.adp != null && (
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>ADP</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 24, color: C.text }}>{selectedPlayer.player_data.adp}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Starters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, height: 1, background: C.surf3 }} />
          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Starters</span>
          <div style={{ flex: 1, height: 1, background: C.surf3 }} />
        </div>
        {STARTER_SLOT_LABELS.map((label, i) => {
          const pick = roster.starters[i];
          const color = POS_COLORS[label] || C.muted;
          const isSel = selectedPlayer?.id === pick?.id;
          return (
            <div key={i} onClick={() => pick && setSelectedPlayer(isSel ? null : pick)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 4, background: isSel ? C.surf3 : C.surf2, border: '1px solid ' + (isSel ? C.gold : C.surf3), borderRadius: 8, cursor: pick ? 'pointer' : 'default', transition: 'all .12s' }}>
              <div style={{ width: 34, flexShrink: 0, textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 1, color, background: color + '22', border: '1px solid ' + color + '44', borderRadius: 4, padding: '3px 0' }}>{label}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pick ? (
                  <>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.player_data?.playerName || pick.player_data?.school}</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>{pick.player_data?.school}</div>
                  </>
                ) : <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>Empty</span>}
              </div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: pick ? C.gold : C.surf3, flexShrink: 0 }}>{pick ? matchupProj(pick.player_data?.projectedPoints ?? 0, pick.player_data?.school, pick.player_data?.unitType, matchupCtx).pts.toFixed(1) : '—'}</div>
            </div>
          );
        })}

        {/* Bench */}
        {roster.bench.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 8 }}>
              <div style={{ flex: 1, height: 1, background: C.surf3 }} />
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Bench</span>
              <div style={{ flex: 1, height: 1, background: C.surf3 }} />
            </div>
            {roster.bench.map((pick: any) => {
              const pos = pick.player_data?.unitType as string;
              const col = POS_COLORS[pos] || C.muted;
              const isSel = selectedPlayer?.id === pick.id;
              return (
                <div key={pick.id} onClick={() => setSelectedPlayer(isSel ? null : pick)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 4, background: isSel ? C.surf3 : C.surf, border: '1px solid ' + (isSel ? C.gold : C.surf3), borderRadius: 8, cursor: 'pointer', transition: 'all .12s' }}>
                  <div style={{ width: 34, flexShrink: 0, textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.muted, background: C.muted + '22', border: '1px solid ' + C.muted + '44', borderRadius: 4, padding: '3px 0' }}>BN</div>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.player_data?.playerName || pick.player_data?.school}</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>{pick.player_data?.school}</div>
                  </div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: C.sub, flexShrink: 0 }}>{matchupProj(pick.player_data?.projectedPoints ?? 0, pick.player_data?.school, pick.player_data?.unitType, matchupCtx).pts.toFixed(1)}</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  /* ── Trade view ── */
  if (view === 'trade' && selectedTeam) {
    const theirPicks = getTeamPicks(selectedTeam).sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));
    const sortedMyPicks = myPicks.sort((a: any, b: any) => (b.player_data?.projectedPoints ?? 0) - (a.player_data?.projectedPoints ?? 0));

    return (
      <div style={{ maxWidth: 680 }}>
        <button onClick={() => { setView('roster'); setTradeOffer(new Set()); setTradeRequest(new Set()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, padding: '0 0 16px 0' }}>
          ← {selectedTeam.teamName}
        </button>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 4 }}>Propose Trade</div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginBottom: 18 }}>
          {myEntry?.teamName || 'You'} → {selectedTeam.teamName}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>You offer ({tradeOffer.size})</div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {sortedMyPicks.map((pick: any) => (
                <PickCheckbox key={pick.id} pick={pick} checked={tradeOffer.has(pick.id)} accent={C.gold}
                  onToggle={() => setTradeOffer(prev => { const n = new Set(prev); n.has(pick.id) ? n.delete(pick.id) : n.add(pick.id); return n; })} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.green, textTransform: 'uppercase', marginBottom: 8 }}>You receive ({tradeRequest.size})</div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {theirPicks.map((pick: any) => (
                <PickCheckbox key={pick.id} pick={pick} checked={tradeRequest.has(pick.id)} accent={C.green}
                  onToggle={() => setTradeRequest(prev => { const n = new Set(prev); n.has(pick.id) ? n.delete(pick.id) : n.add(pick.id); return n; })} />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={proposeTrade}
          disabled={tradeOffer.size === 0 || tradeRequest.size === 0 || submitting}
          style={{ width: '100%', padding: '13px', background: (tradeOffer.size > 0 && tradeRequest.size > 0) ? C.gold : C.surf3, border: 'none', borderRadius: 9, cursor: (tradeOffer.size > 0 && tradeRequest.size > 0) ? 'pointer' : 'default', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: (tradeOffer.size > 0 && tradeRequest.size > 0) ? C.bg : C.muted, textTransform: 'uppercase', transition: 'all .15s' }}
        >
          {submitting ? 'Sending…' : 'Propose Trade'}
        </button>
      </div>
    );
  }

  return null;
}

/* ── League Settings Modal ───────────────────────────────────── */
const SETTINGS_NAV: { key: SettingsSection; label: string; commOnly: boolean }[] = [
  { key: 'league', label: 'League Settings', commOnly: true  },
  { key: 'team',   label: 'Team Settings',   commOnly: false },
  { key: 'roster', label: 'Roster Settings', commOnly: true  },
  { key: 'draft',  label: 'Draft Settings',  commOnly: true  },
  { key: 'danger', label: 'Delete League',   commOnly: true  },
];

function LeagueSettingsModal({ league, myMember, isCommissioner, userId, onClose, onUpdate }: {
  league: any; myMember: any; isCommissioner: boolean;
  userId: string | null; onClose: () => void; onUpdate: () => void;
}) {
  const router = useRouter();
  const [section,       setSection]       = useState<SettingsSection>(isCommissioner ? 'league' : 'team');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting,      setDeleting]      = useState(false);

  // League Settings fields
  const [leagueName, setLeagueName] = useState<string>(league?.name || '');
  const [leagueSize, setLeagueSize] = useState<number>(league?.league_size || 8);

  // Team Settings fields
  const [teamName, setTeamName] = useState<string>(myMember?.team_name || '');

  const canEdit = (commOnly: boolean) => commOnly ? isCommissioner : true;

  async function deleteLeague() {
    if (deleteConfirm !== league?.name) return;
    setDeleting(true);
    await supabase.from('leagues').delete().eq('id', league.id);
    router.push('/');
  }

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
                    width: '100%', textAlign: 'left',
                    background: active ? (item.key === 'danger' ? 'rgba(231,76,60,0.08)' : 'rgba(212,168,40,0.08)') : 'none',
                    border: 'none', borderLeft: active ? ('3px solid ' + (item.key === 'danger' ? C.red : C.gold)) : '3px solid transparent',
                    padding: '11px 18px', cursor: locked ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span style={{
                    fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: .5,
                    color: locked ? C.surf3 : (item.key === 'danger' ? (active ? C.red : 'rgba(231,76,60,0.7)') : (active ? C.gold : C.sub)),
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
              {section === 'danger' && 'Danger zone — this action cannot be undone'}
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

            {/* ── Danger Zone ── */}
            {section === 'danger' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 10, padding: '16px 20px' }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.red, letterSpacing: 1, marginBottom: 8 }}>DELETE THIS LEAGUE</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                    This will permanently delete <strong style={{ color: C.text }}>{league?.name}</strong>, all members, picks, and scores. This cannot be undone.
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Type the league name to confirm</label>
                  <input
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder={league?.name}
                    style={{ ...inputStyle }}
                  />
                </div>
                <button
                  onClick={deleteLeague}
                  disabled={deleteConfirm !== league?.name || deleting}
                  style={{
                    padding: '12px 24px', borderRadius: 8, cursor: deleteConfirm === league?.name ? 'pointer' : 'not-allowed',
                    background: deleteConfirm === league?.name ? C.red : 'rgba(231,76,60,0.15)',
                    border: '1px solid ' + (deleteConfirm === league?.name ? C.red : 'rgba(231,76,60,0.3)'),
                    color: deleteConfirm === league?.name ? '#fff' : 'rgba(231,76,60,0.5)',
                    fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase',
                    transition: 'all .2s',
                  }}
                >
                  {deleting ? 'Deleting…' : 'Delete League Forever'}
                </button>
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
