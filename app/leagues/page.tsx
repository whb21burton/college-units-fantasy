'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

const C = {
  bg:      '#05080f',
  surf:    '#0c1220',
  surf2:   '#0a101c',
  surf3:   '#1e2d47',
  gold:    '#d4a828',
  goldLt:  '#f0c94a',
  text:    '#e8edf5',
  sub:     '#7a90b0',
  muted:   '#4a5d7a',
  green:   '#2ecc71',
  orange:  '#f39c12',
  red:     '#e74c3c',
  rowA:    '#0c1220',
  rowB:    '#0a101c',
  hover:   '#131d30',
  hdrBg:   '#1e2d47',
  hdrText: '#7a90b0',
};

type League = {
  id: string;
  name: string;
  buy_in: number;
  league_size: number;
  draft_type: string;
  league_type: string;
  week: number | null;
  status: string;
  invite_code: string;
  conference_filter: string;
  commissioner_id: string;
  created_at: string;
  draft_start_time: string | null;
  member_count: number;
  is_capped: boolean | null;
  is_featured: boolean | null;
  max_entries_per_user: number | null;
  settings: { allowed_schools?: string[] } | null;
};

// Detect copy suffix e.g. "My League 03" → "03"
function getCopyBadge(name: string): string | null {
  const m = name.match(/ (\d{2})$/);
  return m ? m[1] : null;
}

type Member = {
  user_id: string;
  team_name: string;
  display_name: string;
};

const STYLE_OPTIONS = [
  { value: 'All D1',      label: 'All D1'      },
  { value: 'SEC',         label: 'SEC'         },
  { value: 'Big Ten',     label: 'Big Ten'     },
  { value: 'ACC',         label: 'ACC'         },
  { value: 'Big 12',      label: 'Big 12'      },
  { value: 'Pac-12',      label: 'Pac-12'      },
  { value: 'Independent', label: 'Independent' },
] as const;

const TYPE_OPTIONS = [
  { value: 'all',    label: 'All'        },
  { value: 'capped', label: '🧢 Capped' },
  { value: 'nocap',  label: '∞ No Cap'  },
  { value: '1v1',    label: '1v1'       },
] as const;

function formatStartTime(league: League): string {
  const ref = league.draft_start_time ?? league.created_at;
  if (!ref) return '—';
  const d = new Date(ref);
  const now = Date.now();
  const diff = d.getTime() - now;
  if (diff > 0 && diff < 2 * 60 * 60 * 1000) {
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  const mo = d.getMonth() + 1;
  const dy = d.getDate();
  const hr = d.getHours();
  const mn = d.getMinutes();
  const ampm = hr < 12 ? 'a' : 'p';
  const h12 = (hr % 12) || 12;
  return `${mo}/${dy} ${h12}:${String(mn).padStart(2,'0')}${ampm}`;
}

function formatHeaderTime(league: League): { countdown: string; date: string } {
  const ref = league.draft_start_time ?? league.created_at;
  if (!ref) return { countdown: '—', date: '' };
  const d = new Date(ref);
  const now = Date.now();
  const diff = d.getTime() - now;
  let countdown = '';
  if (diff > 0 && diff < 2 * 60 * 60 * 1000) {
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    countdown = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  const mo = String(d.getMonth() + 1).padStart(2,'0');
  const dy = String(d.getDate()).padStart(2,'0');
  const hr = d.getHours();
  const mn = String(d.getMinutes()).padStart(2,'0');
  const ampm = hr < 12 ? 'AM' : 'PM';
  const h12 = (hr % 12) || 12;
  const dateStr = `${mo}/${dy} ${h12}:${mn} ${ampm} EST`;
  return { countdown: countdown || dateStr, date: countdown ? dateStr : '' };
}

function styleLabel(cf: string): string {
  if (!cf || cf === 'ALL' || cf === 'All D1' || cf === 'All D1 Schools') return 'All D1';
  if (cf === 'SEC')         return 'SEC';
  if (cf === 'Big Ten')     return 'Big Ten';
  if (cf === 'ACC')         return 'ACC';
  if (cf === 'Big 12')      return 'Big 12';
  if (cf === 'Pac-12')      return 'Pac-12';
  if (cf === 'Independent') return 'Independent';
  if (cf === 'CUSTOM')      return 'Custom';
  return 'All D1';
}

function isFeatured(l: League): boolean {
  return l.is_featured === true;
}

function isGPP(l: League): boolean {
  return l.member_count >= l.league_size;
}

function totalPrize(l: League): number {
  if (l.league_type === 'weekly') {
    return (l.buy_in ?? 0) * (l.member_count ?? 0) * 0.95;
  }
  return (l.buy_in ?? 0) * (l.league_size ?? 0);
}

function payouts(l: League): { place: string; amount: number; pct: number }[] {
  const pool = totalPrize(l);
  if (pool <= 0) return [];
  if (l.league_size <= 4) {
    return [
      { place: '1st', amount: pool * 0.7, pct: 70 },
      { place: '2nd', amount: pool * 0.3, pct: 30 },
    ];
  }
  if (l.league_size <= 10) {
    return [
      { place: '1st', amount: pool * 0.8, pct: 80 },
      { place: '2nd', amount: pool * 0.2, pct: 20 },
    ];
  }
  return [
    { place: '1st', amount: pool * 0.6,  pct: 60  },
    { place: '2nd', amount: pool * 0.25, pct: 25  },
    { place: '3rd', amount: pool * 0.15, pct: 15  },
  ];
}

function autoSummary(l: League, members: Member[]): string {
  const cf = styleLabel(l.conference_filter ?? '');
  const confStr = cf === 'All D1' ? 'All D1' : `${cf} Only`;
  const type = l.league_type === 'weekly' ? 'weekly DFS' : 'season';
  const size = l.league_type === 'weekly' ? (l.member_count ?? members.length) : l.league_size;
  const prize = totalPrize(l);
  const po = payouts(l);
  const feeStr = l.buy_in === 0 ? 'free to enter' : `$${l.buy_in.toFixed(2)} entry fee`;
  let summary = `This ${size}-team ${confStr} ${type} league`;
  if (prize > 0) {
    summary += ` features $${prize.toFixed(2)} in total prizes.`;
    if (po.length >= 2) {
      summary += ` 1st place wins $${po[0].amount.toFixed(2)}, 2nd place wins $${po[1].amount.toFixed(2)}.`;
    }
  } else {
    summary += ' is free to play with no prize pool.';
  }
  summary += ` It is ${feeStr}`;
  if (l.buy_in > 0) summary += ` with a 10% hosting fee`;
  summary += '.';
  return summary;
}

// ── Scoring rules data ────────────────────────────────────────────────────────
const SCORING_RULES = [
  {
    pos: 'QB',
    color: '#e05c2a',
    rules: [
      { stat: 'Passing TD',     pts: '+4' },
      { stat: 'Passing Yards',  pts: '+0.1/yd' },
      { stat: 'Rushing TD',     pts: '+6' },
      { stat: 'Interception',   pts: '−2' },
      { stat: 'Fumble Lost',    pts: '−2' },
    ],
  },
  {
    pos: 'RB / WR / TE Unit',
    color: '#3a86ff',
    rules: [
      { stat: 'Rushing Yards',   pts: '+0.1/yd' },
      { stat: 'Receiving Yards', pts: '+0.1/yd' },
      { stat: 'Reception',       pts: '+1' },
      { stat: 'Any TD',          pts: '+6' },
      { stat: 'Fumble Lost',     pts: '−2' },
    ],
  },
  {
    pos: 'Kicker',
    color: '#e9c46a',
    rules: [
      { stat: 'FG 50+ yards',  pts: '+5' },
      { stat: 'FG 40-49 yds',  pts: '+4' },
      { stat: 'FG 0-39 yds',   pts: '+3' },
      { stat: 'PAT Made',      pts: '+1' },
      { stat: 'PAT Missed',    pts: '−2' },
      { stat: 'FG Missed',     pts: '−1' },
    ],
  },
  {
    pos: 'Defense',
    color: '#2b9348',
    rules: [
      { stat: 'Sack',             pts: '+1' },
      { stat: 'Interception',     pts: '+2' },
      { stat: 'Fumble Recovery',  pts: '+2' },
      { stat: 'Defensive TD',     pts: '+6' },
      { stat: 'Safety',           pts: '+2' },
      { stat: 'Shutout',          pts: '+10' },
    ],
  },
];

// ── ContestDetailModal ────────────────────────────────────────────────────────
function ContestDetailModal({
  league, user, walletBal, tick,
  onClose, onEnter,
}: {
  league: League;
  user: any;
  walletBal: number;
  tick: number;
  onClose: () => void;
  onEnter: (l: League) => void;
}) {
  const [tab,           setTab]           = useState<'details' | 'rules'>('details');
  const [members,       setMembers]       = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [memberSearch,  setMemberSearch]  = useState('');

  useEffect(() => {
    setLoadingMembers(true);
    supabase
      .from('league_members')
      .select('user_id, team_name')
      .eq('league_id', league.id)
      .then(async ({ data: rows }) => {
        if (!rows || rows.length === 0) { setMembers([]); setLoadingMembers(false); return; }
        const ids = rows.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', ids);
        const pMap: Record<string, string> = {};
        (profiles ?? []).forEach(p => { pMap[p.id] = p.display_name ?? ''; });
        setMembers(rows.map(r => ({
          user_id: r.user_id,
          team_name: r.team_name ?? '',
          display_name: pMap[r.user_id] || r.team_name || r.user_id.slice(0,8),
        })));
        setLoadingMembers(false);
      });
  }, [league.id]);

  const prize = totalPrize(league);
  const po    = payouts(league);
  const isFull = league.member_count >= league.league_size;
  const { countdown, date: dateStr } = formatHeaderTime(league);
  // tick unused but forces re-render for countdown
  void tick;

  const filteredMembers = members.filter(m =>
    !memberSearch || m.display_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.team_name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  // Build empty slots
  const emptyCount = Math.max(0, league.league_size - members.length);
  const allSlots: (Member | null)[] = [...members, ...Array(emptyCount).fill(null)];
  const displaySlots = memberSearch ? filteredMembers : allSlots;

  const enterLabel = league.buy_in === 0
    ? 'ENTER FREE'
    : `ENTER $${league.buy_in.toFixed(2)}`;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: C.surf, border: '1px solid ' + C.surf3, borderRadius: 8, width: '100%', maxWidth: 900, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── HEADER ───────────────────────────────────────────────── */}
        <div style={{ background: C.bg, padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>

            {/* Left: badge + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              {/* League icon badge */}
              <div style={{
                width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                background: league.league_type === 'weekly'
                  ? 'linear-gradient(135deg,#f5a623,#d4a828)'
                  : 'linear-gradient(135deg,#3a86ff,#1e4dc0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>
                {league.league_type === 'weekly' ? '⚡' : '🏆'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 4 }}>
                  {league.name}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={tagStyle(league.league_type === 'weekly' ? 'rgba(245,166,35,.15)' : 'rgba(58,134,255,.12)', league.league_type === 'weekly' ? '#f5a623' : '#3a86ff')}>
                    {league.league_type === 'weekly' ? '⚡ Weekly DFS' : '🏆 Season League'}
                    {league.week ? ` · Wk ${league.week}` : ''}
                  </span>
                  <span style={tagStyle('rgba(212,168,40,.1)', C.gold)}>
                    {styleLabel(league.conference_filter)}
                  </span>
                  {isFeatured(league) && (
                    <span style={tagStyle('rgba(212,168,40,.12)', C.gold)}>⭐ Featured</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: countdown + close */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 2 }}>
                  {countdown.includes(':') ? 'LIVE IN' : 'STARTS'}
                </div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, color: C.gold, letterSpacing: 1 }}>
                  {countdown}
                </div>
                {dateStr && (
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.sub, letterSpacing: 0.5 }}>
                    {dateStr}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 0', transition: 'color .12s' }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 0, borderTop: '1px solid ' + C.surf3, borderBottom: '1px solid ' + C.surf3, margin: '0 -24px', padding: '10px 24px' }}>
            {[
              { label: 'Entry',     val: league.buy_in === 0 ? 'Free' : `$${league.buy_in.toFixed(2)}`, color: league.buy_in > 0 ? C.gold : C.green },
              { label: 'Entries',   val: `${league.member_count} / ${league.league_size}`, color: C.text },
              { label: 'Prizes',    val: prize > 0 ? `$${prize.toFixed(2)}` : '—', color: C.green },
              { label: 'My Entries', val: '—', color: C.sub },
              { label: 'Max Entries', val: '1', color: C.sub },
            ].map((item, i) => (
              <div key={i} style={{ flex: 1, textAlign: i === 0 ? 'left' : 'center', borderRight: i < 4 ? '1px solid ' + C.surf3 : 'none', paddingRight: 12, marginRight: 12 }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: item.color }}>{item.val}</div>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, margin: '0 -24px' }}>
            {(['details', 'rules'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '11px 24px', background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                  color: tab === t ? C.gold : C.sub,
                  borderBottom: `2px solid ${tab === t ? C.gold : 'transparent'}`,
                  transition: 'all .12s',
                }}
              >
                {t === 'details' ? 'Contest Details' : 'Rules & Scoring'}
              </button>
            ))}
          </div>
        </div>

        {/* ── TAB BODY ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {tab === 'details' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24 }}>

              {/* LEFT: Summary + Entrants */}
              <div>
                {/* Summary */}
                <div style={{ marginBottom: 24 }}>
                  <div style={sectionHeader}>Summary</div>
                  <div style={{ background: '#0a101c', border: '1px solid ' + C.surf3, borderRadius: 6, padding: '14px 16px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.sub, lineHeight: 1.7 }}>
                    {autoSummary(league, members)}
                  </div>
                </div>

                {/* Entrants */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={sectionHeader}>Entrants ({league.member_count}/{league.league_size})</div>
                  </div>
                  <input
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Search an entrant..."
                    style={{ width: '100%', boxSizing: 'border-box', background: '#0a101c', border: '1px solid ' + C.surf3, borderRadius: 5, padding: '7px 10px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.text, outline: 'none', marginBottom: 10 }}
                  />
                  {loadingMembers ? (
                    <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2 }}>Loading…</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
                      {displaySlots.map((m, i) => (
                        <div key={i} style={{ background: C.hover, borderRadius: 4, padding: '7px 10px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: m ? C.sub : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m ? m.display_name : '—'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Prize Payouts */}
              <div>
                <div style={sectionHeader}>Prize Payouts</div>
                {po.length === 0 ? (
                  <div style={{ color: C.muted, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, padding: '12px 0' }}>No prize pool for this contest.</div>
                ) : (
                  <div style={{ background: '#0a101c', border: '1px solid ' + C.surf3, borderRadius: 6, overflow: 'hidden' }}>
                    {/* Header row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', padding: '8px 14px', borderBottom: '1px solid ' + C.surf3 }}>
                      {['Place', 'Payout', '%'].map(h => (
                        <div key={h} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>{h}</div>
                      ))}
                    </div>
                    {po.map((p, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', padding: '11px 14px', borderBottom: i < po.length - 1 ? '1px solid rgba(30,45,71,.5)' : 'none', alignItems: 'center' }}>
                        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text }}>{p.place}</div>
                        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.green }}>${p.amount.toFixed(2)}</div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted }}>{p.pct}%</div>
                      </div>
                    ))}
                    {/* Total row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', padding: '10px 14px', background: 'rgba(46,204,113,.05)', borderTop: '1px solid rgba(46,204,113,.15)' }}>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>Total</div>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.green }}>${prize.toFixed(2)}</div>
                      <div />
                    </div>
                  </div>
                )}

                {/* ODR note */}
                <div style={{ marginTop: 20 }}>
                  <div style={sectionHeader}>Scoring Note</div>
                  <div style={{ background: '#0a101c', border: '1px solid ' + C.surf3, borderRadius: 6, padding: '12px 14px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub, lineHeight: 1.6 }}>
                    <strong style={{ color: C.text }}>ODR Multiplier:</strong> Your unit's final fantasy score is multiplied by their Opponent Difficulty Rating — units playing tougher defenses receive a bonus, making matchups matter.
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'rules' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Scoring System</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                  College Units Fantasy uses a unit-based scoring system. Each team drafts positional units (e.g. the Alabama RB unit) rather than individual players.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
                {SCORING_RULES.map(group => (
                  <div key={group.pos} style={{ background: '#0a101c', border: '1px solid ' + C.surf3, borderRadius: 6, overflow: 'hidden' }}>
                    {/* Position header */}
                    <div style={{ padding: '9px 14px', borderBottom: '1px solid ' + C.surf3, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.text, letterSpacing: 1, textTransform: 'uppercase' }}>{group.pos}</div>
                    </div>
                    {/* Rules rows */}
                    {group.rules.map((rule, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: i < group.rules.length - 1 ? '1px solid rgba(30,45,71,.4)' : 'none' }}>
                        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub }}>{rule.stat}</span>
                        <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: rule.pts.startsWith('−') ? C.red : C.green, letterSpacing: 0.5 }}>{rule.pts}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* ODR section */}
              <div style={{ marginTop: 20, background: '#0a101c', border: '1px solid rgba(212,168,40,.25)', borderRadius: 6, padding: '14px 16px' }}>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.gold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>ODR Multiplier — Opponent Difficulty Rating</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
                  Each unit's raw fantasy score is multiplied by an ODR value derived from the opponent's SP+ defensive (or offensive for DEF units) ranking. Facing a top-10 defense awards a <strong style={{ color: C.text }}>1.3×</strong> boost; facing a weak defense means a <strong style={{ color: C.text }}>0.7×</strong> penalty. This rewards smart matchup-based roster building.
                </div>
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                  {[
                    ['Top 5', '1.30×'], ['Top 10', '1.20×'], ['Top 15', '1.10×'],
                    ['Top 25', '1.00×'], ['Top 35', '0.90×'], ['51+', '0.70×'],
                  ].map(([rank, mult]) => (
                    <div key={rank} style={{ background: C.hover, borderRadius: 4, padding: '6px 10px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted }}>Def rank {rank}</span>
                      <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.text }}>{mult}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Eligible Schools section */}
              {(() => {
                const allowed = league.settings?.allowed_schools;
                const cf = styleLabel(league.conference_filter ?? '');
                const isAll = !allowed || allowed.length === 0;
                const schoolLabel = isAll
                  ? cf === 'All D1' ? 'All D1 Schools' : `${cf} Only`
                  : `${allowed.length} schools`;
                const schoolList = isAll ? null : allowed;
                return (
                  <div style={{ marginTop: 20, background: '#0a101c', border: '1px solid ' + C.surf3, borderRadius: 6, padding: '14px 16px' }}>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                      Eligible Schools — {schoolLabel}
                    </div>
                    {isAll ? (
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                        All D1 schools are eligible. Draft any unit from any program.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {schoolList!.sort().map(s => (
                          <span key={s} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, background: C.hover, border: '1px solid ' + C.surf3, borderRadius: 3, padding: '2px 7px', color: C.sub }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── BOTTOM BAR ───────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, borderTop: '1px solid ' + C.surf3, padding: '14px 24px', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', gap: 20 }}>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.muted, textDecoration: 'underline', padding: 0 }}>
              League Rules
            </button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.muted, textDecoration: 'underline', padding: 0 }}>
              Responsible Gaming
            </button>
          </div>
          <button
            onClick={() => { onClose(); onEnter(league); }}
            disabled={isFull}
            style={{
              padding: '13px 40px',
              background: isFull ? C.surf3 : 'linear-gradient(135deg,#27ae60,#2ecc71)',
              border: 'none', borderRadius: 6, cursor: isFull ? 'not-allowed' : 'pointer',
              fontFamily: 'Anton,sans-serif', fontSize: 15, letterSpacing: 2,
              color: isFull ? C.muted : '#fff', textTransform: 'uppercase',
              boxShadow: isFull ? 'none' : '0 0 20px rgba(46,204,113,.25)',
              transition: 'all .15s',
            }}
          >
            {isFull ? 'Contest Full' : enterLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Enter Team Modal (simplified) ─────────────────────────────────────────────
function EnterModal({
  league, user, walletBal, joining,
  onClose, onConfirm,
}: {
  league: League;
  user: any;
  walletBal: number;
  joining: boolean;
  onClose: () => void;
  onConfirm: (teamName: string) => void;
}) {
  const [teamName, setTeamName] = useState('');
  const [err, setErr] = useState('');
  const [addFunds, setAddFunds] = useState(false);
  const router = useRouter();
  const isFull = league.member_count >= league.league_size;

  async function submit() {
    if (!teamName.trim()) { setErr('Please enter a team name.'); return; }
    setErr('');
    const res = await fetch('/api/wallet/join-contest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ league_id: league.id, team_name: teamName.trim() }),
    });
    const d = await res.json();
    if (!res.ok) {
      if (d.code === 'INSUFFICIENT_BALANCE') {
        setAddFunds(true);
        setErr(`Not enough funds. Need $${league.buy_in.toFixed(2)}, wallet has $${(walletBal / 100).toFixed(2)}.`);
      } else {
        setErr(d.error ?? 'Failed to join.');
      }
      return;
    }
    onConfirm(teamName.trim());
    if (d.redirect) router.push(d.redirect);
    else router.push(league.league_type === 'weekly' ? `/league/${league.id}/lineup` : `/league/${league.id}/draft`);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#0d1827', border: '1px solid ' + C.surf3, borderRadius: 12, padding: 28, maxWidth: 420, width: '100%' }}>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Enter Contest</div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.gold, marginBottom: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{league.name}</div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Entry Fee',    val: league.buy_in === 0 ? 'Free' : `$${league.buy_in.toFixed(2)}` },
            { label: 'Total Prizes', val: totalPrize(league) > 0 ? `$${totalPrize(league).toFixed(2)}` : '—' },
            { label: 'Spots Left',   val: `${league.league_size - league.member_count}` },
          ].map(item => (
            <div key={item.label} style={{ flex: 1, background: C.surf, borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: C.text }}>{item.val}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>Your Team Name</div>
          <input
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder="e.g. Crimson Dynasty"
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', background: C.surf3, border: '1px solid #263a55', borderRadius: 6, padding: '10px 12px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.text, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          />
        </div>

        {league.buy_in > 0 && (
          <div style={{ marginBottom: 14, padding: '8px 12px', background: C.surf, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub }}>Wallet Balance</span>
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: walletBal / 100 >= league.buy_in ? C.green : C.red }}>
              ${(walletBal / 100).toFixed(2)}
            </span>
          </div>
        )}

        {err && (
          <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', borderRadius: 6, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.red }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', background: 'transparent', border: '1px solid ' + C.surf3, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase' }}>Cancel</button>
          {addFunds ? (
            <button onClick={() => router.push('/account')} style={{ flex: 2, padding: '11px 0', background: 'linear-gradient(135deg,#2ecc71,#27ae60)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}>
              Add Funds →
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={joining || isFull}
              style={{ flex: 2, padding: '11px 0', background: isFull ? C.surf3 : 'linear-gradient(135deg,#27ae60,#2ecc71)', border: 'none', borderRadius: 8, cursor: isFull ? 'not-allowed' : 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 1.5, color: isFull ? C.muted : '#fff', textTransform: 'uppercase', opacity: joining ? 0.7 : 1 }}
            >
              {joining ? 'Joining…' : isFull ? 'Full' : league.buy_in === 0 ? 'Join Free' : `Pay $${league.buy_in.toFixed(2)} & Enter`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function PublicLeaguesContent() {
  const router = useRouter();
  // ?t= param used as a cache-bust signal — any change re-triggers the load effect
  const searchParams = useSearchParams();
  const cacheBust = searchParams.get('t');

  const [leagues,      setLeagues]      = useState<League[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [user,         setUser]         = useState<any>(null);
  const [walletBal,    setWalletBal]    = useState<number>(0);
  const [entryCountMap, setEntryCountMap] = useState<Record<string, number>>({});
  const [joining,      setJoining]      = useState<string | null>(null);
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [deleting,     setDeleting]     = useState<string | null>(null);

  // Detail modal
  const [detailLeague, setDetailLeague] = useState<League | null>(null);
  // Enter modal
  const [enterLeague,  setEnterLeague]  = useState<League | null>(null);

  const [filter, setFilter] = useState<'all' | 'season' | 'weekly'>('all');

  // Filters
  const [search,         setSearch]         = useState('');
  const [feeMin,         setFeeMin]         = useState('');
  const [feeMax,         setFeeMax]         = useState('');
  const [styleFilter,    setStyleFilter]    = useState<string>('__all__');
  const [typeFilter,     setTypeFilter]     = useState<string>('all');
  const [fieldMin,       setFieldMin]       = useState('');
  const [fieldMax,       setFieldMax]       = useState('');
  const [onlyGuaranteed, setOnlyGuaranteed] = useState(false);
  const [advOpen,        setAdvOpen]        = useState(false);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null);
      setIsAdmin(u?.email === 'whb21burton@gmail.com');
      if (u) {
        fetch('/api/wallet').then(r => r.json()).then(d => {
          setWalletBal(d.wallet?.available ?? d.wallet?.balance ?? 0);
        }).catch(() => {});
        supabase.from('league_members').select('league_id').eq('user_id', u.id).then(({ data }) => {
          const map: Record<string, number> = {};
          for (const e of data ?? []) map[e.league_id] = (map[e.league_id] ?? 0) + 1;
          setEntryCountMap(map);
        });
      }
    });
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // ?t= busts the browser URL cache; cache:'no-store' prevents fetch caching
        const res = await fetch(`/api/public-leagues?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) { setLoading(false); return; }
        const data: League[] = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setLeagues(arr);
      } catch {
        // network error — leave leagues empty
      }
      setLoading(false);
    }
    load();
  // cacheBust changes whenever ?t= changes, triggering a fresh fetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheBust]);

  const displayed = leagues.filter(l => {
    if (filter === 'season') return l.league_type === 'season';
    if (filter === 'weekly') return l.league_type === 'weekly';
    return l.league_type !== 'bracket';
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    const minFee = feeMin ? parseFloat(feeMin) : null;
    const maxFee = feeMax ? parseFloat(feeMax) : null;
    if (minFee !== null && l.buy_in < minFee) return false;
    if (maxFee !== null && l.buy_in > maxFee) return false;
    if (styleFilter !== '__all__') {
      const cf = l.conference_filter ?? '';
      const matchesConference =
        styleFilter === 'All D1'
          ? (!cf || cf === 'All D1')
          : cf === styleFilter;
      if (!matchesConference) return false;
    }
    if (typeFilter !== 'all') {
      const matchesEntryType =
        (typeFilter === 'capped' && l.is_capped === true && l.league_size !== 2) ||
        (typeFilter === 'nocap'  && !l.is_capped          && l.league_size !== 2) ||
        (typeFilter === '1v1'    && l.league_size === 2);
      if (!matchesEntryType) return false;
    }
    const fMin = fieldMin ? parseInt(fieldMin) : null;
    const fMax = fieldMax ? parseInt(fieldMax) : null;
    if (fMin !== null && l.league_size < fMin) return false;
    if (fMax !== null && l.league_size > fMax) return false;
    if (onlyGuaranteed && !isGPP(l)) return false;
    return true;
  });

  function openDetail(league: League) {
    setDetailLeague(league);
  }

  function openEnter(league: League) {
    if (!user) { router.push('/'); return; }
    setEnterLeague(league);
  }

  async function deleteLeague(league: League) {
    if (!confirm(`Delete "${league.name}"? This cannot be undone.`)) return;
    setDeleting(league.id);
    try {
      const res = await fetch(`/api/leagues/${league.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setLeagues(prev => prev.filter(l => l.id !== league.id));
        if (data.refunded > 0) alert(data.message);
      } else {
        alert('Error: ' + (data.error ?? 'Failed to delete'));
      }
    } finally {
      setDeleting(null);
    }
  }

  function SideRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button
        onClick={onClick}
        style={{ width: '100%', textAlign: 'left', background: active ? 'rgba(212,168,40,.07)' : 'transparent', border: 'none', borderLeft: `3px solid ${active ? C.gold : 'transparent'}`, padding: '7px 10px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: active ? C.text : C.sub, cursor: 'pointer', transition: 'all .12s' }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.text; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.color = C.sub; }}
      >
        {children}
      </button>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ background: 'linear-gradient(180deg,#0d1827,#0c1422)', borderBottom: '1px solid ' + C.surf3, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: C.sub, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>← Home</button>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1.5, textTransform: 'uppercase' }}>Contest Lobby</div>
          <div style={{ padding: '3px 10px', borderRadius: 4, background: 'rgba(212,168,40,.12)', border: '1px solid rgba(212,168,40,.3)', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.gold, textTransform: 'uppercase' }}>
            {loading ? '…' : `${displayed.length} Open`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user && (
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.green }}>
              💰 ${(walletBal / 100).toFixed(2)}
            </div>
          )}
          <button onClick={() => router.push('/')} style={{ padding: '7px 18px', background: 'linear-gradient(135deg,#d4a828,#f0c94a)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: C.bg, textTransform: 'uppercase' }}>
            + Create League
          </button>
        </div>
      </div>

      {/* 3-col layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────── */}
        <div style={{ width: 200, flexShrink: 0, background: C.surf, borderRight: '1px solid ' + C.surf3, overflowY: 'auto', padding: '16px 0' }}>

          {/* League type filter */}
          <div style={{ padding: '0 12px', marginBottom: 16 }}>
            {([
              { key: 'all',    label: 'All Leagues',    icon: '🌐' },
              { key: 'season', label: 'Season Long',    icon: '🏈' },
              { key: 'weekly', label: "Weekly Pick'em", icon: '⚡' },
            ] as const).map(item => (
              <button key={item.key} onClick={() => setFilter(item.key)}
                style={{ width: '100%', padding: '10px 14px', marginBottom: 3, background: filter === item.key ? 'rgba(245,166,35,.1)' : 'none', border: `1px solid ${filter === item.key ? C.gold : 'transparent'}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: filter === item.key ? C.gold : C.text }}>{item.label}</span>
              </button>
            ))}
          </div>

          <div style={{ padding: '0 12px', marginBottom: 20 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Leagues..."
              style={{ width: '100%', boxSizing: 'border-box', background: C.surf3, border: '1px solid #263a55', borderRadius: 6, padding: '8px 10px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.text, outline: 'none' }}
            />
          </div>

          <div style={{ padding: '0 12px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Entry Fee</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={feeMin} onChange={e => setFeeMin(e.target.value)} placeholder="Min" type="number" min="0" style={rangeInputStyle} />
              <span style={{ color: C.muted, fontSize: 11 }}>—</span>
              <input value={feeMax} onChange={e => setFeeMax(e.target.value)} placeholder="Max" type="number" min="0" style={rangeInputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 6, padding: '0 12px' }}>Conference Style</div>
            <SideRow active={styleFilter === '__all__'} onClick={() => setStyleFilter('__all__')}>All</SideRow>
            {STYLE_OPTIONS.map(o => (
              <SideRow key={o.value} active={styleFilter === o.value} onClick={() => setStyleFilter(o.value)}>{o.label}</SideRow>
            ))}
          </div>

          <div style={{ padding: '0 12px' }}>
            <button onClick={() => setAdvOpen(v => !v)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ transform: advOpen ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
              Advanced
            </button>
            {advOpen && (
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.sub, marginBottom: 6 }}>Field Size</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
                  <input value={fieldMin} onChange={e => setFieldMin(e.target.value)} placeholder="Min" type="number" min="2" style={rangeInputStyle} />
                  <span style={{ color: C.muted, fontSize: 11 }}>—</span>
                  <input value={fieldMax} onChange={e => setFieldMax(e.target.value)} placeholder="Max" type="number" min="2" style={rangeInputStyle} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={onlyGuaranteed} onChange={e => setOnlyGuaranteed(e.target.checked)} style={{ accentColor: C.gold }} />
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub }}>Guaranteed Only</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN CENTER PANEL ─────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 90px 90px 100px 110px 100px 92px 32px', background: C.hdrBg, borderBottom: '1px solid ' + C.surf3, padding: '0 12px', flexShrink: 0 }}>
            {['', 'Contest', 'Your Entries', 'Style', 'Entry Fee', 'Total Prizes', 'Entries', 'Live/Start', '', ''].map((h, i) => (
              <div key={i} style={{ padding: '9px 8px', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, color: C.hdrText, textTransform: 'uppercase', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 2, fontSize: 12 }}>Loading contests…</div>
            ) : displayed.length === 0 ? (
              <div style={{ padding: '60px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🏟️</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.sub, textTransform: 'uppercase', marginBottom: 16 }}>No contests match your filters</div>
                <button onClick={() => { setSearch(''); setFeeMin(''); setFeeMax(''); setStyleFilter('__all__'); setTypeFilter('all'); setFieldMin(''); setFieldMax(''); setOnlyGuaranteed(false); }} style={{ padding: '9px 22px', background: C.surf3, border: '1px solid #2a3d58', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.sub, textTransform: 'uppercase' }}>Clear Filters</button>
              </div>
            ) : (
              displayed.map((league, idx) => {
                const pct      = Math.min(1, league.member_count / league.league_size);
                const nearFull = pct >= 0.8;
                const isFull   = league.member_count >= league.league_size;
                const prize    = totalPrize(league);
                const gpp      = isGPP(league);
                const entColor = isFull ? C.red : nearFull ? C.orange : C.green;

                return (
                  <div
                    key={league.id}
                    onClick={() => openDetail(league)}
                    style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 90px 90px 100px 110px 100px 92px 32px', background: idx % 2 === 0 ? C.rowA : C.rowB, borderBottom: '1px solid rgba(30,45,71,.5)', padding: '0 12px', alignItems: 'center', transition: 'background .1s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? C.rowA : C.rowB)}
                  >
                    <div style={{ padding: '12px 4px 12px 0', fontSize: 12, color: league.is_featured ? C.gold : 'transparent' }}>⭐</div>

                    <div style={{ padding: '10px 8px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: C.gold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{league.name}</div>
                        {getCopyBadge(league.name) && (
                          <span style={{ flexShrink: 0, fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, background: 'rgba(212,168,40,.15)', border: '1px solid rgba(212,168,40,.3)', borderRadius: 3, padding: '1px 5px', color: C.gold }}>
                            #{getCopyBadge(league.name)}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <span style={tagStyle('rgba(245,166,35,.15)', '#f5a623')}>
                          ⚡ Weekly{league.week ? ` · Wk ${league.week}` : ''}
                        </span>
                        {league.league_size === 2
                          ? <span style={tagStyle('rgba(58,134,255,.15)', '#3a86ff')}>1v1</span>
                          : league.is_capped === true
                            ? <span style={tagStyle('rgba(74,93,122,.12)', '#7a90b0')}>🧢 Capped</span>
                            : <span style={tagStyle('rgba(46,204,113,.12)', '#2ecc71')}>∞ No Cap</span>
                        }
                        {league.is_featured && (
                          <span style={tagStyle('rgba(212,168,40,.15)', '#d4a828')}>⭐ Featured</span>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const myCount = entryCountMap[league.id] ?? 0;
                      const maxE    = league.max_entries_per_user ?? null;
                      const display = maxE ? `${myCount} / ${maxE}` : `${myCount} / ∞`;
                      return (
                        <div style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: myCount > 0 ? C.green : C.muted }}>
                            {display}
                          </span>
                        </div>
                      );
                    })()}

                    <div style={{ padding: '12px 8px', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub }}>
                      {league.conference_filter || 'All D1'}
                    </div>

                    <div style={{ padding: '12px 8px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, color: league.buy_in > 0 ? C.gold : C.green, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {league.buy_in === 0 ? 'Free' : `🪙 $${league.buy_in.toFixed(2)}`}
                    </div>

                    <div style={{ padding: '12px 8px', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      {(() => {
                        const displayPrize = league.league_type === 'weekly'
                          ? (league.buy_in ?? 0) * (league.member_count ?? 0) * 0.95
                          : prize;
                        return (
                          <>
                            {gpp && displayPrize > 0 && <span style={{ background: C.green, color: '#04150b', fontFamily: 'Anton,sans-serif', fontSize: 9, borderRadius: 3, padding: '1px 4px' }}>G</span>}
                            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, color: displayPrize > 0 ? C.green : C.muted }}>{displayPrize > 0 ? `$${displayPrize.toFixed(2)}` : '—'}</span>
                          </>
                        );
                      })()}
                    </div>

                    <div style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: entColor }}>{league.member_count}/{league.league_size}</span>
                    </div>

                    <div style={{ padding: '12px 8px', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {league.league_type === 'weekly'
                        ? <span style={{ lineHeight: 1.3, display: 'inline-block' }}>When first<br />game starts</span>
                        : tick > -1 && formatStartTime(league)}
                    </div>

                    <div style={{ padding: '10px 8px 10px 4px', textAlign: 'right' }}>
                      <button
                        onClick={e => { e.stopPropagation(); openEnter(league); }}
                        disabled={isFull || joining === league.id}
                        style={{ padding: '7px 14px', background: C.surf3, border: `1px solid ${isFull ? '#263040' : '#2e4060'}`, borderRadius: 5, cursor: isFull ? 'not-allowed' : 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1.5, color: isFull ? C.muted : C.text, textTransform: 'uppercase', transition: 'all .12s', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => { if (!isFull) { e.currentTarget.style.background = '#2a3f60'; e.currentTarget.style.borderColor = '#3a5070'; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = C.surf3; e.currentTarget.style.borderColor = isFull ? '#263040' : '#2e4060'; }}
                      >
                        {joining === league.id ? '…' : isFull ? 'Full' : 'Enter'}
                      </button>
                    </div>
                    <div style={{ padding: '10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isAdmin && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteLeague(league); }}
                          disabled={deleting === league.id}
                          title="Delete league"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: 14, padding: '2px 4px', opacity: deleting === league.id ? 0.4 : 0.6, transition: 'opacity .12s' }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = deleting === league.id ? '0.4' : '0.6'; }}
                        >
                          {deleting === league.id ? '…' : '🗑️'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Contest Detail Modal ─────────────────────────────────────────── */}
      {detailLeague && (
        <ContestDetailModal
          league={detailLeague}
          user={user}
          walletBal={walletBal}
          tick={tick}
          onClose={() => setDetailLeague(null)}
          onEnter={l => { setDetailLeague(null); openEnter(l); }}
        />
      )}

      {/* ── Enter Team Modal ──────────────────────────────────────────────── */}
      {enterLeague && (
        <EnterModal
          league={enterLeague}
          user={user}
          walletBal={walletBal}
          joining={joining === enterLeague.id}
          onClose={() => setEnterLeague(null)}
          onConfirm={() => setEnterLeague(null)}
        />
      )}
    </div>
  );
}

export default function PublicLeaguesPage() {
  return (
    <Suspense fallback={<div style={{ background: '#05080f', minHeight: '100vh' }} />}>
      <PublicLeaguesContent />
    </Suspense>
  );
}

const rangeInputStyle: React.CSSProperties = {
  width: '100%', minWidth: 0,
  background: '#131d30', border: '1px solid #1e2d47',
  borderRadius: 4, padding: '6px 8px',
  fontFamily: "'Space Grotesk',sans-serif", fontSize: 11,
  color: '#e8edf5', outline: 'none',
};

function tagStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center',
    padding: '1px 6px', borderRadius: 3,
    background: bg, color,
    fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, fontWeight: 600,
    letterSpacing: 0.3,
  };
}

const sectionHeader: React.CSSProperties = {
  fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2,
  color: '#4a5d7a', textTransform: 'uppercase', marginBottom: 10,
};
