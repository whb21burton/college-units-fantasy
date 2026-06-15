'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase-browser';
import AgeVerificationModal from '@/components/compliance/AgeVerificationModal';
import TermsAcceptanceModal from '@/components/compliance/TermsAcceptanceModal';
import WalletDrawer from '@/components/wallet/WalletDrawer';
import { useWallet } from '@/context/WalletContext';
import { PAID_CONTESTS_ENABLED } from '@/lib/config';

const IntroAnimation = dynamic(() => import('@/components/IntroAnimation'), { ssr: false });

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a', goldDark: '#a07e18',
  muted: '#4a5d7a', text: '#e8edf5', sub: '#7a90b0',
  green: '#2ecc71', red: '#e74c3c', border: '#1e2d47',
};

type View = 'landing' | 'signin' | 'signup' | 'dashboard' | 'join';
type Sport = 'baseball' | 'basketball' | 'football';

// ── GameCard ──────────────────────────────────────────────────────────────────

function GameCard({ game }: { game: any }) {
  const isLive  = game.status === 'in';
  const isFinal = game.status === 'post';
  return (
    <div style={{
      background: C.surf2,
      border: `1px solid ${isLive ? 'rgba(231,76,60,.35)' : C.border}`,
      borderRadius: 8, padding: '9px 11px', marginBottom: 6,
      boxShadow: isLive ? '0 0 10px rgba(231,76,60,.08)' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{
          fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
          color: isLive ? C.red : isFinal ? C.muted : C.text,
          animation: isLive ? 'cuf-pulse 1.4s ease-in-out infinite' : 'none',
        }}>
          {isLive ? `● LIVE${game.period ? ` · ${game.period}` : ''}` : game.statusText}
        </span>
        {game.broadcast && (
          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 0.5 }}>
            {game.broadcast}
          </span>
        )}
      </div>
      {[game.away, game.home].map((team: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            {team?.logo
              ? <img src={team.logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} />
              : <div style={{ width: 16, height: 16, background: C.surf3, borderRadius: '50%', flexShrink: 0 }} />
            }
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {team?.rank && <span style={{ color: C.gold, marginRight: 3, fontSize: 9 }}>#{team.rank}</span>}
              {team?.abbrev ?? team?.name ?? '—'}
            </span>
          </div>
          <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.text, flexShrink: 0, marginLeft: 8 }}>
            {team?.score ?? '0'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── LiveScoreboard ────────────────────────────────────────────────────────────

const SPORT_TABS: { key: Sport; label: string; icon: string }[] = [
  { key: 'baseball',   label: 'Baseball',   icon: '⚾' },
  { key: 'basketball', label: 'Basketball', icon: '🏀' },
  { key: 'football',   label: 'Football',   icon: '🏈' },
];

const _pad = (n: number) => String(n).padStart(2, '0');
const _fmtDate = (d: Date) => `${d.getFullYear()}${_pad(d.getMonth() + 1)}${_pad(d.getDate())}`;
const _gameDateStr = (iso: string) => _fmtDate(new Date(iso));

function buildDateRange(): string {
  const today = new Date();
  const start = new Date(today); start.setDate(today.getDate() - 3);
  const end   = new Date(today); end.setDate(today.getDate() + 1);
  return `${_fmtDate(start)}-${_fmtDate(end)}`;
}

function dayLabel(isoDate: string): string {
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const ds = _gameDateStr(isoDate);
  if (ds === _fmtDate(today))     return 'TODAY';
  if (ds === _fmtDate(yesterday)) return 'YESTERDAY';
  return new Date(isoDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

function sortGames(raw: any[]): any[] {
  const todayStr = _fmtDate(new Date());
  const priority = (g: any) => {
    const ds = _gameDateStr(g.date);
    if (g.status === 'in')                        return 0; // live
    if (g.status === 'pre' && ds === todayStr)    return 1; // today upcoming
    if (ds === todayStr)                           return 2; // today final
    return 3;                                                // past
  };
  return [...raw].sort((a, b) => {
    const pa = priority(a), pb = priority(b);
    if (pa !== pb) return pa - pb;
    // Past: newest first; everything else: chronological
    const mul = pa === 3 ? -1 : 1;
    return mul * (new Date(a.date).getTime() - new Date(b.date).getTime());
  });
}

function LiveScoreboard() {
  const [sport, setSport]             = useState<Sport>('baseball');
  const [games, setGames]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef  = useRef<HTMLDivElement>(null);

  const fetchScores = useCallback(async () => {
    if (sport === 'football') return;
    setLoading(true);
    try {
      const endpoint = sport === 'baseball'
        ? '/api/scores/college-baseball'
        : '/api/scores/college-basketball';
      const res = await fetch(`${endpoint}?date=${buildDateRange()}`);
      if (res.ok) {
        const data = await res.json();
        setGames(sortGames(data.games ?? []));
        setLastUpdated(new Date());
      }
    } catch {}
    setLoading(false);
  }, [sport]);

  useEffect(() => {
    setGames([]);
    fetchScores();
    if (timerRef.current) clearInterval(timerRef.current);
    if (sport !== 'football') {
      timerRef.current = setInterval(fetchScores, 60000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sport, fetchScores]);

  // Auto-scroll to TODAY section after first load
  useEffect(() => {
    if (!games.length || !scrollRef.current || !todayRef.current) return;
    const offset = todayRef.current.offsetTop - 8;
    scrollRef.current.scrollTop = Math.max(0, offset);
  }, [games.length > 0 && sport]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`@keyframes cuf-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      {/* Sport tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {SPORT_TABS.map(tab => (
          <button key={tab.key} onClick={() => setSport(tab.key)} style={{
            flex: 1, padding: '9px 4px', background: 'none', border: 'none',
            borderBottom: `2px solid ${sport === tab.key ? C.gold : 'transparent'}`,
            cursor: 'pointer', marginBottom: -1,
            fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1,
            color: sport === tab.key ? C.gold : C.muted,
            textTransform: 'uppercase' as const, transition: 'all .12s',
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Games */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 8px 80px' }}>
        {sport === 'football' ? (
          <div style={{ textAlign: 'center', padding: '36px 12px' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏈</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
              Season Starts August 2025
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>
              Check back for live scores
            </div>
          </div>
        ) : loading && games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 12px', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>
            Loading scores…
          </div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 12px' }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>{sport === 'baseball' ? '⚾' : '🏀'}</div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>No games in the last 3 days</div>
          </div>
        ) : (
          games.map((g: any, idx: number) => {
            const label   = dayLabel(g.date);
            const prevLbl = idx > 0 ? dayLabel(games[idx - 1].date) : null;
            const showSep = label !== prevLbl;
            const isToday = label === 'TODAY';
            return (
              <div key={g.id}>
                {showSep && (
                  <div
                    ref={isToday ? todayRef : undefined}
                    style={{
                      padding: '6px 4px 4px',
                      fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2,
                      color: isToday ? C.gold : C.muted,
                      textTransform: 'uppercase' as const,
                      ...(idx > 0 ? { borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 10 } : {}),
                    }}
                  >
                    {label}
                  </div>
                )}
                <GameCard game={g} />
              </div>
            );
          })
        )}
      </div>

      {/* Last updated footer */}
      {lastUpdated && sport !== 'football' && (
        <div style={{ padding: '5px 8px', borderTop: `1px solid ${C.border}`, flexShrink: 0, fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1, textAlign: 'right' }}>
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · auto-refresh 60s
        </div>
      )}
    </div>
  );
}

// ── Season Recap Data ─────────────────────────────────────────────────────────

type RecapUnit = { s: string; t: number; a: number; w: number };
type RecapUnitWithPos = RecapUnit & { pos: string };

const RECAP_QBs: RecapUnit[] = [
  {s:"Vanderbilt",t:432.91,a:36.08,w:12},
  {s:"Ole Miss",t:404.04,a:33.67,w:12},
  {s:"Alabama",t:386.69,a:32.22,w:12},
  {s:"Baylor",t:382.69,a:31.89,w:12},
  {s:"Arkansas",t:376.45,a:31.37,w:12},
  {s:"USC",t:369.87,a:30.82,w:12},
  {s:"Texas A&M",t:363.23,a:30.27,w:12},
  {s:"Cincinnati",t:349.91,a:29.16,w:12},
  {s:"Georgia Tech",t:349.37,a:29.11,w:12},
  {s:"Tennessee",t:343.07,a:28.59,w:12},
  {s:"Ohio State",t:339.99,a:28.33,w:12},
  {s:"Indiana",t:338.40,a:28.20,w:12},
  {s:"Florida State",t:335.83,a:27.99,w:12},
  {s:"Rutgers",t:331.76,a:27.65,w:12},
  {s:"Oklahoma",t:329.89,a:27.49,w:12},
  {s:"BYU",t:329.02,a:27.42,w:12},
  {s:"Texas",t:327.09,a:27.26,w:12},
  {s:"Washington",t:318.37,a:26.53,w:12},
  {s:"Duke",t:315.39,a:26.28,w:12},
  {s:"Georgia",t:314.44,a:26.20,w:12},
  {s:"Utah",t:313.17,a:26.10,w:12},
  {s:"Kansas",t:311.52,a:25.96,w:12},
  {s:"TCU",t:310.68,a:25.89,w:12},
  {s:"Mississippi State",t:308.39,a:25.70,w:12},
  {s:"Auburn",t:307.41,a:25.62,w:12},
];

const RECAP_RBs: RecapUnit[] = [
  {s:"Notre Dame",t:275.03,a:22.92,w:12},
  {s:"Michigan",t:263.40,a:21.95,w:12},
  {s:"Penn State",t:263.06,a:21.92,w:12},
  {s:"Rutgers",t:234.86,a:19.57,w:12},
  {s:"Texas Tech",t:228.75,a:19.06,w:12},
  {s:"Ole Miss",t:227.58,a:18.97,w:12},
  {s:"Missouri",t:223.02,a:18.59,w:12},
  {s:"Nebraska",t:221.89,a:18.49,w:12},
  {s:"Oregon",t:218.10,a:18.18,w:12},
  {s:"Texas A&M",t:204.75,a:17.06,w:12},
  {s:"Tennessee",t:200.96,a:16.75,w:12},
  {s:"Washington",t:197.19,a:16.43,w:12},
  {s:"USC",t:196.84,a:16.40,w:12},
  {s:"Indiana",t:196.21,a:16.35,w:12},
  {s:"Ohio State",t:191.58,a:15.97,w:12},
  {s:"Vanderbilt",t:183.87,a:15.32,w:12},
  {s:"Florida",t:182.16,a:15.18,w:12},
  {s:"Miami",t:178.15,a:14.85,w:12},
  {s:"Duke",t:177.31,a:14.78,w:12},
  {s:"Virginia",t:177.01,a:14.75,w:12},
  {s:"Arkansas",t:175.35,a:14.61,w:12},
  {s:"Northwestern",t:174.18,a:14.52,w:12},
  {s:"Liberty",t:173.48,a:14.46,w:12},
  {s:"Iowa State",t:173.43,a:14.45,w:12},
  {s:"BYU",t:173.25,a:14.44,w:12},
];

const RECAP_WRs: RecapUnit[] = [
  {s:"USC",t:238.69,a:19.89,w:12},
  {s:"Indiana",t:231.99,a:19.33,w:12},
  {s:"TCU",t:223.98,a:18.67,w:12},
  {s:"Ohio State",t:223.12,a:18.59,w:12},
  {s:"Tennessee",t:222.23,a:18.52,w:12},
  {s:"Alabama",t:214.39,a:17.87,w:12},
  {s:"Rutgers",t:213.40,a:17.78,w:12},
  {s:"Texas A&M",t:209.03,a:17.42,w:12},
  {s:"Florida State",t:202.68,a:16.89,w:12},
  {s:"Baylor",t:199.58,a:16.63,w:12},
  {s:"Miami",t:198.61,a:16.55,w:12},
  {s:"Oklahoma",t:191.80,a:15.98,w:12},
  {s:"South Carolina",t:184.26,a:15.36,w:12},
  {s:"BYU",t:180.87,a:15.07,w:12},
  {s:"Ole Miss",t:180.58,a:15.05,w:12},
  {s:"Clemson",t:179.98,a:15.00,w:12},
  {s:"Texas",t:179.93,a:14.99,w:12},
  {s:"Colorado",t:178.24,a:14.85,w:12},
  {s:"Washington",t:177.57,a:14.80,w:12},
  {s:"Cincinnati",t:176.42,a:14.70,w:12},
  {s:"Louisville",t:172.42,a:14.37,w:12},
  {s:"Illinois",t:170.33,a:14.19,w:12},
  {s:"Mississippi State",t:168.21,a:14.02,w:12},
  {s:"Vanderbilt",t:166.46,a:13.87,w:12},
  {s:"Duke",t:161.23,a:13.44,w:12},
];

const RECAP_TEs: RecapUnit[] = [
  {s:"Vanderbilt",t:108.23,a:9.02,w:12},
  {s:"Kansas",t:98.86,a:8.24,w:12},
  {s:"Oregon",t:96.56,a:8.05,w:12},
  {s:"Arkansas",t:93.40,a:7.78,w:12},
  {s:"Utah",t:92.44,a:7.70,w:12},
  {s:"Baylor",t:89.92,a:7.49,w:12},
  {s:"NC State",t:82.53,a:6.88,w:12},
  {s:"LSU",t:81.64,a:6.80,w:12},
  {s:"Wisconsin",t:76.02,a:6.34,w:12},
  {s:"Iowa State",t:75.61,a:6.30,w:12},
  {s:"Boston College",t:74.37,a:6.20,w:12},
  {s:"USC",t:73.63,a:6.14,w:12},
  {s:"Kansas State",t:73.20,a:6.10,w:12},
  {s:"UCF",t:72.65,a:6.05,w:12},
  {s:"Florida State",t:70.44,a:5.87,w:12},
  {s:"Michigan State",t:69.40,a:5.78,w:12},
  {s:"Ole Miss",t:68.81,a:5.73,w:12},
  {s:"Duke",t:67.29,a:5.61,w:12},
  {s:"Alabama",t:65.58,a:5.47,w:12},
  {s:"Houston",t:62.82,a:5.24,w:12},
  {s:"Tennessee",t:62.60,a:5.22,w:12},
  {s:"Ohio State",t:62.31,a:5.19,w:12},
  {s:"Mississippi State",t:61.68,a:5.61,w:11},
  {s:"SMU",t:59.96,a:5.00,w:12},
  {s:"Pittsburgh",t:58.75,a:4.90,w:12},
];

const RECAP_DEFs: RecapUnit[] = [
  {s:"Indiana",t:135.80,a:11.32,w:12},
  {s:"Texas Tech",t:126.20,a:10.52,w:12},
  {s:"Oklahoma",t:125.00,a:10.42,w:12},
  {s:"Oregon",t:121.40,a:10.12,w:12},
  {s:"Notre Dame",t:120.60,a:10.05,w:12},
  {s:"Miami",t:115.40,a:9.62,w:12},
  {s:"Ohio State",t:115.10,a:9.59,w:12},
  {s:"Alabama",t:114.70,a:9.56,w:12},
  {s:"BYU",t:113.00,a:9.42,w:12},
  {s:"Pittsburgh",t:111.70,a:9.31,w:12},
  {s:"Texas",t:111.40,a:9.28,w:12},
  {s:"South Carolina",t:109.60,a:9.13,w:12},
  {s:"Iowa",t:102.60,a:8.55,w:12},
  {s:"LSU",t:100.90,a:8.41,w:12},
  {s:"Kansas State",t:98.00,a:8.17,w:12},
  {s:"Utah",t:95.10,a:7.93,w:12},
  {s:"Maryland",t:93.80,a:7.82,w:12},
  {s:"Missouri",t:93.70,a:7.81,w:12},
  {s:"SMU",t:92.80,a:7.73,w:12},
  {s:"Texas A&M",t:92.70,a:7.73,w:12},
  {s:"Tennessee",t:92.60,a:7.72,w:12},
  {s:"Wisconsin",t:91.00,a:7.58,w:12},
  {s:"Minnesota",t:89.50,a:8.14,w:11},
  {s:"Wake Forest",t:85.70,a:7.14,w:12},
  {s:"Clemson",t:85.40,a:7.12,w:12},
];

const RECAP_Ks: RecapUnit[] = [
  {s:"Ole Miss",t:92.90,a:7.74,w:12},
  {s:"Oklahoma",t:84.10,a:7.01,w:12},
  {s:"BYU",t:82.30,a:6.86,w:12},
  {s:"Texas A&M",t:81.50,a:6.79,w:12},
  {s:"Oregon",t:80.80,a:6.73,w:12},
  {s:"Indiana",t:80.60,a:6.72,w:12},
  {s:"LSU",t:80.50,a:6.71,w:12},
  {s:"Georgia Tech",t:79.80,a:6.65,w:12},
  {s:"Ohio State",t:77.80,a:6.48,w:12},
  {s:"Iowa",t:76.70,a:6.39,w:12},
  {s:"Michigan",t:74.80,a:6.23,w:12},
  {s:"Arkansas",t:74.10,a:6.18,w:12},
  {s:"Tennessee",t:74.00,a:6.17,w:12},
  {s:"Texas",t:73.80,a:6.15,w:12},
  {s:"Alabama",t:73.20,a:6.10,w:12},
  {s:"Baylor",t:72.70,a:6.61,w:11},
  {s:"Louisville",t:71.40,a:5.95,w:12},
  {s:"Nebraska",t:70.30,a:5.86,w:12},
  {s:"Arizona",t:70.20,a:5.85,w:12},
  {s:"Texas Tech",t:70.10,a:5.84,w:12},
  {s:"Auburn",t:70.00,a:5.83,w:12},
  {s:"USC",t:69.80,a:6.35,w:11},
  {s:"Pittsburgh",t:69.70,a:5.81,w:12},
  {s:"Illinois",t:69.60,a:5.80,w:12},
  {s:"Vanderbilt",t:69.40,a:5.78,w:12},
];

const ALL_RECAP_UNITS: RecapUnitWithPos[] = [
  ...RECAP_QBs.map(u => ({ ...u, pos: 'QB' })),
  ...RECAP_RBs.map(u => ({ ...u, pos: 'RB' })),
  ...RECAP_WRs.map(u => ({ ...u, pos: 'WR' })),
  ...RECAP_TEs.map(u => ({ ...u, pos: 'TE' })),
  ...RECAP_DEFs.map(u => ({ ...u, pos: 'DEF' })),
  ...RECAP_Ks.map(u => ({ ...u, pos: 'K' })),
].sort((a, b) => b.t - a.t);

const RECAP_TOP100 = ALL_RECAP_UNITS.slice(0, 100);

const POS_COLOR: Record<string, string> = {
  QB: '#e84545', RB: '#2d7fe0', WR: '#d4a020', TE: '#9b56e0', DEF: '#0db874', K: '#f07820',
};

// ── Best Value Modal ──────────────────────────────────────────────────────────

const GREEN = '#15c678';

type ValueUnit = {
  school: string; player?: string; pos?: string; badge: 'TOP VALUE' | 'SLEEPER' | 'SURPRISE';
  avgWk: number; barPct: number; stat?: string; why: string;
};

const BV_SECTIONS: { pos: string; color: string; title: string; units: ValueUnit[] }[] = [
  {
    pos: 'QB', color: '#e84545', title: 'Quarterback',
    units: [
      { school: 'Vanderbilt',   player: 'Diego Pavia',       badge: 'TOP VALUE', avgWk: 36.1, barPct: 100, stat: '3,247 YDS · 28 TD',
        why: "Nobody saw this coming. Diego Pavia's dual-threat ability and the Commodores' surprising offensive efficiency made Vanderbilt the #1 fantasy QB unit in the country. In a season full of surprises, this was the biggest." },
      { school: 'Baylor',       player: 'Sawyer Robertson',  badge: 'SLEEPER',   avgWk: 31.9, barPct: 88,  stat: '3,681 YDS · 26 TD',
        why: "Robertson posted 3,681 passing yards and quietly ran one of the most efficient Big 12 offenses. At 31.9 avg/wk, the ROI was massive. He was the definition of a sleeper — flying under the radar while producing starter-level numbers all season long." },
      { school: 'Georgia Tech', player: 'Haynes King',        badge: 'SURPRISE',  avgWk: 29.1, barPct: 80,  stat: '3,102 YDS · 24 TD',
        why: "Haynes King ran a modernized offense with massive efficiency numbers. At 29.1 avg/wk, Georgia Tech QB went unowned in most leagues yet delivered top-10 QB fantasy production week after week. The biggest surprise in the ACC in 2025." },
    ],
  },
  {
    pos: 'RB', color: '#2d7fe0', title: 'Running Back',
    units: [
      { school: 'Notre Dame', player: 'Jeremiyah Love',   badge: 'TOP VALUE', avgWk: 22.9, barPct: 100, stat: '1,372 YDS · 14 TD',
        why: "Love carried the entire Notre Dame rushing attack on his back. 1,372 yards, 14 touchdowns, 22.9 pts/wk. Week after week, the Fighting Irish fed Love until defenses had no answer. The most reliable RB unit in college fantasy in 2025." },
      { school: 'Rutgers',    player: 'Antwan Raymond',   badge: 'SLEEPER',   avgWk: 19.6, barPct: 86,  stat: '1,241 YDS · 11 TD',
        why: "Raymond surprised everyone. 1,241 yards in a Rutgers offense that nobody expected to produce. At 19.6 avg/wk with essentially zero ownership cost in most leagues, this was the RB steal of the year. Nobody saw Rutgers RB coming." },
      { school: 'Missouri',   player: 'Ahmad Hardy',      badge: 'SURPRISE',  avgWk: 18.6, barPct: 81,  stat: '1,560 YDS · 12 TD',
        why: "Hardy had 1,560 total yards in the SEC and averaged 18.6 pts/wk. The Tigers ran a balanced attack that gave Hardy both rushing and receiving opportunities every week. Putting up those numbers against SEC defenses all season was genuinely impressive." },
    ],
  },
  {
    pos: 'WR', color: '#d4a020', title: 'Wide Receiver',
    units: [
      { school: 'USC',     player: 'Makai Lemon',     badge: 'TOP VALUE', avgWk: 19.9, barPct: 100, stat: '1,156 YDS · 9 TD',
        why: "Lemon exploded in year 2 as the unquestioned WR1 for USC. 1,156 yards, 9 touchdowns, 19.9 avg/wk. Lincoln Riley's system produced another elite WR fantasy season and Lemon was the clear alpha all year long. One of the best WR performances of 2025." },
      { school: 'TCU',     player: 'Eric McAlister',  badge: 'SLEEPER',   avgWk: 18.7, barPct: 94,  stat: '1,121 YDS · 8 TD',
        why: "McAlister was the best receiver nobody talked about. 1,121 yards, 18.7 avg/wk. TCU's pass-heavy system generated massive volume all season and McAlister soaked it up. He was a free square — costing almost nothing while delivering starter-level production every week." },
      { school: 'Rutgers', player: 'KJ Duff',         badge: 'SURPRISE',  avgWk: 17.8, barPct: 89,  stat: '1,084 YDS · 7 TD',
        why: "Duff joined Antwan Raymond to make Rutgers the biggest surprise two-for-one school of the 2025 season. 1,084 yards at WR in an offense the fantasy world kept underrating. Both the RB and WR units were elite — if you started Rutgers, you won." },
    ],
  },
  {
    pos: 'DEF', color: '#15c678', title: 'Defense',
    units: [
      { school: 'Indiana',    badge: 'TOP VALUE', avgWk: 11.3, barPct: 100, stat: '#1 nationally · 11.3 avg/wk',
        why: "The Indiana defense was historically great in 2025. 11.3 pts/wk — #1 in the nation by adjusted fantasy points. Curt Cignetti built an elite unit at every level: pass rush, coverage, and ball-hawking. The Hoosiers' defensive dominance was the most consistent story of the entire 2025 season." },
      { school: 'Texas Tech', badge: 'SLEEPER',   avgWk: 10.5, barPct: 93,  stat: '#2 nationally · 10.5 avg/wk',
        why: "Texas Tech's defense finished #2 nationally at 10.5 avg/wk. The Red Raiders generated havoc all season with a rotating defensive line that produced consistent sacks and turnovers. Nobody expected a Big 12 defense to rank this high — and yet here we are." },
    ],
  },
];

const BV_QUICK = [
  { label: 'Vanderbilt TE',              val: '9.0 avg/wk' },
  { label: 'Kansas TE',                  val: '8.2 avg/wk' },
  { label: 'Cincinnati QB',              val: '29.2 avg/wk' },
  { label: 'Nebraska RB – Emmett Johnson', val: '1,451 YDS · 18.5/wk' },
  { label: 'FSU WR – Duce Robinson',      val: '1,074 YDS · 16.9/wk' },
  { label: 'Ole Miss K – Lucas Carneiro', val: '7.7 avg/wk' },
];

const BADGE_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  'TOP VALUE': { bg: 'rgba(21,198,120,.15)', border: 'rgba(21,198,120,.4)', color: GREEN },
  'SLEEPER':   { bg: 'rgba(245,166,35,.12)', border: 'rgba(245,166,35,.35)', color: '#f5a623' },
  'SURPRISE':  { bg: 'rgba(168,85,247,.12)', border: 'rgba(168,85,247,.35)', color: '#c084fc' },
};

function BestValueModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 16, width: '100%', maxWidth: 820, position: 'relative' }}>

        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%', background: C.surf2, border: `1px solid ${C.border}`, cursor: 'pointer', color: C.sub, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>✕</button>

        {/* Hero */}
        <div style={{ background: 'linear-gradient(135deg,#061a0e 0%,#0a1f14 50%,#061a0e 100%)', borderRadius: '16px 16px 0 0', padding: '40px 36px 32px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'inline-block', padding: '2px 10px', background: 'rgba(21,198,120,.15)', border: `1px solid ${GREEN}55`, borderRadius: 20, fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: GREEN, textTransform: 'uppercase', marginBottom: 12 }}>
            🏆 2025 Season Recap · Hidden Gems
          </div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 26, color: C.text, letterSpacing: 0.5, lineHeight: 1.15, marginBottom: 10 }}>
            2025 Most Surprising Units<br />The Season's Hidden Gems
          </div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 24, maxWidth: 580 }}>
            These units defied expectations in 2025, outperforming their perceived talent level week after week. Here are the units that proved the college football world wrong.
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[['73','Schools'],['14','Weeks'],['Real','FPTS Data'],['6','Positions']].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 24, color: GREEN, lineHeight: 1 }}>{n}</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '28px 36px' }}>

          {/* Position sections */}
          {BV_SECTIONS.map(sec => (
            <div key={sec.pos} style={{ marginBottom: 36 }}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ padding: '3px 12px', background: sec.color + '22', border: `1px solid ${sec.color}55`, borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1.5, color: sec.color, textTransform: 'uppercase' as const }}>{sec.pos}</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase' as const }}>{sec.title}</div>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>

              {/* Unit picks */}
              {sec.units.map((u, i) => {
                const bs = BADGE_STYLE[u.badge];
                return (
                  <div key={i} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12, borderLeft: `3px solid ${sec.color}` }}>
                    {/* Card header */}
                    <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      {/* Rank */}
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: sec.color + '22', border: `1px solid ${sec.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 13, color: sec.color, flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 3 }}>
                          <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, letterSpacing: 0.5 }}>{u.school}</span>
                          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, color: bs.color, background: bs.bg, border: `1px solid ${bs.border}`, borderRadius: 10, padding: '2px 8px', textTransform: 'uppercase' as const }}>{u.badge}</span>
                          {u.player && <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub }}>· {u.player}</span>}
                        </div>
                        {u.stat && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>{u.stat}</div>}
                        {/* Value bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 5, background: C.surf3, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${u.barPct}%`, height: '100%', background: `linear-gradient(90deg,${sec.color}88,${sec.color})`, borderRadius: 3 }} />
                          </div>
                          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: sec.color, lineHeight: 1, flexShrink: 0 }}>{u.avgWk.toFixed(1)}</div>
                          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' as const, flexShrink: 0 }}>avg/wk</div>
                        </div>
                      </div>
                    </div>
                    {/* Why callout */}
                    <div style={{ margin: '0 14px 14px', padding: '10px 12px', background: 'rgba(21,198,120,.06)', border: `1px solid ${GREEN}28`, borderRadius: 7 }}>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1.5, color: GREEN, textTransform: 'uppercase' as const, marginBottom: 4 }}>💡 Why They Surprised in 2025</div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub, lineHeight: 1.65 }}>{u.why}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Quick hits */}
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 14 }}>⚡ Also Worth Targeting</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 32 }}>
            {BV_QUICK.map((q, i) => (
              <div key={i} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.text, fontWeight: 600, minWidth: 0 }}>{q.label}</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: GREEN, flexShrink: 0, letterSpacing: 0.5 }}>{q.val}</div>
              </div>
            ))}
          </div>

          {/* Key takeaways */}
          <div style={{ background: 'rgba(21,198,120,.06)', border: `1px solid ${GREEN}33`, borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: GREEN, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>Key Takeaways from 2025</div>
            {[
              'Power conference defenses dominated — Indiana and Texas Tech proved elite DEF units can carry a fantasy roster.',
              'Rutgers was the sleeper of the year — both RB and WR units outperformed everyone\'s expectations.',
              'Vanderbilt QB was historically underowned relative to their output. The biggest value gap in the entire dataset.',
              'SEC competition didn\'t stop Hardy (Missouri) or Pavia (Vanderbilt) from posting elite weekly numbers.',
              'The best fantasy units in 2025 came from programs nobody expected. The data doesn\'t lie.',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < 4 ? 10 : 0 }}>
                <div style={{ color: GREEN, fontFamily: 'Anton,sans-serif', fontSize: 13, flexShrink: 0, marginTop: 1 }}>→</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.6 }}>{t}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textAlign: 'center' }}>
            College Units Fantasy · 2025 Season Analysis · June 15, 2026
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Season Recap Modal ────────────────────────────────────────────────────────

function SeasonRecapModal({ onClose }: { onClose: () => void }) {
  const [activePos, setActivePos] = useState<string>('QB');
  const posData: Record<string, RecapUnit[]> = { QB: RECAP_QBs, RB: RECAP_RBs, WR: RECAP_WRs, TE: RECAP_TEs, DEF: RECAP_DEFs, K: RECAP_Ks };
  const rows = posData[activePos] ?? [];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflowY: 'auto', padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surf, border: `1px solid ${C.border}`, borderRadius: 16,
          width: '100%', maxWidth: 860, position: 'relative',
          fontFamily: "'Space Grotesk',sans-serif",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16, width: 32, height: 32,
            borderRadius: '50%', background: C.surf2, border: `1px solid ${C.border}`,
            cursor: 'pointer', color: C.sub, fontSize: 16, display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1,
          }}
        >✕</button>

        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg,#0a1828 0%,#0d1f36 50%,#0a1828 100%)',
          borderRadius: '16px 16px 0 0', padding: '40px 36px 32px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 3, color: C.gold, textTransform: 'uppercase', marginBottom: 12 }}>
            🏆 Season Recap · 2025
          </div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, color: C.text, letterSpacing: 0.5, lineHeight: 1.15, marginBottom: 10 }}>
            2025 College Football Season<br />by the Numbers
          </div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 24, maxWidth: 560 }}>
            We tracked every unit across 73 FBS schools through 14 weeks of the 2025 season.
            Vanderbilt QB ran away with the #1 overall ranking at 432.9 total FPTS.
          </div>
          {/* Stats banner */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[['73', 'Schools Tracked'], ['14', 'Weeks Tracked'], ['438', 'Units Ranked'], ['432.9', 'Top Unit FPTS']].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 26, color: C.gold, lineHeight: 1 }}>{n}</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '28px 36px' }}>

          {/* Position Leaders */}
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 14 }}>
            Position Leaders — Top 25
          </div>

          {/* Position tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {['QB','RB','WR','TE','DEF','K'].map(pos => (
              <button
                key={pos}
                onClick={() => setActivePos(pos)}
                style={{
                  padding: '5px 14px', borderRadius: 6, border: `1px solid ${activePos === pos ? POS_COLOR[pos] : C.border}`,
                  background: activePos === pos ? POS_COLOR[pos] + '22' : C.surf2,
                  cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
                  color: activePos === pos ? POS_COLOR[pos] : C.sub,
                }}
              >{pos}</button>
            ))}
          </div>

          {/* Position table */}
          <div style={{ background: C.surf2, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['#','School','Avg/Wk','Season Pts'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === '#' ? 'center' : 'left', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((u, i) => (
                  <tr key={u.s} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                    <td style={{ padding: '9px 14px', textAlign: 'center', fontFamily: 'Anton,sans-serif', fontSize: 13, color: i < 3 ? C.gold : C.muted }}>{i + 1}</td>
                    <td style={{ padding: '9px 14px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: C.text }}>{u.s}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.sub }}>{u.a.toFixed(1)}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'Anton,sans-serif', fontSize: 14, color: POS_COLOR[activePos] }}>{u.t.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top 100 Overall */}
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 14 }}>
            Top 100 Overall Units
          </div>
          <div style={{ background: C.surf2, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['#','School','Pos','Avg/Wk','Season Pts'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === '#' ? 'center' : 'left', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RECAP_TOP100.map((u, i) => (
                  <tr key={`${u.s}-${u.pos}`} style={{ borderBottom: i < 99 ? `1px solid ${C.border}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                    <td style={{ padding: '8px 14px', textAlign: 'center', fontFamily: 'Anton,sans-serif', fontSize: 12, color: i < 3 ? C.gold : C.muted }}>{i + 1}</td>
                    <td style={{ padding: '8px 14px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: C.text }}>{u.s}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ background: POS_COLOR[u.pos] + '22', border: `1px solid ${POS_COLOR[u.pos]}66`, borderRadius: 4, padding: '2px 7px', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: POS_COLOR[u.pos] }}>{u.pos}</span>
                    </td>
                    <td style={{ padding: '8px 14px', fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.sub }}>{u.a.toFixed(1)}</td>
                    <td style={{ padding: '8px 14px', fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.gold }}>{u.t.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textAlign: 'center' }}>
            College Units Fantasy · 2025 Season Data · Updated June 12, 2026
          </div>
        </div>
      </div>
    </div>
  );
}

// ── VideoModal ────────────────────────────────────────────────────────────────

function VideoModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 900 }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', color: '#e8edf5', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}
        >✕</button>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={CUF_VIDEO.src}
          controls
          autoPlay
          style={{ width: '100%', borderRadius: 10, display: 'block', background: '#000' }}
        />
      </div>
    </div>
  );
}

// ── NewsSection ───────────────────────────────────────────────────────────────

const FEATURED = {
  headline: 'College Units Fantasy: Draft Your Team Before Week 1',
  summary:  'The 2025 college football season kicks off in August. Build your roster now, lock in your lineup, and compete all season long.',
  date:     'June 10, 2026',
};

const NEWS = [
  { headline: 'Top 10 RB Units to Target in Your Draft',      summary: 'These backfields are primed for big seasons based on returning starters and O-line talent.',    date: 'June 9, 2026'  },
  { headline: 'Salary Cap Strategy Guide for 2025',            summary: 'How to build a winning roster on a $200 budget — sleeper units and value picks.',               date: 'June 8, 2026'  },
  { headline: "Conference Championship Odds: Who's Favored?",  summary: 'Early projections for every Power 4 conference — and which units to invest in.',               date: 'June 7, 2026'  },
];

const CUF_VIDEO = {
  title:       'How College Units Fantasy Works — 2025 Season Breakdown',
  description: 'Unit scoring system + ODR multiplier explained with real game footage',
  duration:    '1:28',
  src:         '/videos/cuf_intro.mp4',
};

function NewsSection() {
  const [showRecap,      setShowRecap]      = useState(false);
  const [showVideo,      setShowVideo]      = useState(false);
  const [showBestValue,  setShowBestValue]  = useState(false);
  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', height: '100%' }}>

      {showRecap     && <SeasonRecapModal onClose={() => setShowRecap(false)} />}
      {showVideo     && <VideoModal       onClose={() => setShowVideo(false)} />}
      {showBestValue && <BestValueModal   onClose={() => setShowBestValue(false)} />}

      {/* Season Recap featured card */}
      <div
        onClick={() => setShowRecap(true)}
        style={{
          background: 'linear-gradient(135deg,#0d1827,#131d30)',
          border: '1px solid rgba(212,168,40,.5)', borderLeft: '4px solid #d4a828',
          borderRadius: 12, padding: '20px 18px', marginBottom: 12,
          position: 'relative', overflow: 'hidden', cursor: 'pointer',
          transition: 'border-color .15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(212,168,40,.9)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(212,168,40,.5)'; }}
      >
        <div style={{ position: 'absolute', top: 0, right: 0, width: 120, height: '100%', background: 'linear-gradient(135deg,rgba(212,168,40,.07),transparent)', pointerEvents: 'none' }} />
        <div style={{ display: 'inline-block', padding: '2px 9px', background: 'rgba(212,168,40,.18)', border: '1px solid rgba(212,168,40,.5)', borderRadius: 20, fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 10 }}>
          🏆 Season Recap
        </div>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 19, color: C.text, letterSpacing: 0.5, lineHeight: 1.2, marginBottom: 8 }}>
          2025 College Football Season by the Numbers
        </div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>
          We tracked every unit across 73 FBS schools. Vanderbilt QB was the #1 fantasy unit. See the full Top 100 rankings.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>June 12, 2026 · College Units Fantasy</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.gold, letterSpacing: 0.5 }}>Read Full Article →</div>
        </div>
      </div>

      {/* Best Value card */}
      <div
        onClick={() => setShowBestValue(true)}
        style={{
          background: 'linear-gradient(135deg,#061a0e,#0a1f14)',
          border: '1px solid rgba(21,198,120,.4)', borderLeft: `4px solid ${GREEN}`,
          borderRadius: 12, padding: '20px 18px', marginBottom: 12,
          position: 'relative', overflow: 'hidden', cursor: 'pointer',
          transition: 'border-color .15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(21,198,120,.85)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(21,198,120,.4)'; }}
      >
        <div style={{ position: 'absolute', top: 0, right: 0, width: 120, height: '100%', background: `linear-gradient(135deg,rgba(21,198,120,.05),transparent)`, pointerEvents: 'none' }} />
        <div style={{ display: 'inline-block', padding: '2px 9px', background: 'rgba(21,198,120,.15)', border: `1px solid rgba(21,198,120,.45)`, borderRadius: 20, fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: GREEN, textTransform: 'uppercase', marginBottom: 10 }}>
          📈 2025 ANALYSIS
        </div>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 19, color: C.text, letterSpacing: 0.5, lineHeight: 1.2, marginBottom: 8 }}>
          2025's Most Surprising Units — The Hidden Gems of College Fantasy
        </div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>
          Vanderbilt QB was #1 in the country. Rutgers showed up twice. Indiana DEF dominated. The 2025 season was full of surprises — here's what the data showed.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>June 13, 2026 · College Units Fantasy</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: GREEN, letterSpacing: 0.5 }}>Read Full Article →</div>
        </div>
      </div>

      {/* Original featured */}
      <div style={{
        background: 'linear-gradient(135deg,#0d1827,#131d30)',
        border: `1px solid rgba(212,168,40,.35)`, borderRadius: 12,
        padding: '20px 18px', marginBottom: 16, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 140, height: '100%', background: 'linear-gradient(135deg,rgba(212,168,40,.06),transparent)', pointerEvents: 'none' }} />
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>
          ⭐ Featured
        </div>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 0.5, lineHeight: 1.2, marginBottom: 8 }}>
          {FEATURED.headline}
        </div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>
          {FEATURED.summary}
        </div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>{FEATURED.date}</div>
      </div>

      {/* News grid */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>
          Latest News
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {NEWS.map((story, i) => (
            <div key={i}
              style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 11px', cursor: 'pointer', transition: 'border-color .12s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,168,40,.4)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
            >
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 600, color: C.text, lineHeight: 1.35, marginBottom: 5 }}>
                {story.headline}
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.sub, lineHeight: 1.5, marginBottom: 7 }}>
                {story.summary}
              </div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1 }}>{story.date}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Videos */}
      <div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>
          Videos
        </div>
        <div
          onClick={() => setShowVideo(true)}
          style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', transition: 'border-color .12s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,168,40,.4)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
        >
          <div style={{ height: 100, background: 'linear-gradient(135deg,#0d1827,#1e2d47)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(212,168,40,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: C.bg }}>▶</div>
            <span style={{ position: 'absolute', bottom: 7, right: 9, fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, background: 'rgba(0,0,0,.5)', padding: '2px 6px', borderRadius: 4 }}>{CUF_VIDEO.duration}</span>
          </div>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.35, marginBottom: 4 }}>{CUF_VIDEO.title}</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.sub, lineHeight: 1.5 }}>{CUF_VIDEO.description}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

type MobileTab = 'scores' | 'news' | 'fantasy' | 'profile';

const MOBILE_NAV: { key: MobileTab; icon: string; label: string }[] = [
  { key: 'scores',  icon: '🏈', label: 'Scores'  },
  { key: 'news',    icon: '📰', label: 'News'    },
  { key: 'fantasy', icon: '🏆', label: 'Fantasy' },
  { key: 'profile', icon: '👤', label: 'Profile' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [view,        setView]        = useState<View>('landing');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joinCode,    setJoinCode]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [message,     setMessage]     = useState<string | null>(null);
  const [user,        setUser]        = useState<any>(null);
  const { balance: walletBalance } = useWallet();
  const [leagues,      setLeagues]     = useState<any[]>([]);
  const [bracketCount, setBracketCount] = useState(0);
  const [showWallet,   setShowWallet]   = useState(false);
  const [locks, setLocks] = useState({ public_leagues: false, bracket_contests: false, create_season_league: false, create_bracket: false });
  const [showIntro,    setShowIntro]    = useState(false);
  const [introChecked, setIntroChecked] = useState(false);
  const [showAgeModal,   setShowAgeModal]   = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isMobile,     setIsMobile]     = useState(false);
  const [showForgot,   setShowForgot]   = useState(false);
  const [mobileTab,    setMobileTab]    = useState<MobileTab>('scores');
  const [mobileAuth,   setMobileAuth]   = useState<'signin' | 'signup'>('signin');
  const [showRecap,      setShowRecap]      = useState(false);
  const [showVideo,      setShowVideo]      = useState(false);
  const [showBestValue,  setShowBestValue]  = useState(false);

  const handleNavTab = (tab: string) => {
    setShowRecap(false);
    setShowBestValue(false);
    setMobileTab(tab as MobileTab);
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    try {
      const seen = sessionStorage.getItem('cuf_intro_seen');
      if (!seen) setShowIntro(true);
    } catch {}
    setIntroChecked(true);
  }, []);

  function handleIntroComplete() {
    try { sessionStorage.setItem('cuf_intro_seen', '1'); } catch {}
    setShowIntro(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadLeagues(session.user.id);
        checkCompliance(session.user.id);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadLeagues(session.user.id);
        checkCompliance(session.user.id);
      } else {
        setUser(null);
        setView('landing');
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = user?.email === 'whb21burton@gmail.com';

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('platform_settings').select('key, value')
      .in('key', ['public_leagues_locked', 'bracket_contests_locked', 'create_season_league_locked', 'create_bracket_locked'])
      .then(({ data }) => {
        const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value === 'true']));
        setLocks({
          public_leagues:       map['public_leagues_locked']       ?? false,
          bracket_contests:     map['bracket_contests_locked']     ?? false,
          create_season_league: map['create_season_league_locked'] ?? false,
          create_bracket:       map['create_bracket_locked']       ?? false,
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function toggleLock(key: string, current: boolean) {
    await supabase.from('platform_settings')
      .upsert({ key, value: (!current).toString(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    const keyToField: Record<string, keyof typeof locks> = {
      public_leagues_locked:       'public_leagues',
      bracket_contests_locked:     'bracket_contests',
      create_season_league_locked: 'create_season_league',
      create_bracket_locked:       'create_bracket',
    };
    const field = keyToField[key];
    if (field) setLocks(prev => ({ ...prev, [field]: !current }));
  }

  async function checkCompliance(userId: string) {
    const { data: verification } = await supabase
      .from('user_verifications').select('is_age_verified').eq('user_id', userId).single();
    if (!verification?.is_age_verified) { setShowAgeModal(true); return; }
    const { data: terms } = await supabase
      .from('user_terms_acceptance').select('id').eq('user_id', userId).eq('terms_version', '1.0').single();
    if (!terms) { setShowTermsModal(true); return; }
    setView('dashboard');
  }

  async function loadLeagues(userId: string) {
    const [{ data: members }, { count }] = await Promise.all([
      supabase.from('league_members').select('league_id, leagues(*)').eq('user_id', userId),
      supabase.from('user_bracket_entries').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    if (members) setLeagues(members.map((d: any) => d.leagues).filter(Boolean));
    setBracketCount(count ?? 0);
  }

  async function handleSignIn() {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleSignUp() {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) setError(error.message);
    else setMessage('Check your email to confirm your account.');
    setLoading(false);
  }

  async function handleForgotPassword() {
    setLoading(true); setError(null); setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://collegeunitsfantasy.com/reset-password',
    });
    setLoading(false);
    if (error) setError(error.message);
    else setMessage('Check your email for a password reset link.');
  }

  async function handleJoin() {
    setLoading(true); setError(null);
    const code = joinCode.trim().toUpperCase();
    const { data: league } = await supabase.from('leagues').select('id, name, league_size').eq('invite_code', code).single();
    if (!league) { setError('Invalid invite code.'); setLoading(false); return; }
    router.push(`/join/${code}`);
    setLoading(false);
  }

  async function signOut() { await supabase.auth.signOut(); }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 13px',
    background: C.surf2, border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.text,
    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
    outline: 'none', marginBottom: 10,
  };

  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '12px',
    background: `linear-gradient(135deg,${C.gold},${C.goldLight})`,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontFamily: "'Anton',sans-serif", fontSize: 13,
    letterSpacing: 2, textTransform: 'uppercase', color: C.bg,
    marginBottom: 0,
  };

  if (!introChecked) return null;

  // Right column content — determined by view + user state
  const showLoggedIn  = !!user && (view === 'dashboard' || view === 'landing');
  const showLoggedOut = !user && view === 'landing';
  const userName      = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? '';

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────────────
  if (isMobile) {
    const navBg   = '#0c1422';
    const navBdr  = '#1a2b40';
    const gold    = '#f5a623';
    const gray    = '#4a5d7a';

    return (
      <>
        {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}
        <style>{`* { box-sizing: border-box; } input:focus { outline: none !important; border-color: ${gold} !important; }`}</style>
        <div style={{ background: C.bg, color: C.text, height: '100dvh', display: 'flex', flexDirection: 'column' }}>

          {/* ── Scrollable content area ── */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* SCORES */}
            {mobileTab === 'scores' && <LiveScoreboard />}

            {/* NEWS */}
            {mobileTab === 'news' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 80px' }}>
                {showRecap      && <SeasonRecapModal onClose={() => setShowRecap(false)} />}
                {showVideo      && <VideoModal       onClose={() => setShowVideo(false)} />}
                {showBestValue  && <BestValueModal   onClose={() => setShowBestValue(false)} />}
                {/* Season Recap card */}
                <div
                  onClick={() => setShowRecap(true)}
                  style={{ background: 'linear-gradient(135deg,#0d1827,#131d30)', border: '1px solid rgba(212,168,40,.5)', borderLeft: '4px solid #d4a828', borderRadius: 12, padding: '16px', marginBottom: 12, cursor: 'pointer' }}>
                  <div style={{ display: 'inline-block', padding: '2px 9px', background: 'rgba(212,168,40,.18)', border: '1px solid rgba(212,168,40,.4)', borderRadius: 20, fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: gold, textTransform: 'uppercase', marginBottom: 9 }}>🏆 Season Recap</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, color: C.text, lineHeight: 1.2, marginBottom: 7 }}>2025 College Football Season by the Numbers</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.5, marginBottom: 10 }}>Vanderbilt QB was the #1 fantasy unit. See full Top 100 rankings.</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: gold, letterSpacing: 0.5 }}>Read Full Article →</div>
                </div>
                {/* Best Value card */}
                <div
                  onClick={() => setShowBestValue(true)}
                  style={{ background: 'linear-gradient(135deg,#061a0e,#0a1f14)', border: '1px solid rgba(21,198,120,.4)', borderLeft: `4px solid ${GREEN}`, borderRadius: 12, padding: '16px', marginBottom: 12, cursor: 'pointer' }}>
                  <div style={{ display: 'inline-block', padding: '2px 9px', background: 'rgba(21,198,120,.15)', border: '1px solid rgba(21,198,120,.4)', borderRadius: 20, fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: GREEN, textTransform: 'uppercase', marginBottom: 9 }}>📈 2025 ANALYSIS</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, color: C.text, lineHeight: 1.2, marginBottom: 7 }}>2025's Most Surprising Units — The Hidden Gems of College Fantasy</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.5, marginBottom: 10 }}>Vanderbilt QB was #1 in the country. Rutgers showed up twice. Indiana DEF dominated. The 2025 season was full of surprises — here's what the data showed.</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: GREEN, letterSpacing: 0.5 }}>Read Full Article →</div>
                </div>
                {/* Featured */}
                <div style={{ background: 'linear-gradient(135deg,#0d1827,#131d30)', border: '1px solid rgba(212,168,40,.35)', borderRadius: 12, padding: '18px 16px', marginBottom: 16 }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: gold, textTransform: 'uppercase', marginBottom: 7 }}>⭐ Featured</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, color: C.text, lineHeight: 1.2, marginBottom: 8 }}>{FEATURED.headline}</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 10 }}>{FEATURED.summary}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>{FEATURED.date}</div>
                </div>
                {/* News list (full-width on mobile) */}
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>Latest News</div>
                {NEWS.map((story, i) => (
                  <div key={i} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '13px 13px', marginBottom: 8 }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.35, marginBottom: 5 }}>{story.headline}</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub, lineHeight: 1.5, marginBottom: 6 }}>{story.summary}</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1 }}>{story.date}</div>
                  </div>
                ))}
                {/* Videos (full-width) */}
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', margin: '16px 0 10px' }}>Videos</div>
                <div onClick={() => setShowVideo(true)} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8, cursor: 'pointer' }}>
                  <div style={{ height: 80, background: 'linear-gradient(135deg,#0d1827,#1e2d47)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(212,168,40,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: C.bg }}>▶</div>
                    <span style={{ position: 'absolute', bottom: 6, right: 8, fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, background: 'rgba(0,0,0,.5)', padding: '2px 5px', borderRadius: 3 }}>{CUF_VIDEO.duration}</span>
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.35, marginBottom: 3 }}>{CUF_VIDEO.title}</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.sub, lineHeight: 1.5 }}>{CUF_VIDEO.description}</div>
                  </div>
                </div>
              </div>
            )}

            {/* FANTASY */}
            {mobileTab === 'fantasy' && (
              <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
                {user ? (
                  <div style={{ padding: '24px 16px' }}>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: gold, textTransform: 'uppercase', marginBottom: 3 }}>Welcome back</div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, letterSpacing: 1, color: C.text, textTransform: 'uppercase', marginBottom: 20 }}>{userName}</div>

                    <button onClick={() => router.push('/my-leagues')} style={{ width: '100%', padding: '14px 16px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, textAlign: 'left' as const }}>
                      <div>
                        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 1, textTransform: 'uppercase' }}>My Leagues</div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1, marginTop: 3 }}>
                          {leagues.length} active{bracketCount > 0 ? ` · ${bracketCount} bracket${bracketCount !== 1 ? 's' : ''}` : ''}
                        </div>
                      </div>
                      <span style={{ color: gold, fontSize: 18 }}>→</span>
                    </button>

                    {leagues.slice(0, 4).map((league: any) => (
                      <button key={league.id} onClick={() => router.push(`/league/${league.id}`)}
                        style={{ width: '100%', padding: '12px 14px', background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, textAlign: 'left' as const }}>
                        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: C.text }}>{league.name}</span>
                        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase' }}>{league.status}</span>
                      </button>
                    ))}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
                      <button onClick={() => router.push('/create-league')} style={{ padding: '13px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: C.bg, textTransform: 'uppercase' as const }}>
                        + Create
                      </button>
                      <button onClick={() => router.push('/leagues')} style={{ padding: '13px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase' as const }}>
                        Browse
                      </button>
                    </div>
                    <button onClick={() => router.push('/brackets')} style={{ width: '100%', marginTop: 8, padding: '13px', background: 'rgba(46,204,113,.08)', border: '1px solid rgba(46,204,113,.25)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: C.green, textTransform: 'uppercase' as const }}>
                      🏆 Bracket Contests
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <img src="/logo.png" alt="CUF" style={{ width: 76, height: 76, objectFit: 'contain', marginBottom: 14, filter: 'drop-shadow(0 4px 20px rgba(212,168,40,.3))' }} />
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 6 }}>College Units Fantasy</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, letterSpacing: 1, marginBottom: 8, lineHeight: 1.5 }}>The college football fantasy experience</div>
                    <div style={{ padding: '3px 12px', background: 'rgba(212,168,40,.12)', border: '1px solid rgba(212,168,40,.3)', borderRadius: 20, fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: gold, textTransform: 'uppercase', marginBottom: 28 }}>
                      Season Starts Aug 2025
                    </div>
                    <button onClick={() => { setMobileTab('profile'); setMobileAuth('signup'); }} style={{ width: '100%', padding: '14px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.bg, textTransform: 'uppercase', marginBottom: 10 }}>
                      Create Account
                    </button>
                    <button onClick={() => { setMobileTab('profile'); setMobileAuth('signin'); }} style={{ width: '100%', padding: '14px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.sub, textTransform: 'uppercase', marginBottom: 10 }}>
                      Sign In
                    </button>
                    <button onClick={() => router.push('/leagues')} style={{ width: '100%', padding: '14px', background: 'rgba(212,168,40,.07)', border: '1px solid rgba(212,168,40,.2)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: gold, textTransform: 'uppercase' }}>
                      🏟️ Browse Public Leagues
                    </button>
                  </div>
                )}

                {/* Discord founders banner */}
                <div style={{ margin: '16px 16px 0', padding: '16px', background: '#0c1422', border: '1px solid #1a2b40', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="#5865F2" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 0.5 }}>Join the Founders Discord</div>
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub, lineHeight: 1.55, marginBottom: 12 }}>
                    Be part of the first 100 founding members. Talk directly to the founder. Shape the platform.
                  </div>
                  <a href="https://discord.gg/5n7y9wh4D" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', padding: '13px', background: '#5865F2', borderRadius: 8, textAlign: 'center', textDecoration: 'none', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}
                  >Join Now — It's Free</a>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textAlign: 'center', marginTop: 8 }}>🥇 First 100 members get Founding Member status forever</div>
                </div>
              </div>
            )}

            {/* PROFILE */}
            {mobileTab === 'profile' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 80px' }}>
                {user ? (
                  <>
                    {/* Avatar + name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                      <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#d4a828,#f0c94a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton,sans-serif', fontSize: 24, color: C.bg, flexShrink: 0 }}>
                        {userName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1 }}>{userName}</div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginTop: 2 }}>{user.email}</div>
                      </div>
                    </div>
                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                      {[['Leagues', leagues.length], ['Brackets', bracketCount]].map(([label, count]) => (
                        <div key={label as string} style={{ flex: 1, background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 12px', textAlign: 'center' as const }}>
                          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, color: gold }}>{count as number}</div>
                          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginTop: 3 }}>{label as string}</div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => router.push('/my-leagues')} style={{ width: '100%', padding: '13px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase', marginBottom: 8 }}>
                      My Leagues →
                    </button>
                    {isAdmin && (
                      <button onClick={() => router.push('/admin/platform')} style={{ width: '100%', padding: '13px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.25)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: '#f03a5a', textTransform: 'uppercase', marginBottom: 8 }}>
                        ⚡ Platform Manager
                      </button>
                    )}
                    <button onClick={signOut} style={{ width: '100%', padding: '13px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', marginTop: 8 }}>
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    {/* Auth mode toggle */}
                    <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                      {(['signin', 'signup'] as const).map(mode => (
                        <button key={mode} onClick={() => { setMobileAuth(mode); setShowForgot(false); setError(null); setMessage(null); }}
                          style={{ flex: 1, padding: '11px', background: mobileAuth === mode ? 'rgba(212,168,40,.12)' : 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: mobileAuth === mode ? gold : C.muted, textTransform: 'uppercase' }}>
                          {mode === 'signin' ? 'Sign In' : 'Create Account'}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 18 }}>
                      {mobileAuth === 'signin' && showForgot ? 'Reset Password' : mobileAuth === 'signin' ? 'Sign In' : 'Create Account'}
                    </div>
                    {mobileAuth === 'signin' && showForgot ? (
                      <>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub, lineHeight: 1.55, marginBottom: 14 }}>
                          Enter your email and we'll send you a reset link.
                        </div>
                        <input style={{ width: '100%', padding: '12px 13px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, outline: 'none', marginBottom: 10 }}
                          type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleForgotPassword(); }} />
                        {error   && <div style={{ color: C.red,   fontSize: 12, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{error}</div>}
                        {message && <div style={{ color: C.green, fontSize: 12, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{message}</div>}
                        <button onClick={handleForgotPassword} disabled={loading}
                          style={{ width: '100%', padding: '14px', background: '#5865F2', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: '#fff', textTransform: 'uppercase', marginBottom: 12 }}>
                          {loading ? 'Sending…' : 'Send Reset Link'}
                        </button>
                        <div style={{ textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                          <span onClick={() => { setShowForgot(false); setError(null); setMessage(null); }} style={{ color: C.gold, cursor: 'pointer' }}>← Back to Sign In</span>
                        </div>
                      </>
                    ) : (
                      <>
                        {mobileAuth === 'signup' && (
                          <input style={{ width: '100%', padding: '12px 13px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, outline: 'none', marginBottom: 10 }}
                            type="text" placeholder="Display Name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                        )}
                        <input style={{ width: '100%', padding: '12px 13px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, outline: 'none', marginBottom: 10 }}
                          type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                        <input style={{ width: '100%', padding: '12px 13px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, outline: 'none', marginBottom: 6 }}
                          type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') mobileAuth === 'signin' ? handleSignIn() : handleSignUp(); }} />
                        {mobileAuth === 'signin' && (
                          <div style={{ textAlign: 'right', marginBottom: 10 }}>
                            <span onClick={() => { setShowForgot(true); setError(null); setMessage(null); }} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, cursor: 'pointer' }}>
                              Forgot password?
                            </span>
                          </div>
                        )}
                        {error   && <div style={{ color: C.red,   fontSize: 12, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{error}</div>}
                        {message && <div style={{ color: C.green, fontSize: 12, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{message}</div>}
                        <button onClick={mobileAuth === 'signin' ? handleSignIn : handleSignUp} disabled={loading}
                          style={{ width: '100%', padding: '14px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.bg, textTransform: 'uppercase', marginBottom: 12 }}>
                          {loading ? (mobileAuth === 'signin' ? 'Signing in…' : 'Creating…') : (mobileAuth === 'signin' ? 'Sign In' : 'Create Account')}
                        </button>
                        <button onClick={() => router.push('/leagues')} style={{ width: '100%', padding: '13px', background: 'rgba(212,168,40,.07)', border: '1px solid rgba(212,168,40,.2)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1.5, color: gold, textTransform: 'uppercase' }}>
                          🏟️ Browse Public Leagues
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

          </div>

          {/* ── Bottom nav bar ── */}
          <div style={{ height: 60, flexShrink: 0, background: navBg, borderTop: `1px solid ${navBdr}`, display: 'flex', position: 'relative', zIndex: 10000 }}>
            {MOBILE_NAV.map(tab => (
              <button key={tab.key} onClick={() => handleNavTab(tab.key)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', color: mobileTab === tab.key ? gold : gray, transition: 'color .12s', WebkitTapHighlightColor: 'transparent' }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{tab.icon}</span>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' }}>{tab.label}</span>
              </button>
            ))}
          </div>

        </div>

        {PAID_CONTESTS_ENABLED && <WalletDrawer isOpen={showWallet} onClose={() => setShowWallet(false)} />}
        {showTermsModal && <TermsAcceptanceModal onAccepted={() => { setShowTermsModal(false); setShowAgeModal(true); }} onDecline={() => { supabase.auth.signOut(); setShowTermsModal(false); }} />}
        {showAgeModal  && <AgeVerificationModal  onVerified={() => { setShowAgeModal(false); setMobileTab('fantasy'); }} onDecline={() => { supabase.auth.signOut(); setShowAgeModal(false); }} />}
      </>
    );
  }
  // ── END MOBILE ────────────────────────────────────────────────────────────────

  return (
    <>
      {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}
      <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
        <style>{`
          * { box-sizing: border-box; }
          input:focus { outline: none !important; border-color: ${C.gold} !important; }
          @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
          .fade-up { animation: fadeUp .35s ease; }
          .hub-grid {
            display: grid;
            grid-template-columns: 25% 50% 25%;
            height: calc(100vh - 52px);
            overflow: hidden;
          }
          .hub-left   { border-right: 1px solid ${C.border}; display: flex; flex-direction: column; overflow: hidden; }
          .hub-middle { border-right: 1px solid ${C.border}; overflow-y: auto; }
          .hub-right  { overflow-y: auto; }
          @media (max-width: 1024px) {
            .hub-grid { grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; height: auto; overflow: visible; }
            .hub-left   { grid-column: 1; grid-row: 2; border-right: none; border-top: 1px solid ${C.border}; height: 380px; }
            .hub-middle { grid-column: 2; grid-row: 1 / 3; min-height: 100vh; }
            .hub-right  { grid-column: 1; grid-row: 1; border-bottom: 1px solid ${C.border}; }
          }
          @media (max-width: 640px) {
            .hub-grid { grid-template-columns: 1fr; height: auto; overflow: visible; }
            .hub-right  { grid-row: 1; }
            .hub-middle { grid-row: 2; border-right: none; border-bottom: 1px solid ${C.border}; }
            .hub-left   { grid-row: 3; border-right: none; border-top: 1px solid ${C.border}; height: 340px; }
          }
        `}</style>

        {/* ── Top bar ────────────────────────────────────────────────────────── */}
        <div style={{
          height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', borderBottom: `1px solid ${C.border}`,
          background: 'linear-gradient(180deg,#0a1020,#05080f)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="CUF" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
              College Units Fantasy
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="https://discord.gg/5n7y9wh4D" target="_blank" rel="noopener noreferrer"
              style={{ padding: '5px 12px', background: '#5865F2', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#4752c4')}
              onMouseLeave={e => (e.currentTarget.style.background = '#5865F2')}
            >
              <svg width="13" height="13" viewBox="0 0 127.14 96.36" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
              Discord
            </a>
            {user ? (
              <>
                {PAID_CONTESTS_ENABLED && (
                  <button onClick={() => setShowWallet(true)} style={{ padding: '5px 12px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.gold }}>
                    💰 {walletBalance > 0 ? `$${(walletBalance / 100).toFixed(2)}` : 'Wallet'}
                  </button>
                )}
                <button onClick={() => router.push('/my-leagues')} style={{ padding: '5px 12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.sub }}>
                  My Leagues
                </button>
                <button onClick={signOut} style={{ padding: '5px 12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.muted }}>
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setView('signin')} style={{ padding: '5px 12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.sub }}>
                  Sign In
                </button>
                <button onClick={() => setView('signup')} style={{ padding: '5px 14px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.bg }}>
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Discord founders banner ────────────────────────────────────────── */}
        <div style={{ background: '#0c1422', borderTop: '1px solid #1a2b40', borderBottom: '1px solid #1a2b40', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg width="26" height="26" viewBox="0 0 127.14 96.36" fill="#5865F2" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
            <div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.text, letterSpacing: 1, marginBottom: 2 }}>Join the Founders Discord</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.sub }}>Be part of the first 100 founding members. Talk directly to the founder. Shape the platform.</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
            <a href="https://discord.gg/5n7y9wh4D" target="_blank" rel="noopener noreferrer"
              style={{ padding: '10px 22px', background: '#5865F2', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 1.5, color: '#fff', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#4752c4')}
              onMouseLeave={e => (e.currentTarget.style.background = '#5865F2')}
            >Join Now — It's Free</a>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 1 }}>🥇 First 100 members get Founding Member status forever</div>
          </div>
        </div>

        {/* ── 3-column grid ──────────────────────────────────────────────────── */}
        <div className="hub-grid">

          {/* LEFT — Live Scores */}
          <div className="hub-left">
            <div style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>
                Live Scores
              </span>
            </div>
            <LiveScoreboard />
          </div>

          {/* MIDDLE — News */}
          <div className="hub-middle">
            <div style={{ padding: '10px 20px 8px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>
                News & Updates
              </span>
            </div>
            <NewsSection />
          </div>

          {/* RIGHT — Fantasy panel / auth forms */}
          <div className="hub-right">

            {/* ── Logged-in panel ── */}
            {showLoggedIn && (
              <div style={{ padding: '20px 16px' }} className="fade-up">
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 3 }}>
                    Welcome back
                  </div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, letterSpacing: 1, color: C.text, textTransform: 'uppercase' }}>
                    {user?.user_metadata?.display_name ?? user?.email?.split('@')[0]}
                  </div>
                </div>

                <button onClick={() => router.push('/my-leagues')} style={{ width: '100%', padding: '13px 14px', background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, textAlign: 'left' as const }}>
                  <div>
                    <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.text, letterSpacing: 1, textTransform: 'uppercase' }}>My Leagues</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginTop: 2 }}>
                      {leagues.length} active{bracketCount > 0 ? ` · ${bracketCount} bracket${bracketCount !== 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                  <span style={{ color: C.gold, fontSize: 14 }}>→</span>
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <button onClick={() => router.push('/create-league')} style={{ padding: '10px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.bg, textTransform: 'uppercase' as const }}>
                    + Create
                  </button>
                  <button onClick={() => setView('join')} style={{ padding: '10px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase' as const }}>
                    Join
                  </button>
                </div>

                <button onClick={() => router.push('/leagues')} style={{ width: '100%', padding: '10px', background: 'rgba(212,168,40,.1)', border: `1px solid rgba(212,168,40,.3)`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.gold, textTransform: 'uppercase' as const, marginBottom: 7 }}>
                  🏟️ Browse Public Leagues
                  {isAdmin && (
                    <span onClick={e => { e.stopPropagation(); toggleLock('public_leagues_locked', locks.public_leagues); }}
                      style={{ marginLeft: 8, fontSize: 13, cursor: 'pointer' }} title={locks.public_leagues ? 'Unlock' : 'Lock'}>
                      {locks.public_leagues ? '🔒' : '🔓'}
                    </span>
                  )}
                </button>

                <button onClick={() => router.push('/brackets')} style={{ width: '100%', padding: '10px', background: 'rgba(46,204,113,.08)', border: '1px solid rgba(46,204,113,.25)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: C.green, textTransform: 'uppercase' as const, marginBottom: 7 }}>
                  🏆 Bracket Contests
                  {isAdmin && (
                    <span onClick={e => { e.stopPropagation(); toggleLock('bracket_contests_locked', locks.bracket_contests); }}
                      style={{ marginLeft: 8, fontSize: 13, cursor: 'pointer' }} title={locks.bracket_contests ? 'Unlock' : 'Lock'}>
                      {locks.bracket_contests ? '🔒' : '🔓'}
                    </span>
                  )}
                </button>

                {isAdmin && (
                  <button onClick={() => router.push('/admin/platform')} style={{ width: '100%', padding: '10px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.25)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 10, letterSpacing: 1.5, color: '#f03a5a', textTransform: 'uppercase' as const }}>
                    ⚡ Platform Manager
                  </button>
                )}
              </div>
            )}

            {/* ── Logged-out panel ── */}
            {showLoggedOut && (
              <div style={{ padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }} className="fade-up">
                <img src="/logo.png" alt="CUF" style={{ width: 68, height: 68, objectFit: 'contain', marginBottom: 12, filter: 'drop-shadow(0 4px 16px rgba(212,168,40,.3))' }} />
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, letterSpacing: 2, color: C.text, textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 }}>
                  College Units Fantasy
                </div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1, textAlign: 'center', marginBottom: 6, lineHeight: 1.5 }}>
                  The college football fantasy experience
                </div>
                <div style={{ padding: '3px 10px', background: 'rgba(212,168,40,.12)', border: '1px solid rgba(212,168,40,.3)', borderRadius: 20, fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 22 }}>
                  Season Starts Aug 2025
                </div>
                <button onClick={() => setView('signup')} style={{ ...btnPrimary, marginBottom: 8 }}>
                  Create Account
                </button>
                <button onClick={() => setView('signin')} style={{ width: '100%', padding: '12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.sub, textTransform: 'uppercase', marginBottom: 8 }}>
                  Sign In
                </button>
                <button onClick={() => router.push('/leagues')} style={{ width: '100%', padding: '12px', background: 'rgba(212,168,40,.07)', border: '1px solid rgba(212,168,40,.2)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 1.5, color: C.gold, textTransform: 'uppercase' }}>
                  🏟️ Browse Public Leagues
                </button>
              </div>
            )}

            {/* ── Sign-in form ── */}
            {view === 'signin' && (
              <div style={{ padding: '20px 16px' }} className="fade-up">
                <button onClick={() => { setView('landing'); setError(null); setShowForgot(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.muted, marginBottom: 14 }}>
                  ← Back
                </button>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', color: C.text, marginBottom: 18 }}>
                  {showForgot ? 'Reset Password' : 'Sign In'}
                </div>
                {!showForgot ? (
                  <>
                    <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                    <input style={{ ...inputStyle, marginBottom: 6 }} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSignIn(); }} />
                    <div style={{ textAlign: 'right', marginBottom: 12 }}>
                      <span onClick={() => { setShowForgot(true); setError(null); setMessage(null); }} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, cursor: 'pointer' }}>
                        Forgot password?
                      </span>
                    </div>
                    {error && <div style={{ color: C.red, fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{error}</div>}
                    <button onClick={handleSignIn} disabled={loading} style={btnPrimary}>
                      {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                    <div style={{ textAlign: 'center', marginTop: 14, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                      No account?{' '}
                      <span onClick={() => { setView('signup'); setError(null); }} style={{ color: C.gold, cursor: 'pointer' }}>Create one →</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.55, marginBottom: 16 }}>
                      Enter your email and we'll send you a reset link.
                    </div>
                    <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleForgotPassword(); }} />
                    {error   && <div style={{ color: C.red,   fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{error}</div>}
                    {message && <div style={{ color: C.green, fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{message}</div>}
                    <button onClick={handleForgotPassword} disabled={loading} style={btnPrimary}>
                      {loading ? 'Sending…' : 'Send Reset Link'}
                    </button>
                    <div style={{ textAlign: 'center', marginTop: 12, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                      <span onClick={() => { setShowForgot(false); setError(null); setMessage(null); }} style={{ color: C.gold, cursor: 'pointer' }}>← Back to Sign In</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Sign-up form ── */}
            {view === 'signup' && (
              <div style={{ padding: '20px 16px' }} className="fade-up">
                <button onClick={() => { setView('landing'); setError(null); setMessage(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.muted, marginBottom: 14 }}>
                  ← Back
                </button>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', color: C.text, marginBottom: 18 }}>Create Account</div>
                <input style={inputStyle} type="text"     placeholder="Display Name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                <input style={inputStyle} type="email"    placeholder="Email"        value={email}       onChange={e => setEmail(e.target.value)} />
                <input style={inputStyle} type="password" placeholder="Password"     value={password}    onChange={e => setPassword(e.target.value)} />
                {error   && <div style={{ color: C.red,   fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{error}</div>}
                {message && <div style={{ color: C.green, fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{message}</div>}
                <button onClick={handleSignUp} disabled={loading} style={btnPrimary}>
                  {loading ? 'Creating…' : 'Create Account'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 14, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                  Already have an account?{' '}
                  <span onClick={() => { setView('signin'); setError(null); setMessage(null); }} style={{ color: C.gold, cursor: 'pointer' }}>Sign in →</span>
                </div>
              </div>
            )}

            {/* ── Join form ── */}
            {view === 'join' && (
              <div style={{ padding: '20px 16px' }} className="fade-up">
                <button onClick={() => { setView(user ? 'dashboard' : 'landing'); setError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.muted, marginBottom: 14 }}>
                  ← Back
                </button>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', color: C.text, marginBottom: 18 }}>Join League</div>
                <input style={inputStyle} type="text" placeholder="Enter invite code" value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={10}
                  onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }} />
                {error && <div style={{ color: C.red, fontSize: 11, marginBottom: 10, fontFamily: 'Oswald,sans-serif' }}>{error}</div>}
                <button onClick={handleJoin} disabled={loading} style={btnPrimary}>
                  {loading ? 'Checking…' : 'Join League'}
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {PAID_CONTESTS_ENABLED && <WalletDrawer isOpen={showWallet} onClose={() => setShowWallet(false)} />}

      {showTermsModal && (
        <TermsAcceptanceModal
          onAccepted={() => { setShowTermsModal(false); setShowAgeModal(true); }}
          onDecline={() => { supabase.auth.signOut(); setShowTermsModal(false); }}
        />
      )}
      {showAgeModal && (
        <AgeVerificationModal
          onVerified={() => { setShowAgeModal(false); setView('dashboard'); }}
          onDecline={() => { supabase.auth.signOut(); setShowAgeModal(false); }}
        />
      )}
    </>
  );
}
