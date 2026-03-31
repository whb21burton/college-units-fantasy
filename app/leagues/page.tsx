'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

const C = {
  bg:      '#05080f',
  surf:    '#0c1220',
  surf2:   '#0a101c',
  surf3:   '#1e2d47',
  hdr:     '#111926',
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
};

const STYLE_OPTIONS = [
  { value: 'ALL',         label: 'All D1 Schools' },
  { value: 'SEC',         label: 'SEC Only'       },
  { value: 'Big Ten',     label: 'Big Ten Only'   },
  { value: 'ACC',         label: 'ACC Only'       },
  { value: 'Big 12',      label: 'Big 12 Only'    },
  { value: 'Pac-12',      label: 'Pac-12 Only'    },
  { value: 'Independent', label: 'Independent'    },
] as const;

const TYPE_OPTIONS = [
  { value: 'all',       label: 'All'               },
  { value: 'featured',  label: '⭐ Featured'        },
  { value: 'season',    label: 'Season Leagues'    },
  { value: 'weekly',    label: 'Weekly Pick\'em'   },
  { value: 'h2h',       label: 'Head to Head'      },
  { value: 'gpp',       label: 'Guaranteed Prize Pool' },
] as const;

// Countdown/date formatter for the Live/Start column
function formatStartTime(league: League): string {
  const ref = league.draft_start_time ?? league.created_at;
  if (!ref) return '—';
  const d = new Date(ref);
  const now = Date.now();
  const diff = d.getTime() - now;
  if (diff > 0 && diff < 2 * 60 * 60 * 1000) {
    // Within 2 hours — show countdown
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  // Otherwise show date
  const mo = d.getMonth() + 1;
  const dy = d.getDate();
  const hr = d.getHours();
  const mn = d.getMinutes();
  const ampm = hr < 12 ? 'a' : 'p';
  const h12 = (hr % 12) || 12;
  return `${mo}/${dy} ${h12}:${String(mn).padStart(2,'0')}${ampm}`;
}

function styleLabel(cf: string): string {
  if (!cf || cf === 'ALL') return 'All D1';
  return cf;
}

function isFeatured(l: League): boolean {
  return l.league_type === 'weekly' && l.buy_in > 0;
}

function isGPP(l: League): boolean {
  return l.member_count >= l.league_size;
}

function totalPrize(l: League): number {
  return (l.buy_in ?? 0) * (l.league_size ?? 0);
}

export default function PublicLeaguesPage() {
  const router = useRouter();

  const [leagues,      setLeagues]      = useState<League[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [user,         setUser]         = useState<any>(null);
  const [walletBal,    setWalletBal]    = useState<number>(0); // in cents
  const [joining,      setJoining]      = useState<string | null>(null);

  // Enter modal state
  const [enterLeague,  setEnterLeague]  = useState<League | null>(null);
  const [teamName,     setTeamName]     = useState('');
  const [enterErr,     setEnterErr]     = useState('');
  const [addFunds,     setAddFunds]     = useState(false);

  // Filters
  const [search,        setSearch]        = useState('');
  const [feeMin,        setFeeMin]        = useState('');
  const [feeMax,        setFeeMax]        = useState('');
  const [styleFilter,   setStyleFilter]   = useState<string>('__all__');
  const [typeFilter,    setTypeFilter]    = useState<string>('all');
  const [fieldMin,      setFieldMin]      = useState('');
  const [fieldMax,      setFieldMax]      = useState('');
  const [onlyGuaranteed, setOnlyGuaranteed] = useState(false);
  const [advOpen,       setAdvOpen]       = useState(false);

  // Live countdown ticker
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null);
      if (u) {
        supabase.from('wallets').select('balance').eq('user_id', u.id).single()
          .then(({ data }) => { if (data) setWalletBal(data.balance ?? 0); });
      }
    });
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('leagues')
        .select('id, name, buy_in, league_size, draft_type, league_type, week, status, invite_code, conference_filter, commissioner_id, created_at, draft_start_time')
        .eq('is_public', true)
        .in('status', ['forming', 'drafting'])
        .order('created_at', { ascending: false });

      if (error || !data) { setLoading(false); return; }

      const counts = await Promise.all(
        data.map(l =>
          supabase
            .from('league_members')
            .select('*', { count: 'exact', head: true })
            .eq('league_id', l.id)
            .then(({ count }) => ({ id: l.id, count: count ?? 0 }))
        )
      );
      const cm: Record<string, number> = {};
      counts.forEach(c => { cm[c.id] = c.count; });

      setLeagues(data.map(l => ({
        ...l,
        conference_filter: l.conference_filter ?? 'ALL',
        member_count: cm[l.id] ?? 0,
      })));
      setLoading(false);
    }
    load();
  }, []);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const displayed = leagues.filter(l => {
    // Search
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;

    // Entry fee range
    const minFee = feeMin ? parseFloat(feeMin) : null;
    const maxFee = feeMax ? parseFloat(feeMax) : null;
    if (minFee !== null && l.buy_in < minFee) return false;
    if (maxFee !== null && l.buy_in > maxFee) return false;

    // Style (conference)
    if (styleFilter !== '__all__') {
      const cf = l.conference_filter === 'ALL' ? 'ALL' : l.conference_filter;
      if (cf !== styleFilter) return false;
    }

    // Contest type
    if (typeFilter === 'season'   && l.league_type !== 'season')  return false;
    if (typeFilter === 'weekly'   && l.league_type !== 'weekly')  return false;
    if (typeFilter === 'h2h'      && l.league_size !== 2)         return false;
    if (typeFilter === 'featured' && !isFeatured(l))              return false;
    if (typeFilter === 'gpp'      && !isGPP(l))                   return false;

    // Field size
    const fMin = fieldMin ? parseInt(fieldMin) : null;
    const fMax = fieldMax ? parseInt(fieldMax) : null;
    if (fMin !== null && l.league_size < fMin) return false;
    if (fMax !== null && l.league_size > fMax) return false;

    // Guaranteed
    if (onlyGuaranteed && !isGPP(l)) return false;

    return true;
  });

  // ── Enter flow ────────────────────────────────────────────────────────────
  function handleEnterClick(league: League) {
    if (!user) { router.push('/'); return; }
    setEnterLeague(league);
    setTeamName('');
    setEnterErr('');
    setAddFunds(false);
  }

  async function handleConfirmEnter() {
    if (!enterLeague || !teamName.trim()) { setEnterErr('Please enter a team name.'); return; }
    const league = enterLeague;
    setJoining(league.id);
    setEnterErr('');
    try {
      const res = await fetch('/api/wallet/join-contest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: league.id, team_name: teamName.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.code === 'INSUFFICIENT_BALANCE') {
          setAddFunds(true);
          setEnterErr(`Not enough funds. Need $${league.buy_in.toFixed(2)}, wallet has $${(walletBal / 100).toFixed(2)}.`);
        } else {
          setEnterErr(d.error ?? 'Failed to join.');
        }
        return;
      }
      setEnterLeague(null);
      if (d.redirect) {
        router.push(d.redirect);
      } else {
        const dest = league.league_type === 'weekly'
          ? `/league/${league.id}/lineup`
          : `/league/${league.id}/draft`;
        router.push(dest);
      }
    } finally {
      setJoining(null);
    }
  }

  // ── Sidebar section helper ─────────────────────────────────────────────────
  function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
          {title}
        </div>
        {children}
      </div>
    );
  }

  function SideRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button
        onClick={onClick}
        style={{
          width: '100%', textAlign: 'left',
          background: active ? 'rgba(212,168,40,.07)' : 'transparent',
          border: 'none',
          borderLeft: `3px solid ${active ? C.gold : 'transparent'}`,
          padding: '7px 10px',
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 12,
          color: active ? C.text : C.sub,
          cursor: 'pointer', transition: 'all .12s',
        }}
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
          <button
            onClick={() => router.push('/')}
            style={{ padding: '7px 18px', background: 'linear-gradient(135deg,#d4a828,#f0c94a)', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: C.bg, textTransform: 'uppercase' }}
          >
            + Create League
          </button>
        </div>
      </div>

      {/* 3-col layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────── */}
        <div style={{
          width: 200, flexShrink: 0,
          background: C.surf, borderRight: '1px solid ' + C.surf3,
          overflowY: 'auto', padding: '16px 0',
        }}>
          {/* Search */}
          <div style={{ padding: '0 12px', marginBottom: 20 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Leagues..."
              style={{
                width: '100%', boxSizing: 'border-box',
                background: C.surf3, border: '1px solid #263a55',
                borderRadius: 6, padding: '8px 10px',
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 12,
                color: C.text, outline: 'none',
              }}
            />
          </div>

          {/* Entry Fee */}
          <div style={{ padding: '0 12px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
              Entry Fee
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={feeMin}
                onChange={e => setFeeMin(e.target.value)}
                placeholder="Min"
                type="number" min="0"
                style={rangeInputStyle}
              />
              <span style={{ color: C.muted, fontSize: 11 }}>—</span>
              <input
                value={feeMax}
                onChange={e => setFeeMax(e.target.value)}
                placeholder="Max"
                type="number" min="0"
                style={rangeInputStyle}
              />
            </div>
          </div>

          {/* Conference Style */}
          <div style={{ padding: '0 0', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 6, padding: '0 12px' }}>
              Conference Style
            </div>
            <SideRow active={styleFilter === '__all__'} onClick={() => setStyleFilter('__all__')}>All</SideRow>
            {STYLE_OPTIONS.map(o => (
              <SideRow key={o.value} active={styleFilter === o.value} onClick={() => setStyleFilter(o.value)}>
                {o.label}
              </SideRow>
            ))}
          </div>

          {/* Contest Types */}
          <div style={{ padding: '0 0', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 6, padding: '0 12px' }}>
              Contest Types
            </div>
            {TYPE_OPTIONS.map(o => (
              <SideRow key={o.value} active={typeFilter === o.value} onClick={() => setTypeFilter(o.value)}>
                {o.label}
              </SideRow>
            ))}
          </div>

          {/* Advanced */}
          <div style={{ padding: '0 12px' }}>
            <button
              onClick={() => setAdvOpen(v => !v)}
              style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}
            >
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
                  <input
                    type="checkbox"
                    checked={onlyGuaranteed}
                    onChange={e => setOnlyGuaranteed(e.target.checked)}
                    style={{ accentColor: C.gold }}
                  />
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub }}>Guaranteed Only</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN CENTER PANEL ─────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Sticky column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr 90px 90px 100px 110px 100px',
            gap: 0,
            background: C.hdrBg,
            borderBottom: '1px solid ' + C.surf3,
            padding: '0 12px',
            flexShrink: 0,
            position: 'sticky', top: 0, zIndex: 10,
          }}>
            {['', 'Contest', 'Style', 'Entry Fee', 'Total Prizes', 'Entries', 'Live/Start'].map((h, i) => (
              <div key={i} style={{ padding: '9px 8px', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, color: C.hdrText, textTransform: 'uppercase', textAlign: i >= 3 ? 'right' : 'left' }}>
                {h}
              </div>
            ))}
            {/* Enter button column header */}
            <div style={{ padding: '9px 8px' }} />
          </div>

          {/* Scrollable rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: C.muted, fontFamily: 'Oswald,sans-serif', letterSpacing: 2, fontSize: 12 }}>
                Loading contests…
              </div>
            ) : displayed.length === 0 ? (
              <div style={{ padding: '60px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🏟️</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.sub, textTransform: 'uppercase', marginBottom: 16 }}>No contests match your filters</div>
                <button onClick={() => { setSearch(''); setFeeMin(''); setFeeMax(''); setStyleFilter('__all__'); setTypeFilter('all'); setFieldMin(''); setFieldMax(''); setOnlyGuaranteed(false); }} style={{ padding: '9px 22px', background: C.surf3, border: '1px solid #2a3d58', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.sub, textTransform: 'uppercase' }}>
                  Clear Filters
                </button>
              </div>
            ) : (
              displayed.map((league, idx) => {
                const pct       = Math.min(1, league.member_count / league.league_size);
                const nearFull  = pct >= 0.8;
                const isFull    = league.member_count >= league.league_size;
                const prize     = totalPrize(league);
                const gpp       = isGPP(league);
                const featured  = isFeatured(league);
                const entColor  = isFull ? C.red : nearFull ? C.orange : C.green;

                return (
                  <div
                    key={league.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 1fr 90px 90px 100px 110px 100px 92px',
                      gap: 0,
                      background: idx % 2 === 0 ? C.rowA : C.rowB,
                      borderBottom: '1px solid rgba(30,45,71,.5)',
                      padding: '0 12px',
                      alignItems: 'center',
                      transition: 'background .1s',
                      cursor: 'default',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? C.rowA : C.rowB)}
                  >
                    {/* Star */}
                    <div style={{ padding: '12px 4px 12px 0', fontSize: 12, color: featured ? C.gold : 'transparent' }}>⭐</div>

                    {/* Contest name + badge */}
                    <div style={{ padding: '10px 8px', minWidth: 0 }}>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: C.gold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                        {league.name}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <span style={tagStyle(league.league_type === 'weekly' ? 'rgba(245,166,35,.15)' : 'rgba(122,144,176,.12)', league.league_type === 'weekly' ? '#f5a623' : C.sub)}>
                          {league.league_type === 'weekly' ? '⚡ Weekly' : '🏆 Season'}
                          {league.week ? ` · Wk ${league.week}` : ''}
                        </span>
                        {league.league_type === 'season' && (
                          <span style={tagStyle('rgba(122,144,176,.1)', C.muted)}>
                            {league.draft_type === 'snake' ? '🐍 Snake' : '💰 Salary'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Style */}
                    <div style={{ padding: '12px 8px', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 0.5, color: C.sub, textAlign: 'left' }}>
                      {styleLabel(league.conference_filter)}
                    </div>

                    {/* Entry Fee */}
                    <div style={{ padding: '12px 8px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, color: league.buy_in > 0 ? C.gold : C.green, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {league.buy_in === 0 ? 'Free' : (
                        <>🪙 ${league.buy_in.toFixed(2)}</>
                      )}
                    </div>

                    {/* Total Prizes */}
                    <div style={{ padding: '12px 8px', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      {gpp && prize > 0 && (
                        <span style={{ background: C.green, color: '#04150b', fontFamily: 'Anton,sans-serif', fontSize: 9, borderRadius: 3, padding: '1px 4px', letterSpacing: 0.5 }}>G</span>
                      )}
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, color: prize > 0 ? C.green : C.muted }}>
                        {prize > 0 ? `$${prize.toFixed(2)}` : '—'}
                      </span>
                    </div>

                    {/* Entries */}
                    <div style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: entColor }}>
                        {league.member_count}/{league.league_size}
                      </span>
                    </div>

                    {/* Live/Start */}
                    <div style={{ padding: '12px 8px', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 0.5, color: C.sub, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {/* tick forces re-render for countdown */}
                      {tick > -1 && formatStartTime(league)}
                    </div>

                    {/* Enter button */}
                    <div style={{ padding: '10px 8px 10px 4px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleEnterClick(league)}
                        disabled={isFull || joining === league.id}
                        style={{
                          padding: '7px 14px',
                          background: isFull ? C.surf3 : C.surf3,
                          border: `1px solid ${isFull ? '#263040' : '#2e4060'}`,
                          borderRadius: 5, cursor: isFull ? 'not-allowed' : 'pointer',
                          fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1.5,
                          color: isFull ? C.muted : C.text, textTransform: 'uppercase',
                          transition: 'all .12s',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { if (!isFull) { e.currentTarget.style.background = '#2a3f60'; e.currentTarget.style.borderColor = '#3a5070'; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = C.surf3; e.currentTarget.style.borderColor = isFull ? '#263040' : '#2e4060'; }}
                      >
                        {joining === league.id ? '…' : isFull ? 'Full' : 'Enter'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Enter Modal ─────────────────────────────────────────────────── */}
      {enterLeague && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setEnterLeague(null); setAddFunds(false); } }}>
          <div style={{ background: '#0d1827', border: '1px solid ' + C.surf3, borderRadius: 12, padding: 28, maxWidth: 400, width: '100%' }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              Enter Contest
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.gold, marginBottom: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {enterLeague.name}
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'Entry Fee',   val: enterLeague.buy_in === 0 ? 'Free' : `$${enterLeague.buy_in.toFixed(2)}` },
                { label: 'Total Prizes', val: totalPrize(enterLeague) > 0 ? `$${totalPrize(enterLeague).toFixed(2)}` : '—' },
                { label: 'Spots Left',   val: `${enterLeague.league_size - enterLeague.member_count}` },
              ].map(item => (
                <div key={item.label} style={{ flex: 1, background: C.surf, borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: C.text }}>{item.val}</div>
                </div>
              ))}
            </div>

            {/* Team name */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>Your Team Name</div>
              <input
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="e.g. Crimson Dynasty"
                style={{ width: '100%', boxSizing: 'border-box', background: C.surf3, border: '1px solid #263a55', borderRadius: 6, padding: '10px 12px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.text, outline: 'none' }}
                onKeyDown={e => { if (e.key === 'Enter') handleConfirmEnter(); }}
              />
            </div>

            {/* Wallet balance if paid */}
            {enterLeague.buy_in > 0 && (
              <div style={{ marginBottom: 14, padding: '8px 12px', background: C.surf, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub }}>Wallet Balance</span>
                <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: walletBal / 100 >= enterLeague.buy_in ? C.green : C.red }}>
                  ${(walletBal / 100).toFixed(2)}
                </span>
              </div>
            )}

            {enterErr && (
              <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', borderRadius: 6, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.red }}>
                {enterErr}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setEnterLeague(null); setAddFunds(false); }} style={{ flex: 1, padding: '11px 0', background: 'transparent', border: '1px solid ' + C.surf3, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase' }}>
                Cancel
              </button>
              {addFunds ? (
                <button onClick={() => router.push('/account')} style={{ flex: 2, padding: '11px 0', background: 'linear-gradient(135deg,#2ecc71,#27ae60)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}>
                  Add Funds →
                </button>
              ) : (
                <button
                  onClick={handleConfirmEnter}
                  disabled={joining === enterLeague?.id}
                  style={{ flex: 2, padding: '11px 0', background: 'linear-gradient(135deg,#d4a828,#f0c94a)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 1.5, color: C.bg, textTransform: 'uppercase', opacity: joining ? 0.7 : 1 }}
                >
                  {joining ? 'Joining…' : enterLeague.buy_in === 0 ? 'Join Free' : `Pay $${enterLeague.buy_in.toFixed(2)} & Enter`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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
