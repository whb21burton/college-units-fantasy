'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { FULL_POOL } from '@/lib/playerPool';

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#111d30', surf3: '#1a2b40',
  gold: '#f5a623', goldLight: '#f0c94a',
  text: '#e4edf7', sub: '#7a92aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a',
};

const POS_COLORS: Record<string, string> = {
  QB: '#e84545', RB: '#2d7fe0', WR: '#d4a020', TE: '#9b56e0', DEF: '#0db874', K: '#f07820',
};

const WEEKLY_SLOTS = [
  { key: 'QB1', unitType: 'QB',  label: 'QB'   },
  { key: 'RB1', unitType: 'RB',  label: 'RB 1' },
  { key: 'RB2', unitType: 'RB',  label: 'RB 2' },
  { key: 'WR1', unitType: 'WR',  label: 'WR 1' },
  { key: 'WR2', unitType: 'WR',  label: 'WR 2' },
  { key: 'TE1', unitType: 'TE',  label: 'TE'   },
  { key: 'DEF', unitType: 'DEF', label: 'DEF'  },
  { key: 'K',   unitType: 'K',   label: 'K'    },
];

const SEASON_GAMES = 14;
function liveProj(unit: any): number {
  if ((unit?.avgFpts ?? 0) > 0) return unit.avgFpts;
  if ((unit?.avgPerWeek ?? 0) > 0) return unit.avgPerWeek;
  return (unit?.projectedPoints ?? 0) / SEASON_GAMES;
}

// Schools per unitType sorted by projected points descending
function schoolOptions(unitType: string) {
  return FULL_POOL
    .filter(p => p.unitType === unitType)
    .sort((a, b) => b.projectedPoints - a.projectedPoints)
    .map(p => ({ school: p.school, conf: p.conference, weeklyProj: liveProj(p) }));
}

type WeeklyPick = { user_id: string; picks: Record<string, string>; total_points: number | null };
type Member    = { user_id: string; team_name: string };

export function WeeklyLeaguePage({ leagueId }: { leagueId: string }) {
  const router = useRouter();

  const [league,    setLeague]    = useState<any>(null);
  const [userId,    setUserId]    = useState<string | null>(null);
  const [members,   setMembers]   = useState<Member[]>([]);
  const [allPicks,  setAllPicks]  = useState<WeeklyPick[]>([]);
  const [myPicks,   setMyPicks]   = useState<Record<string, string>>({});
  const [saving,    setSaving]    = useState(false);
  const [scoring,   setScoring]   = useState(false);
  const [activating,setActivating]= useState(false);
  const [completing,setCompleting]= useState(false);
  const [saveMsg,   setSaveMsg]   = useState<string | null>(null);
  const [search,    setSearch]    = useState<Record<string, string>>({});
  const [openSlot,  setOpenSlot]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);

    const { data: lg } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', leagueId)
      .single();
    setLeague(lg);

    if (!lg) { setLoading(false); return; }

    const [membersRes, picksRes] = await Promise.all([
      supabase.from('league_members').select('user_id, team_name').eq('league_id', leagueId),
      fetch(`/api/weekly-picks?league_id=${leagueId}`).then(r => r.json()).catch(() => ({})),
    ]);

    setMembers(membersRes.data ?? []);
    setAllPicks(picksRes.picks ?? []);

    if (user) {
      const mine = (picksRes.picks ?? []).find((p: WeeklyPick) => p.user_id === user.id);
      if (mine) setMyPicks(mine.picks ?? {});
    }

    setLoading(false);
  }, [leagueId]);

  useEffect(() => { load(); }, [load]);

  const isCommissioner = league?.commissioner_id === userId;
  const isFull = members.length >= (league?.league_size ?? 0);

  // ── Save my picks ──────────────────────────────────────────
  async function savePicks() {
    const filledSlots = WEEKLY_SLOTS.filter(s => myPicks[s.key]).length;
    if (filledSlots < WEEKLY_SLOTS.length) {
      setSaveMsg(`Fill all ${WEEKLY_SLOTS.length} slots before saving.`); return;
    }
    setSaving(true); setSaveMsg(null);
    const res = await fetch('/api/weekly-picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ league_id: leagueId, picks: myPicks }),
    });
    const data = await res.json();
    setSaving(false);
    setSaveMsg(res.ok ? '✓ Lineup saved!' : (data.error ?? 'Save failed'));
    if (res.ok) load();
  }

  // ── Commissioner: open picks ───────────────────────────────
  async function openPicks() {
    setActivating(true);
    await supabase.from('leagues').update({ status: 'active' }).eq('id', leagueId);
    setActivating(false);
    load();
  }

  // ── Commissioner: score week ───────────────────────────────
  async function scoreWeek() {
    setScoring(true);
    const res = await fetch('/api/weekly-picks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ league_id: leagueId }),
    });
    setScoring(false);
    load();
  }

  // ── Commissioner: mark complete ────────────────────────────
  async function markComplete() {
    setCompleting(true);
    await supabase.from('leagues').update({ status: 'complete' }).eq('id', leagueId);
    setCompleting(false);
    load();
  }

  // ── Projected total for my current picks ──────────────────
  const myProjTotal = WEEKLY_SLOTS.reduce((sum, slot) => {
    const school = myPicks[slot.key];
    if (!school) return sum;
    const unit = FULL_POOL.find(p => p.school === school && p.unitType === slot.unitType);
    return sum + (unit ? liveProj(unit) : 0);
  }, 0);

  // ── Leaderboard rows ──────────────────────────────────────
  const leaderboard = members
    .map(m => {
      const pick = allPicks.find(p => p.user_id === m.user_id);
      return {
        ...m,
        picks: pick?.picks ?? null,
        total_points: pick?.total_points ?? null,
        hasSubmitted: !!pick,
      };
    })
    .sort((a, b) => (b.total_points ?? -Infinity) - (a.total_points ?? -Infinity));

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 3 }}>Loading…</div>
    </div>
  );

  if (!league) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.red, fontFamily: 'Oswald,sans-serif' }}>League not found.</div>
    </div>
  );

  const spotsLeft = league.league_size - members.length;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1, marginBottom: 16, padding: 0 }}
          >← HOME</button>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ background: 'rgba(245,166,35,.15)', border: '1px solid rgba(245,166,35,.4)', borderRadius: 6, padding: '3px 10px', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.gold }}>
                  ⚡ WEEKLY PICK'EM
                </span>
                {league.week && (
                  <span style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '3px 10px', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.sub }}>
                    WEEK {league.week}
                  </span>
                )}
                <span style={{
                  padding: '3px 10px', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2,
                  background: league.status === 'forming' ? 'rgba(122,146,170,.15)' : league.status === 'active' ? 'rgba(21,198,120,.15)' : 'rgba(245,166,35,.15)',
                  color: league.status === 'forming' ? C.sub : league.status === 'active' ? C.green : C.gold,
                  border: `1px solid ${league.status === 'forming' ? C.surf3 : league.status === 'active' ? 'rgba(21,198,120,.4)' : 'rgba(245,166,35,.4)'}`,
                }}>
                  {league.status === 'forming' ? 'FORMING' : league.status === 'active' ? 'PICKS OPEN' : 'COMPLETE'}
                </span>
              </div>
              <h1 style={{ fontFamily: 'Anton,sans-serif', fontSize: 30, letterSpacing: 1, textTransform: 'uppercase', margin: 0 }}>{league.name}</h1>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, marginTop: 4 }}>
                {members.length} / {league.league_size} teams
                {league.buy_in > 0 && ` · $${league.buy_in} buy-in · $${league.buy_in * league.league_size} pot`}
              </div>
            </div>
            {league.buy_in > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 2 }}>PRIZE POOL</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, color: C.gold }}>${league.buy_in * league.league_size}</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>80% · 20% split</div>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            FORMING — waiting for members
        ══════════════════════════════════════════════ */}
        {league.status === 'forming' && (
          <>
            {/* Invite banner */}
            <div style={{ padding: '16px 20px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, marginBottom: 20 }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8 }}>INVITE LINK</div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 4, color: C.gold, marginBottom: 8 }}>
                {league.invite_code}
              </div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
                Share this code or link: {process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.com'}/join/{league.invite_code}
              </div>
            </div>

            {/* Member list */}
            <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.surf3}`, fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted }}>
                MEMBERS ({members.length} / {league.league_size})
              </div>
              {members.map((m, i) => (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i < members.length - 1 ? `1px solid ${C.surf3}` : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(245,166,35,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.gold }}>{i + 1}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 14, color: C.text }}>{m.team_name}</div>
                  {m.user_id === league.commissioner_id && (
                    <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.gold, background: 'rgba(245,166,35,.1)', padding: '2px 7px', borderRadius: 3 }}>COMM</span>
                  )}
                </div>
              ))}
              {Array.from({ length: spotsLeft }).map((_, i) => (
                <div key={'empty-' + i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i < spotsLeft - 1 ? `1px solid ${C.surf3}` : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px dashed ${C.surf3}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>{members.length + i + 1}</div>
                  <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted, fontStyle: 'italic' }}>Open spot…</span>
                </div>
              ))}
            </div>

            {isCommissioner && (
              <button
                onClick={openPicks}
                disabled={activating}
                style={{ width: '100%', padding: 16, background: isFull ? `linear-gradient(135deg,${C.gold},${C.goldLight})` : C.surf2, border: isFull ? 'none' : `1px solid ${C.surf3}`, borderRadius: 10, cursor: isFull || activating ? (activating ? 'wait' : 'pointer') : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 15, letterSpacing: 2, textTransform: 'uppercase', color: isFull ? C.bg : C.muted }}
              >
                {activating ? 'Opening…' : isFull ? '⚡ Open Picks for Week ' + (league.week ?? '') : `Fill ${spotsLeft} more spot${spotsLeft !== 1 ? 's' : ''} to open picks`}
              </button>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════
            ACTIVE — set your lineup
        ══════════════════════════════════════════════ */}
        {league.status === 'active' && (
          <>
            {/* My Lineup Builder */}
            {userId && members.some(m => m.user_id === userId) && (
              <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.surf3}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted }}>MY LINEUP — WEEK {league.week}</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.gold }}>
                    ~{myProjTotal.toFixed(1)} proj pts
                  </div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {WEEKLY_SLOTS.map(slot => {
                      const selected = myPicks[slot.key];
                      const unit = selected ? FULL_POOL.find(p => p.school === selected && p.unitType === slot.unitType) : null;
                      const options = schoolOptions(slot.unitType).filter(o =>
                        !search[slot.key] || o.school.toLowerCase().includes(search[slot.key].toLowerCase())
                      );
                      const isOpen = openSlot === slot.key;

                      // Prevent picking same school twice in same unitType
                      const usedInType = WEEKLY_SLOTS
                        .filter(s => s.unitType === slot.unitType && s.key !== slot.key)
                        .map(s => myPicks[s.key])
                        .filter(Boolean);

                      return (
                        <div key={slot.key} style={{ position: 'relative' }}>
                          <button
                            onClick={() => { setOpenSlot(isOpen ? null : slot.key); setSearch(s => ({ ...s, [slot.key]: '' })); }}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: selected ? C.surf2 : C.bg, border: `1px solid ${isOpen ? C.gold : selected ? C.surf3 + '99' : C.surf3}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}
                          >
                            <span style={{ flexShrink: 0, width: 28, height: 20, background: POS_COLORS[slot.unitType], borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 9, letterSpacing: .5, color: '#fff' }}>
                              {slot.label}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {selected ? (
                                <>
                                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected}</div>
                                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>{unit ? `~${liveProj(unit).toFixed(1)} pts` : ''}</div>
                                </>
                              ) : (
                                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>Pick a school…</div>
                              )}
                            </div>
                            <span style={{ color: C.muted, fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                          </button>

                          {/* Dropdown */}
                          {isOpen && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: C.surf2, border: `1px solid ${C.gold}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.5)', maxHeight: 220, overflow: 'hidden', marginTop: 2 }}>
                              <input
                                autoFocus
                                placeholder="Search school…"
                                value={search[slot.key] ?? ''}
                                onChange={e => setSearch(s => ({ ...s, [slot.key]: e.target.value }))}
                                style={{ width: '100%', padding: '8px 12px', background: C.bg, border: 'none', borderBottom: `1px solid ${C.surf3}`, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                              />
                              <div style={{ overflowY: 'auto', maxHeight: 172 }}>
                                {options.map(opt => {
                                  const isUsed = usedInType.includes(opt.school);
                                  return (
                                    <button
                                      key={opt.school}
                                      disabled={isUsed}
                                      onClick={() => { setMyPicks(p => ({ ...p, [slot.key]: opt.school })); setOpenSlot(null); }}
                                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'none', border: 'none', cursor: isUsed ? 'not-allowed' : 'pointer', opacity: isUsed ? 0.4 : 1, borderBottom: `1px solid ${C.surf3}22` }}
                                    >
                                      <div style={{ textAlign: 'left' }}>
                                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text }}>{opt.school}</div>
                                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>{opt.conf}</div>
                                      </div>
                                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.gold }}>~{opt.weeklyProj.toFixed(1)}</div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {saveMsg && (
                    <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: saveMsg.startsWith('✓') ? 'rgba(21,198,120,.1)' : 'rgba(240,58,90,.1)', border: `1px solid ${saveMsg.startsWith('✓') ? 'rgba(21,198,120,.3)' : 'rgba(240,58,90,.3)'}`, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: saveMsg.startsWith('✓') ? C.green : C.red }}>
                      {saveMsg}
                    </div>
                  )}
                  <button
                    onClick={savePicks}
                    disabled={saving}
                    style={{ width: '100%', padding: '13px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 8, cursor: saving ? 'wait' : 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: C.bg, opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? 'Saving…' : '💾 Lock In My Lineup'}
                  </button>
                </div>
              </div>
            )}

            {/* Who's submitted picks */}
            <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.surf3}`, fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted }}>PICK STATUS</div>
              {leaderboard.map((m, i) => (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: i < leaderboard.length - 1 ? `1px solid ${C.surf3}` : 'none' }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text, flex: 1 }}>{m.team_name}</div>
                  <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, padding: '3px 10px', borderRadius: 20, background: m.hasSubmitted ? 'rgba(21,198,120,.12)' : 'rgba(240,58,90,.08)', color: m.hasSubmitted ? C.green : C.red, border: `1px solid ${m.hasSubmitted ? 'rgba(21,198,120,.3)' : 'rgba(240,58,90,.2)'}` }}>
                    {m.hasSubmitted ? '✓ Picks In' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>

            {/* Commissioner controls */}
            {isCommissioner && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                <button
                  onClick={scoreWeek}
                  disabled={scoring}
                  style={{ padding: '13px', background: 'rgba(21,198,120,.12)', border: '1px solid rgba(21,198,120,.3)', borderRadius: 8, cursor: scoring ? 'wait' : 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: C.green }}
                >
                  {scoring ? 'Calculating…' : '📊 Calculate Scores'}
                </button>
                <button
                  onClick={markComplete}
                  disabled={completing}
                  style={{ padding: '13px', background: 'rgba(245,166,35,.1)', border: '1px solid rgba(245,166,35,.3)', borderRadius: 8, cursor: completing ? 'wait' : 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: C.gold }}
                >
                  {completing ? 'Finalizing…' : '🏁 Finalize Week'}
                </button>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════
            LEADERBOARD (active + complete)
        ══════════════════════════════════════════════ */}
        {(league.status === 'active' || league.status === 'complete') && leaderboard.some(m => m.hasSubmitted) && (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.surf3}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted }}>LEADERBOARD</div>
              {league.status === 'complete' && (
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.gold, letterSpacing: 1 }}>FINAL</div>
              )}
            </div>

            {leaderboard.map((m, rank) => {
              const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : null;
              const prizeLabel = league.buy_in > 0
                ? rank === 0 ? `$${Math.floor(league.buy_in * league.league_size * 0.8)}`
                : rank === 1 ? `$${Math.ceil(league.buy_in * league.league_size * 0.2)}`
                : null : null;

              return (
                <div key={m.user_id} style={{ borderBottom: rank < leaderboard.length - 1 ? `1px solid ${C.surf3}` : 'none' }}>
                  {/* Summary row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px' }}>
                    <div style={{ width: 24, fontFamily: 'Anton,sans-serif', fontSize: 13, color: rank < 2 ? C.gold : C.muted, textAlign: 'center' }}>
                      {medal ?? `#${rank + 1}`}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text }}>{m.team_name}</div>
                      {prizeLabel && league.status === 'complete' && (
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.gold }}>{prizeLabel} prize</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {m.total_points != null ? (
                        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: rank === 0 ? C.gold : C.text }}>
                          {m.total_points.toFixed(1)}
                        </div>
                      ) : m.hasSubmitted ? (
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted }}>Pending score</div>
                      ) : (
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.red }}>No picks</div>
                      )}
                    </div>
                  </div>

                  {/* Pick breakdown — visible to all after picks lock / after complete */}
                  {m.picks && (league.status === 'complete' || m.user_id === userId) && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, padding: '0 20px 12px' }}>
                      {WEEKLY_SLOTS.map(slot => {
                        const school = m.picks![slot.key] ?? '—';
                        return (
                          <div key={slot.key} style={{ padding: '6px 8px', background: C.surf2, borderRadius: 6 }}>
                            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1, color: POS_COLORS[slot.unitType], marginBottom: 2 }}>{slot.label}</div>
                            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: school === '—' ? C.muted : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{school}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Payout button for commissioner on complete leagues */}
        {league.status === 'complete' && isCommissioner && league.buy_in > 0 && (
          <div style={{ padding: '16px 20px', background: 'rgba(245,166,35,.06)', border: '1px solid rgba(245,166,35,.2)', borderRadius: 12 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, marginBottom: 12 }}>
              Winners are finalized. Trigger Stripe payout when ready.
            </div>
            <button
              onClick={() => router.push(`/league/${leagueId}/payout`)}
              style={{ padding: '12px 24px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.bg }}
            >
              💸 Issue Payouts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
