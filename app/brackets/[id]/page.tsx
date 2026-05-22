'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Team } from '@/lib/bracketTypes'

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#f5a623', text: '#e4edf7', sub: '#7a90aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a',
}

function seedColor(seed: number): string {
  if (seed === 1) return '#f5a623'
  if (seed === 2) return '#3b82f6'
  if (seed === 3) return '#8b5cf6'
  return '#6b7280'
}

/* ── Static team data ──────────────────────────────────── */
const REGIONS: Record<string, { display: string; teams: Team[] }> = {
  nashville:   { display: 'Nashville',   teams: [{ id: 'vand',    name: 'Vanderbilt',       seed: 1, record: '45-12' }, { id: 'etsu',   name: 'E. Tennessee St',  seed: 2, record: '42-15' }, { id: 'wst',    name: 'Wright State',     seed: 3, record: '36-19' }, { id: 'lou',    name: 'Louisville',       seed: 4, record: '39-18' }] },
  hattiesburg: { display: 'Hattiesburg', teams: [{ id: 'smiss',   name: 'Southern Miss',    seed: 1, record: '43-14' }, { id: 'ala',    name: 'Alabama',           seed: 2, record: '40-16' }, { id: 'col',    name: 'Columbia',         seed: 3, record: '34-22' }, { id: 'mia',    name: 'Miami (FL)',        seed: 4, record: '38-20' }] },
  tallahassee: { display: 'Tallahassee', teams: [{ id: 'fsu',     name: 'Florida State',    seed: 1, record: '44-14' }, { id: 'bcu',    name: 'Bethune-Cookman',   seed: 2, record: '38-22' }, { id: 'neu',    name: 'Northeastern',     seed: 3, record: '35-21' }, { id: 'miss',   name: 'Mississippi St',   seed: 4, record: '37-20' }] },
  corvallis:   { display: 'Corvallis',   teams: [{ id: 'orst',    name: 'Oregon State',     seed: 1, record: '42-16' }, { id: 'tcu',    name: 'TCU',               seed: 2, record: '40-17' }, { id: 'mich',   name: 'Michigan',         seed: 3, record: '36-19' }, { id: 'usc',    name: 'USC',              seed: 4, record: '35-21' }] },
  austin:      { display: 'Austin',      teams: [{ id: 'tex',     name: 'Texas',            seed: 1, record: '44-13' }, { id: 'uconn',  name: 'UConn',             seed: 2, record: '39-18' }, { id: 'kst',    name: 'Kansas State',     seed: 3, record: '35-22' }, { id: 'utsa',   name: 'UTSA',             seed: 4, record: '33-24' }] },
  los_angeles: { display: 'Los Angeles', teams: [{ id: 'ucla',    name: 'UCLA',             seed: 1, record: '42-15' }, { id: 'fres',   name: 'Fresno State',      seed: 2, record: '38-19' }, { id: 'asu',    name: 'Arizona State',    seed: 3, record: '36-20' }, { id: 'uci',    name: 'UC Irvine',        seed: 4, record: '34-23' }] },
  oxford:      { display: 'Oxford',      teams: [{ id: 'olemiss', name: 'Ole Miss',          seed: 1, record: '45-12' }, { id: 'wku',    name: 'Western Kentucky',  seed: 2, record: '38-20' }, { id: 'gtech',  name: 'Georgia Tech',     seed: 3, record: '35-21' }, { id: 'murr',   name: 'Murray State',     seed: 4, record: '32-25' }] },
  athens:      { display: 'Athens',      teams: [{ id: 'uga',     name: 'Georgia',           seed: 1, record: '44-14' }, { id: 'bing',   name: 'Binghamton',        seed: 2, record: '37-21' }, { id: 'okst',   name: 'Oklahoma State',   seed: 3, record: '36-20' }, { id: 'duke',   name: 'Duke',             seed: 4, record: '34-23' }] },
}

// SR pairings: two left-side regionals → one SR in col 2
// Two right-side regionals → one SR in col 4
const LEFT_SR: Array<{ idx: number; label: string; top: string; bot: string }> = [
  { idx: 0, label: 'Super Regional 1', top: 'nashville',   bot: 'hattiesburg' },
  { idx: 1, label: 'Super Regional 2', top: 'tallahassee', bot: 'corvallis'   },
]
const RIGHT_SR: Array<{ idx: number; label: string; top: string; bot: string }> = [
  { idx: 2, label: 'Super Regional 3', top: 'austin',      bot: 'los_angeles' },
  { idx: 3, label: 'Super Regional 4', top: 'oxford',      bot: 'athens'      },
]
// CWS semi pairings: SR idx → semi slot
// Semi 0: SR0 winner vs SR2 winner   Semi 1: SR1 winner vs SR3 winner
const CWS_SEMIS: Array<{ semiIdx: number; leftSR: number; rightSR: number }> = [
  { semiIdx: 0, leftSR: 0, rightSR: 2 },
  { semiIdx: 1, leftSR: 1, rightSR: 3 },
]

type BracketPicks = {
  regionals:      Record<string, Team>
  superRegionals: Record<number, Team>
  semifinals:     Record<number, Team>
  champion:       Team | null
  seriesResult:   '2-0' | '2-1' | null
}

function empty(): BracketPicks {
  return { regionals: {}, superRegionals: {}, semifinals: {}, champion: null, seriesResult: null }
}

function countPicks(p: BracketPicks): number {
  return Object.keys(p.regionals).length
    + Object.keys(p.superRegionals).length
    + Object.keys(p.semifinals).length
    + (p.champion ? 1 : 0)
    + (p.seriesResult ? 1 : 0)
}

const TOTAL = 16 // 8 reg + 4 SR + 2 semi + 1 champ + 1 series

type Tab = 'bracket' | 'leaderboard' | 'chat'
type MSection = 'left' | 'super-left' | 'cws' | 'super-right' | 'right'

/* ── Sub-components ────────────────────────────────────── */

function TeamCard({ team, isPicked, onPick, isLocked }: {
  team: Team; isPicked: boolean; onPick: () => void; isLocked: boolean
}) {
  const sc = seedColor(team.seed)
  return (
    <div
      onClick={isLocked ? undefined : onPick}
      style={{
        padding: '9px 8px',
        background: isPicked ? sc + '18' : C.surf2,
        border: `1px solid ${isPicked ? sc : C.surf3}`,
        borderRadius: 6, cursor: isLocked ? 'default' : 'pointer',
        transition: 'all .15s', textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, color: sc, marginBottom: 1, lineHeight: 1 }}>
        {team.seed}
      </div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: isPicked ? sc : C.text, lineHeight: 1.2, letterSpacing: 0.3 }}>
        {team.name}
      </div>
      {team.record && (
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, marginTop: 2 }}>{team.record}</div>
      )}
      {isPicked && (
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 7, color: sc, marginTop: 3, letterSpacing: 1 }}>ADVANCES ›</div>
      )}
    </div>
  )
}

function RegionalPod({ regionKey, picks, onPick, isLocked, arrow }: {
  regionKey: string; picks: BracketPicks; onPick: (k: string, t: Team) => void; isLocked: boolean; arrow?: 'right' | 'left'
}) {
  const r = REGIONS[regionKey]
  if (!r) return null
  const pickedId = picks.regionals[regionKey]?.id
  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '10px 10px 12px' }}>
      <div style={{
        fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.gold,
        textTransform: 'uppercase', marginBottom: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{r.display}</span>
        {arrow === 'right' && <span style={{ color: C.surf3, fontSize: 12 }}>›</span>}
        {arrow === 'left'  && <span style={{ color: C.surf3, fontSize: 12 }}>‹</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {r.teams.map(t => (
          <TeamCard key={t.id} team={t} isPicked={pickedId === t.id} onPick={() => onPick(regionKey, t)} isLocked={isLocked} />
        ))}
      </div>
    </div>
  )
}

function SRSlot({ team, label, isPicked, onPick, isLocked }: {
  team: Team | undefined; label: string; isPicked: boolean; onPick: () => void; isLocked: boolean
}) {
  return (
    <div
      onClick={team && !isLocked ? onPick : undefined}
      style={{
        padding: '9px 12px',
        background: isPicked ? 'rgba(245,166,35,.1)' : C.surf,
        border: `1px solid ${isPicked ? C.gold : C.surf3}`,
        borderRadius: 6, cursor: team && !isLocked ? 'pointer' : 'default',
        minHeight: 44, display: 'flex', alignItems: 'center', gap: 8,
        transition: 'all .15s',
      }}
    >
      {team ? (
        <>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: seedColor(team.seed) + '22',
            border: `1px solid ${seedColor(team.seed)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Anton,sans-serif', fontSize: 10, color: seedColor(team.seed),
          }}>{team.seed}</div>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: isPicked ? C.gold : C.text }}>{team.name}</div>
            {isPicked && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 7, color: C.gold, letterSpacing: 1 }}>ADVANCES</div>}
          </div>
          {isPicked && <span style={{ marginLeft: 'auto', color: C.gold, fontSize: 13 }}>✓</span>}
        </>
      ) : (
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1 }}>
          {label} Winner
        </span>
      )}
    </div>
  )
}

function SRBox({ sr, picks, onPick, isLocked }: {
  sr: (typeof LEFT_SR)[0]; picks: BracketPicks; onPick: (idx: number, t: Team) => void; isLocked: boolean
}) {
  const topWinner = picks.regionals[sr.top]
  const botWinner = picks.regionals[sr.bot]
  const srWinner  = picks.superRegionals[sr.idx]
  const topDisplay = REGIONS[sr.top]?.display ?? sr.top
  const botDisplay = REGIONS[sr.bot]?.display ?? sr.bot

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        padding: '6px 10px', background: C.surf2,
        borderBottom: `1px solid ${C.surf3}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.gold, letterSpacing: 2, textTransform: 'uppercase' }}>
          {sr.label}
        </span>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 7, color: C.muted }}>Best of 3</span>
      </div>
      <div style={{ padding: '8px' }}>
        <SRSlot
          team={topWinner}
          label={topDisplay}
          isPicked={!!(srWinner && topWinner && srWinner.id === topWinner.id)}
          onPick={() => topWinner && onPick(sr.idx, topWinner)}
          isLocked={isLocked}
        />
        <div style={{ textAlign: 'center', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, padding: '4px 0' }}>VS</div>
        <SRSlot
          team={botWinner}
          label={botDisplay}
          isPicked={!!(srWinner && botWinner && srWinner.id === botWinner.id)}
          onPick={() => botWinner && onPick(sr.idx, botWinner)}
          isLocked={isLocked}
        />
      </div>
    </div>
  )
}

function CWSMatchupBox({ label, t1, t2, picked, onPick, isLocked }: {
  label: string; t1: Team | null; t2: Team | null; picked: Team | null; onPick: (t: Team) => void; isLocked: boolean
}) {
  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: C.surf2, borderBottom: `1px solid ${C.surf3}` }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</span>
      </div>
      {([t1, t2] as (Team | null)[]).map((team, i) => {
        const sel = picked?.id === team?.id
        return (
          <div key={i}
            onClick={team && !isLocked ? () => onPick(team) : undefined}
            style={{
              padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: i === 0 ? `1px solid ${C.surf3}` : 'none',
              background: sel ? 'rgba(245,166,35,.08)' : 'transparent',
              cursor: team && !isLocked ? 'pointer' : 'default',
              transition: 'background .12s',
            }}
          >
            {team ? (
              <>
                <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.muted, width: 14 }}>{team.seed}</span>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: sel ? C.gold : C.text, flex: 1 }}>{team.name}</span>
                {sel && <span style={{ color: C.gold, fontSize: 12 }}>✓</span>}
              </>
            ) : (
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>TBD</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ChampSlot({ team, isPicked, onPick, isLocked }: {
  team: Team | null; isPicked: boolean; onPick: () => void; isLocked: boolean
}) {
  return (
    <div
      onClick={team && !isLocked ? onPick : undefined}
      style={{
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
        background: isPicked ? 'rgba(245,166,35,.12)' : C.surf,
        border: `1px solid ${isPicked ? C.gold : C.surf3}`,
        borderRadius: 6, cursor: team && !isLocked ? 'pointer' : 'default',
        transition: 'all .15s', minHeight: 48,
      }}
    >
      {team ? (
        <>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: seedColor(team.seed) + '22', border: `1.5px solid ${seedColor(team.seed)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Anton,sans-serif', fontSize: 12, color: seedColor(team.seed),
          }}>{team.seed}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: isPicked ? C.gold : C.text }}>{team.name}</div>
            {isPicked && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.gold, letterSpacing: 1 }}>NATIONAL CHAMPION</div>}
          </div>
          {isPicked && <span style={{ color: C.gold, fontSize: 18 }}>★</span>}
        </>
      ) : (
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>TBD</span>
      )}
    </div>
  )
}

/* ── Column wrapper helpers ─────────────────────────────── */

function ColHeader({ line1, line2, align = 'left' }: { line1: string; line2: string; align?: 'left' | 'center' | 'right' }) {
  return (
    <div style={{ marginBottom: 10, textAlign: align }}>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, letterSpacing: 2, textTransform: 'uppercase' }}>{line1}</div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted, marginTop: 2 }}>{line2}</div>
    </div>
  )
}

function ConnectorPair({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderRight: `2px solid ${C.surf3}`,
      paddingRight: 0,
      display: 'flex', flexDirection: 'column', gap: 10,
      flex: 1,
    }}>
      {children}
    </div>
  )
}

function ConnectorPairRight({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderLeft: `2px solid ${C.surf3}`,
      paddingLeft: 0,
      display: 'flex', flexDirection: 'column', gap: 10,
      flex: 1,
    }}>
      {children}
    </div>
  )
}

/* ── Progress bar ───────────────────────────────────────── */
function ProgressBar({ n, total }: { n: number; total: number }) {
  const done = n >= total
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1 }}>
          {n} / {total} picks made
        </span>
        {done && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.green }}>✓ Ready to submit</span>}
      </div>
      <div style={{ height: 4, background: C.surf3, borderRadius: 2 }}>
        <div style={{
          height: '100%',
          width: `${(n / total) * 100}%`,
          background: `linear-gradient(90deg, ${C.gold}, ${C.green})`,
          borderRadius: 2, transition: 'width .3s',
        }} />
      </div>
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────── */
export default function BracketPage() {
  const params    = useParams()
  const contestId = params.id as string
  const supabase  = createClientComponentClient()

  const [userId,         setUserId]         = useState<string | null>(null)
  const [contest,        setContest]        = useState<any>(null)
  const [picks,          setPicks]          = useState<BracketPicks>(empty())
  const [tab,            setTab]            = useState<Tab>('bracket')
  const [mSection,       setMSection]       = useState<MSection>('left')
  const [loading,        setLoading]        = useState(true)
  const [submitting,     setSubmitting]     = useState(false)
  const [hasPaid,        setHasPaid]        = useState(false)
  const [isLocked,       setIsLocked]       = useState(false)
  const [leagueId,       setLeagueId]       = useState<string | null>(null)
  const [isPublicLeague, setIsPublicLeague] = useState(false)
  const [walletBalance,  setWalletBalance]  = useState<number>(0)
  const [showWalletModal,   setShowWalletModal]   = useState(false)
  const [showAddEntryModal, setShowAddEntryModal] = useState(false)
  const [originalPicks,  setOriginalPicks]  = useState<BracketPicks | null>(null)
  const [leaderboard,    setLeaderboard]    = useState<any[]>([])
  const [chatMessages,   setChatMessages]   = useState<any[]>([])
  const [chatInput,      setChatInput]      = useState('')
  // Multi-entry
  const [myEntries,      setMyEntries]      = useState<any[]>([])
  const [activeEntryNum, setActiveEntryNum] = useState(1)
  const [maxPerAccount,  setMaxPerAccount]  = useState(1)
  const [entryFeeCents,  setEntryFeeCents]  = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [isMobile,  setIsMobile]  = useState(false)
  const swipeTouchStart = useRef<number>(0)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)

    const { data: c } = await supabase.from('bracket_contests').select('*').eq('id', contestId).single()
    if (c) {
      setContest(c)
      setEntryFeeCents(c.entry_fee_cents ?? 0)
      setMaxPerAccount(c.settings?.max_per_account ?? 1)
      if (c.status === 'locked' || c.status === 'active' || c.status === 'completed') setIsLocked(true)
      if (c.locks_at && new Date(c.locks_at) < new Date()) setIsLocked(true)
    }

    try {
      const walletRes = await fetch('/api/wallet')
      if (walletRes.ok) {
        const walletData = await walletRes.json()
        setWalletBalance(walletData.wallet?.balance ?? 0)
      }
    } catch {}

    setLoading(false)
  }, [supabase, contestId])

  useEffect(() => {
    console.log('[bracket] contestId:', contestId)
    loadData()
  }, [loadData])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const BRACKET_MSECTIONS: MSection[] = ['left', 'super-left', 'cws', 'super-right', 'right']

  function handleBracketTouchStart(e: React.TouchEvent) {
    swipeTouchStart.current = e.touches[0].clientX
  }

  function handleBracketTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - swipeTouchStart.current
    if (Math.abs(dx) < 50) return
    const currentIdx = BRACKET_MSECTIONS.indexOf(mSection)
    if (dx < -50 && currentIdx < BRACKET_MSECTIONS.length - 1) {
      setMSection(BRACKET_MSECTIONS[currentIdx + 1])
    }
    if (dx > 50 && currentIdx > 0) {
      setMSection(BRACKET_MSECTIONS[currentIdx - 1])
    }
  }

  // Load all user entries for this contest, check payment, fetch owning league
  useEffect(() => {
    if (!userId || !contestId) return

    supabase
      .from('user_bracket_entries')
      .select('*')
      .eq('contest_id', contestId)
      .eq('user_id', userId)
      .order('entry_number', { ascending: true })
      .then(({ data: entries }) => {
        const list = entries ?? []
        setMyEntries(list)
        const first = list[0]
        if (first?.bracket_data) {
          setPicks(first.bracket_data)
          setOriginalPicks(first.bracket_data)
        }
        if (first) setActiveEntryNum(first.entry_number ?? 1)
      })

    supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'contest_entry')
      .eq('status', 'completed')
      .or(`league_id.eq.${contestId},description.ilike.%${contestId}%`)
      .maybeSingle()
      .then(({ data }) => { if (data) setHasPaid(true) })

    supabase
      .from('leagues')
      .select('id, buy_in, is_public')
      .eq('league_type', 'bracket')
      .contains('settings', { bracket_contest_id: contestId })
      .single()
      .then(({ data }) => {
        if (data) {
          setLeagueId(data.id)
          setIsPublicLeague(data.is_public ?? false)
          supabase
            .from('league_members')
            .select('id')
            .eq('league_id', data.id)
            .eq('user_id', userId)
            .maybeSingle()
            .then(({ data: member }) => { if (member) setHasPaid(true) })
        }
      })
  }, [userId, contestId])

  // Fetch leaderboard when tab switches to leaderboard
  useEffect(() => {
    if (tab !== 'leaderboard') return
    supabase
      .from('user_bracket_entries')
      .select('id, entry_name, user_id, total_score, correct_picks, submitted_at, is_submitted')
      .eq('contest_id', contestId)
      .eq('is_submitted', true)
      .order('submitted_at', { ascending: true })
      .then(({ data }) => setLeaderboard(data ?? []))
  }, [tab, contestId])

  // Chat: subscribe to bracket_messages
  useEffect(() => {
    if (!userId) return
    supabase.from('bracket_messages')
      .select('*')
      .eq('contest_id', contestId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setChatMessages(data ?? []))

    const ch = supabase.channel('bracket-chat-' + contestId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'bracket_messages',
        filter: 'contest_id=eq.' + contestId,
      }, (payload) => {
        setChatMessages(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [supabase, contestId, userId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // When switching entry tabs, load that entry's picks
  useEffect(() => {
    const entry = myEntries.find(e => (e.entry_number ?? 1) === activeEntryNum)
    if (entry?.bracket_data) {
      setPicks(entry.bracket_data)
      setOriginalPicks(entry.bracket_data)
    } else {
      setPicks(empty())
      setOriginalPicks(null)
    }
  }, [activeEntryNum, myEntries])

  /* ── Pick handlers ── */
  function pickRegional(key: string, team: Team) {
    if (isLocked) return
    setPicks(prev => {
      const next = { ...prev, regionals: { ...prev.regionals, [key]: team } }
      // Cascade: find which SR this regional feeds and clear it if the winner changed
      const allSR = [...LEFT_SR, ...RIGHT_SR]
      const srDef = allSR.find(s => s.top === key || s.bot === key)
      if (srDef) {
        const srW = prev.superRegionals[srDef.idx]
        // If previous SR winner came from this regional but is a different team, clear downstream
        const prevReg = prev.regionals[key]
        if (prevReg && srW && srW.id === prevReg.id && team.id !== prevReg.id) {
          const { [srDef.idx]: _sr, ...restSR } = next.superRegionals
          next.superRegionals = restSR
          // Find CWS semi that used this SR
          const semiDef = CWS_SEMIS.find(s => s.leftSR === srDef.idx || s.rightSR === srDef.idx)
          if (semiDef) {
            const semiW = prev.semifinals[semiDef.semiIdx]
            const srW2 = prev.superRegionals[srDef.idx]
            if (semiW && srW2 && semiW.id === srW2.id) {
              const { [semiDef.semiIdx]: _s, ...restSemi } = next.semifinals
              next.semifinals = restSemi
              next.champion = null
              next.seriesResult = null
            }
          }
        }
      }
      return next
    })
  }

  function pickSR(idx: number, team: Team) {
    if (isLocked) return
    setPicks(prev => {
      const next = { ...prev, superRegionals: { ...prev.superRegionals, [idx]: team } }
      const semiDef = CWS_SEMIS.find(s => s.leftSR === idx || s.rightSR === idx)
      if (semiDef) {
        const semiW = prev.semifinals[semiDef.semiIdx]
        const prevSR = prev.superRegionals[idx]
        if (semiW && prevSR && semiW.id === prevSR.id && team.id !== prevSR.id) {
          const { [semiDef.semiIdx]: _, ...restSemi } = next.semifinals
          next.semifinals = restSemi
          next.champion = null
          next.seriesResult = null
        }
      }
      return next
    })
  }

  function pickSemi(semiIdx: number, team: Team) {
    if (isLocked) return
    setPicks(prev => {
      const next = { ...prev, semifinals: { ...prev.semifinals, [semiIdx]: team } }
      const prevSemi = prev.semifinals[semiIdx]
      if (prev.champion && prevSemi && prev.champion.id === prevSemi.id && team.id !== prevSemi.id) {
        next.champion = null
        next.seriesResult = null
      }
      return next
    })
  }

  function pickChampion(team: Team) {
    if (isLocked) return
    setPicks(prev => ({ ...prev, champion: team }))
  }

  /* ── Bracket chat ── */
  async function sendBracketChat() {
    if (!chatInput.trim() || !userId) return
    const msg = chatInput.trim()
    setChatInput('')
    await supabase.from('bracket_messages').insert({
      contest_id:   contestId,
      user_id:      userId,
      message:      msg,
      display_name: 'You',
    })
  }

  /* ── Direct submit (no modal — uses name already saved at join time) ── */
  async function handleSubmitDirect() {
    if (!userId || !contestId || totalPicks < TOTAL) return
    setSubmitting(true)
    try {
      if (!hasPaid && entryFeeCents > 0 && !isPublicLeague) {
        if (walletBalance < entryFeeCents) {
          alert(`Not enough funds. Need $${(entryFeeCents / 100).toFixed(2)}, you have $${(walletBalance / 100).toFixed(2)}.`)
          setSubmitting(false)
          return
        }
        if (leagueId) {
          const payRes = await fetch('/api/wallet/join-contest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ league_id: leagueId, team_name: bracketName }),
          })
          if (!payRes.ok) { const d = await payRes.json(); alert(d.error ?? 'Payment failed'); setSubmitting(false); return }
        } else {
          const payRes = await fetch('/api/wallet/bracket-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contestId, buyInCents: entryFeeCents }),
          })
          if (!payRes.ok) { const d = await payRes.json(); alert(d.error ?? 'Payment failed'); setSubmitting(false); return }
        }
        setWalletBalance(prev => prev - entryFeeCents)
        setHasPaid(true)
      }

      const { error } = await supabase
        .from('user_bracket_entries')
        .update({ bracket_data: picks, is_submitted: true, submitted_at: new Date().toISOString() })
        .eq('contest_id', contestId)
        .eq('user_id', userId)
        .eq('entry_number', activeEntryNum)

      if (error) throw error

      if (!hasSubmitted) {
        supabase.rpc('increment_entry_count', { contest_id: contestId }).then(() => {})
      }

      setMyEntries(prev => prev.map(e =>
        (e.entry_number ?? 1) === activeEntryNum ? { ...e, is_submitted: true, bracket_data: picks } : e
      ))
      setOriginalPicks(picks)
      alert(`🏆 Bracket "${bracketName}" submitted! Good luck!`)
    } catch (err: any) {
      alert('Error: ' + (err?.message ?? 'Submission failed'))
    }
    setSubmitting(false)
  }

  /* ── Resubmit (picks changed after submission — no name change, no payment) ── */
  async function handleResubmit() {
    if (totalPicks < TOTAL) {
      alert(`⚠️ Your bracket is incomplete (${totalPicks}/16 picks). Please fill out all picks before resubmitting. Your original bracket has been kept.`)
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('user_bracket_entries')
        .update({ bracket_data: picks, submitted_at: new Date().toISOString() })
        .eq('contest_id', contestId)
        .eq('user_id', userId)
        .eq('entry_number', activeEntryNum)
      if (error) throw error
      setMyEntries(prev => prev.map(e =>
        (e.entry_number ?? 1) === activeEntryNum ? { ...e, bracket_data: picks } : e
      ))
      setOriginalPicks(picks)
      alert('✅ Bracket resubmitted successfully! Your updated picks have been saved.')
    } catch (err: any) {
      alert(`Error resubmitting: ${err?.message ?? 'Unknown error'}. Your original bracket has been kept.`)
    }
    setSubmitting(false)
  }

  /* ── Add a second/third/etc entry ── */
  async function handleAddEntry() {
    if (myEntries.length >= maxPerAccount || isLocked) return
    if (entryFeeCents > 0) {
      if (walletBalance < entryFeeCents) {
        alert(`Not enough funds. Need $${(entryFeeCents / 100).toFixed(2)}, you have $${(walletBalance / 100).toFixed(2)}.`)
        return
      }
      const payRes = await fetch(leagueId ? '/api/wallet/join-contest' : '/api/wallet/bracket-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leagueId
          ? { league_id: leagueId, team_name: `${myEntries[0]?.entry_name ?? 'My Bracket'} (${myEntries.length + 1})` }
          : { contestId, buyInCents: entryFeeCents, entryNumber: myEntries.length + 1 }
        ),
      })
      if (!payRes.ok) {
        const d = await payRes.json()
        alert(d.error ?? 'Payment failed')
        return
      }
      setWalletBalance(prev => prev - entryFeeCents)
    }

    const nextNum = myEntries.length + 1
    const baseName = myEntries[0]?.entry_name ?? 'My Bracket'
    const newName = nextNum === 1 ? baseName : `${baseName} (${nextNum})`

    const { data: newEntry } = await supabase
      .from('user_bracket_entries')
      .insert({ contest_id: contestId, user_id: userId, entry_name: newName, entry_number: nextNum, is_submitted: false })
      .select()
      .single()

    if (newEntry) {
      setMyEntries(prev => [...prev, newEntry])
      setActiveEntryNum(nextNum)
      setPicks(empty())
      setOriginalPicks(null)
    }
  }

  /* ── Derived CWS teams ── */
  const cwsT = (srIdx: number) => picks.superRegionals[srIdx] ?? null
  const semi0t1 = cwsT(CWS_SEMIS[0].leftSR)
  const semi0t2 = cwsT(CWS_SEMIS[0].rightSR)
  const semi1t1 = cwsT(CWS_SEMIS[1].leftSR)
  const semi1t2 = cwsT(CWS_SEMIS[1].rightSR)
  const champT1 = picks.semifinals[0] ?? null
  const champT2 = picks.semifinals[1] ?? null

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 14, letterSpacing: 2 }}>LOADING BRACKET…</span>
    </div>
  )
  if (!contest) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: C.red, fontFamily: 'Oswald,sans-serif' }}>Contest not found.</span>
    </div>
  )

  const totalPicks   = countPicks(picks)
  const activeEntry  = myEntries.find(e => (e.entry_number ?? 1) === activeEntryNum) ?? null
  const hasSubmitted = activeEntry?.is_submitted ?? false
  const bracketName  = activeEntry?.entry_name ?? 'My Bracket'
  const picksChanged = hasSubmitted && originalPicks !== null && JSON.stringify(picks) !== JSON.stringify(originalPicks)

  /* ── Bracket columns (shared by desktop & mobile) ── */
  const leftRegionalsCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ColHeader line1="Regionals" line2="Double Elimination" />
      <ConnectorPair>
        <RegionalPod regionKey="nashville"   picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="right" />
        <RegionalPod regionKey="hattiesburg" picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="right" />
      </ConnectorPair>
      <ConnectorPair>
        <RegionalPod regionKey="tallahassee" picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="right" />
        <RegionalPod regionKey="corvallis"   picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="right" />
      </ConnectorPair>
    </div>
  )

  const leftSRCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ColHeader line1="Super Regionals" line2="Best of 3" />
      {LEFT_SR.map(sr => <SRBox key={sr.idx} sr={sr} picks={picks} onPick={pickSR} isLocked={isLocked} />)}
    </div>
  )

  const cwsCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ColHeader line1="College World Series" line2="Omaha, Nebraska" align="center" />

      <CWSMatchupBox
        label="CWS Semifinal 1"
        t1={semi0t1} t2={semi0t2}
        picked={picks.semifinals[0] ?? null}
        onPick={t => pickSemi(0, t)}
        isLocked={isLocked}
      />

      {/* Championship */}
      <div style={{ background: C.surf, border: `2px solid ${C.gold}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          padding: '8px 12px', background: 'rgba(245,166,35,.08)',
          borderBottom: '1px solid rgba(245,166,35,.3)',
          textAlign: 'center',
          fontFamily: 'Anton,sans-serif', fontSize: 11, letterSpacing: 3, color: C.gold,
        }}>
          🏆 NATIONAL CHAMPIONSHIP
        </div>
        <div style={{ padding: '10px' }}>
          <ChampSlot team={champT1} isPicked={picks.champion?.id === champT1?.id} onPick={() => champT1 && pickChampion(champT1)} isLocked={isLocked} />
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.muted, textAlign: 'center', padding: '6px 0' }}>VS</div>
          <ChampSlot team={champT2} isPicked={picks.champion?.id === champT2?.id} onPick={() => champT2 && pickChampion(champT2)} isLocked={isLocked} />

          {picks.champion && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.surf3}` }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 8, textAlign: 'center' }}>
                SERIES RESULT
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['2-0', '2-1'] as const).map(s => (
                  <button key={s}
                    onClick={isLocked ? undefined : () => setPicks(p => ({ ...p, seriesResult: s }))}
                    style={{
                      flex: 1, padding: '7px 0',
                      border: `1px solid ${picks.seriesResult === s ? C.gold : C.surf3}`,
                      background: picks.seriesResult === s ? 'rgba(245,166,35,.15)' : C.surf2,
                      borderRadius: 6, cursor: isLocked ? 'default' : 'pointer',
                      fontFamily: 'Anton,sans-serif', fontSize: 13,
                      color: picks.seriesResult === s ? C.gold : C.muted,
                      transition: 'all .15s',
                    }}>{s}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <CWSMatchupBox
        label="CWS Semifinal 2"
        t1={semi1t1} t2={semi1t2}
        picked={picks.semifinals[1] ?? null}
        onPick={t => pickSemi(1, t)}
        isLocked={isLocked}
      />

      {/* How to Play */}
      <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.gold, letterSpacing: 1, marginBottom: 8 }}>
          HOW TO PLAY
        </div>
        <ol style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, lineHeight: 2.1, paddingLeft: 14, margin: 0 }}>
          <li>Pick 1 team to win each Regional (8 total)</li>
          <li>Pick 1 team to win each Super Regional (4 total)</li>
          <li>Pick 1 team to win each CWS Semifinal (2 total)</li>
          <li>Pick the National Champion + series result</li>
        </ol>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
          Scoring: Regional = 10 pts · Super Regional = 20 pts · CWS Semi = 20 pts · Champion = 40 pts · Exact series +5 pts
        </div>
      </div>
    </div>
  )

  const rightSRCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ColHeader line1="Super Regionals" line2="Best of 3" align="right" />
      {RIGHT_SR.map(sr => <SRBox key={sr.idx} sr={sr} picks={picks} onPick={pickSR} isLocked={isLocked} />)}
    </div>
  )

  const rightRegionalsCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ColHeader line1="Regionals" line2="Double Elimination" align="right" />
      <ConnectorPairRight>
        <RegionalPod regionKey="austin"      picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="left" />
        <RegionalPod regionKey="los_angeles" picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="left" />
      </ConnectorPairRight>
      <ConnectorPairRight>
        <RegionalPod regionKey="oxford"  picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="left" />
        <RegionalPod regionKey="athens"  picks={picks} onPick={pickRegional} isLocked={isLocked} arrow="left" />
      </ConnectorPairRight>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column' as const, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any }}>

      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: C.surf, borderBottom: `1px solid ${C.surf3}`,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Left: contest name */}
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 1, textTransform: 'uppercase' }}>
          {contest.name}
        </div>

        {/* Center: submit / resubmit / submitted / locked */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          {isLocked ? (
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.red, letterSpacing: 1 }}>
              🔒 Bracket Locked
            </div>
          ) : hasSubmitted && !picksChanged ? (
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.green, letterSpacing: 1 }}>
              ✓ Bracket Submitted
            </div>
          ) : hasSubmitted && picksChanged ? (
            <button
              onClick={handleResubmit}
              disabled={submitting}
              style={{
                padding: '8px 24px',
                background: submitting ? C.surf3 : C.gold,
                border: 'none', borderRadius: 8,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2,
                color: submitting ? C.muted : C.bg,
                textTransform: 'uppercase' as const,
              }}>
              {submitting ? 'Resubmitting...' : 'Resubmit Bracket'}
            </button>
          ) : (
            <button
              onClick={() => totalPicks >= TOTAL ? handleSubmitDirect() : undefined}
              disabled={totalPicks < TOTAL || submitting}
              style={{
                padding: '8px 24px',
                background: totalPicks >= TOTAL && !submitting ? C.gold : C.surf3,
                border: 'none', borderRadius: 8,
                cursor: totalPicks >= TOTAL && !submitting ? 'pointer' : 'not-allowed',
                fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2,
                color: totalPicks >= TOTAL && !submitting ? C.bg : C.muted,
                textTransform: 'uppercase' as const,
              }}>
              {submitting ? 'Submitting...' : totalPicks >= TOTAL ? 'Submit Bracket' : `${TOTAL - totalPicks} picks left`}
            </button>
          )}
        </div>

        {/* Right: entries counter + add entry button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
            {myEntries.length}/{maxPerAccount} {maxPerAccount === 1 ? 'entry' : 'entries'}
          </div>
          {!isLocked && myEntries.length < maxPerAccount && hasPaid && (
            <button
              onClick={() => setShowAddEntryModal(true)}
              style={{ padding: '6px 14px', background: 'none', border: `1px solid ${C.gold}`, borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.gold }}>
              + Entry
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      {myEntries.length > 1 ? (
        /* Multi-entry: entry tabs + leaderboard + chat in one bar */
        <div style={{ background: C.surf, borderBottom: `1px solid ${C.surf3}`, display: 'flex', overflowX: 'auto' }}>
          {myEntries.map(entry => {
            const num = entry.entry_number ?? 1
            const active = activeEntryNum === num && tab === 'bracket'
            return (
              <button key={num}
                onClick={() => { setActiveEntryNum(num); setTab('bracket') }}
                style={{
                  padding: '9px 16px', flexShrink: 0,
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${active ? C.gold : 'transparent'}`,
                  cursor: 'pointer',
                  fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
                  color: active ? C.gold : C.muted,
                  textTransform: 'uppercase' as const,
                }}>
                {entry.entry_name}
                {entry.is_submitted && <span style={{ color: C.green, marginLeft: 4 }}>✓</span>}
              </button>
            )
          })}
          <button onClick={() => setTab('leaderboard')}
            style={{ padding: '9px 16px', flexShrink: 0, background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'leaderboard' ? C.gold : 'transparent'}`, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: tab === 'leaderboard' ? C.gold : C.muted }}>
            🏅 Leaderboard
          </button>
          <button onClick={() => setTab('chat')}
            style={{ padding: '9px 16px', flexShrink: 0, background: 'none', border: 'none', borderBottom: `2px solid ${tab === 'chat' ? C.gold : 'transparent'}`, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: tab === 'chat' ? C.gold : C.muted }}>
            💬 Chat
          </button>
        </div>
      ) : (
        /* Single entry: original bracket/leaderboard/chat tabs */
        <div style={{ background: C.surf, borderBottom: `1px solid ${C.surf3}`, padding: '6px 20px', display: 'flex', gap: 6 }}>
          {(['bracket', 'leaderboard', 'chat'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 18px',
              background: tab === t ? C.gold : 'transparent',
              color: tab === t ? C.bg : C.sub,
              border: 'none', borderRadius: 5,
              fontFamily: 'Oswald,sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: 1.5,
              cursor: 'pointer', textTransform: 'uppercase', transition: 'all .15s',
            }}>{t}</button>
          ))}
        </div>
      )}

      {/* ── Leaderboard ── */}
      {tab === 'leaderboard' && (
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
            🏅 Leaderboard — {leaderboard.length} entries
          </div>
          {leaderboard.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>
              No entries yet — be the first to submit!
            </div>
          ) : leaderboard.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: C.surf, border: `1px solid ${e.user_id === userId ? C.gold : C.surf3}`, borderRadius: 8, marginBottom: 6 }}>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.muted, width: 28 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: e.user_id === userId ? C.gold : C.text }}>
                  {e.entry_name} {e.user_id === userId && '(You)'}
                </div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 2 }}>
                  Submitted {new Date(e.submitted_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.gold }}>
                {e.total_score ?? 0} pts
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Chat ── */}
      {tab === 'chat' && (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 20px 0', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)' }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
            Bracket Chat
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 8 }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>
                No messages yet. Start the conversation!
              </div>
            )}
            {chatMessages.map((m: any, i: number) => {
              const isMe = m.user_id === userId
              return (
                <div key={m.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 3 }}>
                    {isMe ? 'You' : (m.display_name || 'Player')}
                  </div>
                  <div style={{
                    maxWidth: '80%', padding: '8px 11px',
                    borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: isMe ? 'rgba(245,166,35,.12)' : C.surf2,
                    border: isMe ? '1px solid rgba(245,166,35,.22)' : `1px solid ${C.surf3}`,
                    fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text, lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}>{m.message}</div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>
          <div style={{ borderTop: `1px solid ${C.surf3}`, paddingTop: 10, paddingBottom: 16, display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Message..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBracketChat() } }}
              style={{ flex: 1, padding: '9px 11px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Inter,sans-serif', fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={sendBracketChat}
              disabled={!chatInput.trim()}
              style={{ padding: '9px 13px', background: chatInput.trim() ? C.gold : C.surf3, border: 'none', borderRadius: 8, cursor: chatInput.trim() ? 'pointer' : 'default', fontFamily: 'Anton,sans-serif', fontSize: 14, color: chatInput.trim() ? C.bg : C.muted }}
            >↑</button>
          </div>
        </div>
      )}

      {/* ── Bracket — Desktop ── */}
      {tab === 'bracket' && (
        <>
          {/* Desktop (≥ 900px): 5-column grid, horizontally scrollable */}
          <div className="bracket-desktop" style={{ overflowX: 'auto', padding: '16px 16px 120px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 200px 260px 200px 1fr',
              gap: 12,
              minWidth: 1050,
              alignItems: 'start',
            }}>
              {leftRegionalsCol}
              {leftSRCol}
              {cwsCol}
              {rightSRCol}
              {rightRegionalsCol}
            </div>
          </div>

          {/* Mobile (< 900px): tabbed sections */}
          <div className="bracket-mobile" style={{ display: 'none' }}>
            {/* Mobile section tabs */}
            <div style={{
              display: 'flex', overflowX: 'auto', gap: 0,
              background: C.surf2, borderBottom: `1px solid ${C.surf3}`,
            }}>
              {([
                ['left',        'Left Regionals'],
                ['super-left',  'Super Reg L'],
                ['cws',         'CWS Center'],
                ['super-right', 'Super Reg R'],
                ['right',       'Right Regionals'],
              ] as [MSection, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setMSection(k)} style={{
                  padding: '10px 14px', flexShrink: 0,
                  background: mSection === k ? C.gold : 'transparent',
                  color: mSection === k ? C.bg : C.sub,
                  border: 'none', borderBottom: mSection === k ? `2px solid ${C.gold}` : '2px solid transparent',
                  fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1,
                  cursor: 'pointer', textTransform: 'uppercase',
                }}>{label}</button>
              ))}
            </div>
            <div
              onTouchStart={handleBracketTouchStart}
              onTouchEnd={handleBracketTouchEnd}
              style={{ padding: '16px 16px 100px' }}
            >
              {mSection === 'left'        && leftRegionalsCol}
              {mSection === 'super-left'  && leftSRCol}
              {mSection === 'cws'         && cwsCol}
              {mSection === 'super-right' && rightSRCol}
              {mSection === 'right'       && rightRegionalsCol}
            </div>
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 900px) {
          .bracket-desktop { display: none !important; }
          .bracket-mobile  { display: block !important; }
        }
        @media (max-width: 900px) {
          .bracket-mobile .bracket-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 6px !important;
          }
          .bracket-mobile .team-card {
            padding: 7px 6px !important;
            font-size: 9px !important;
          }
          .bracket-mobile .bracket-content {
            -webkit-overflow-scrolling: touch;
          }
          .tab-bar {
            position: sticky;
            top: 0;
            z-index: 50;
          }
        }
      `}</style>

      {/* ── Add Entry confirmation modal ── */}
      {showAddEntryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#0c1422', border: '1px solid #1e2d47', borderRadius: 14, padding: 28, maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>🏆</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: '#e4edf7', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginBottom: 8 }}>
              Add Another Entry?
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: '#7a90aa', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
              You will be charged another entry fee of{' '}
              <strong style={{ color: '#f5a623' }}>${(entryFeeCents/100).toFixed(2)}</strong>{' '}
              to submit a second bracket.
              <br/>
              Your wallet balance: <strong style={{ color: walletBalance >= entryFeeCents ? '#15c678' : '#f03a5a' }}>${(walletBalance/100).toFixed(2)}</strong>
            </div>
            {walletBalance < entryFeeCents && (
              <div style={{ padding: '8px 12px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#f03a5a', marginBottom: 12, textAlign: 'center' }}>
                ⚠️ Not enough funds
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAddEntryModal(false)}
                style={{ flex: 1, padding: '12px', background: 'none', border: '1px solid #1e2d47', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa' }}>
                Cancel
              </button>
              <button
                onClick={() => { setShowAddEntryModal(false); handleAddEntry() }}
                disabled={walletBalance < entryFeeCents}
                style={{ flex: 2, padding: '12px', background: walletBalance >= entryFeeCents ? '#f5a623' : '#1e2d47', border: 'none', borderRadius: 8, cursor: walletBalance >= entryFeeCents ? 'pointer' : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: walletBalance >= entryFeeCents ? '#070a12' : '#3e5470', textTransform: 'uppercase' as const }}>
                Pay ${(entryFeeCents/100).toFixed(2)} & Add Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wallet modal ── */}
      {showWalletModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowWalletModal(false)}
        >
          <div
            style={{ background: '#0c1422', border: '1px solid #1e2d47', borderRadius: 14, padding: 28, maxWidth: 380, width: '90%' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: '#f5a623', letterSpacing: 1, marginBottom: 16 }}>💰 Your Wallet</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, color: '#f5a623', marginBottom: 8 }}>
              ${((walletBalance ?? 0) / 100).toFixed(2)}
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa', marginBottom: 20 }}>Available balance</div>
            <button
              onClick={() => { setShowWalletModal(false); window.open('/wallet', '_blank') }}
              style={{ width: '100%', padding: '12px', background: '#f5a623', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: '#070a12' }}
            >
              Add Funds (opens in new tab)
            </button>
            <button
              onClick={() => setShowWalletModal(false)}
              style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #1e2d47', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa', marginTop: 8 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
