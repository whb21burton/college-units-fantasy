'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import BracketLeaderboard from '@/components/bracket/BracketLeaderboard'
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
  const router    = useRouter()
  const contestId = params.id as string
  const supabase  = createClientComponentClient()

  const [userId,       setUserId]       = useState<string | null>(null)
  const [contest,      setContest]      = useState<any>(null)
  const [entry,        setEntry]        = useState<any>(null)
  const [picks,        setPicks]        = useState<BracketPicks>(empty())
  const [tab,          setTab]          = useState<Tab>('bracket')
  const [mSection,     setMSection]     = useState<MSection>('left')
  const [loading,      setLoading]      = useState(true)
  const [submitting,   setSubmitting]   = useState(false)
  const [msg,          setMsg]          = useState<{ ok: boolean; text: string } | null>(null)
  const [hasPaid,      setHasPaid]      = useState<boolean>(false)
  const [linkedLeague, setLinkedLeague] = useState<{ id: string; name: string; buy_in: number } | null>(null)
  const [walletBalance,setWalletBalance]= useState<number | null>(null)
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatInput,    setChatInput]    = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)

    const { data: c } = await supabase.from('bracket_contests').select('*').eq('id', contestId).single()
    if (c) setContest(c)

    // Fetch the league linked to this contest (stores the real buy_in)
    const { data: league } = await supabase
      .from('leagues')
      .select('id, name, buy_in')
      .filter('settings->>bracket_contest_id', 'eq', contestId)
      .maybeSingle()
    setLinkedLeague(league ?? null)

    if (user?.id) {
      const { data: e } = await supabase.from('user_bracket_entries').select('*')
        .eq('contest_id', contestId).eq('user_id', user.id).single()
      if (e) {
        setEntry(e)
        if (e.bracket_data?.picks) setPicks(e.bracket_data.picks)
      }

      // Check paid status via league membership
      if (league) {
        if (league.buy_in === 0) {
          setHasPaid(true)
        } else {
          const { data: membership } = await supabase
            .from('league_members')
            .select('id, paid')
            .eq('league_id', league.id)
            .eq('user_id', user.id)
            .maybeSingle()
          setHasPaid(membership?.paid === true)
        }
      } else {
        setHasPaid(true) // no linked league — allow submission
      }
    }

    // Fetch wallet balance
    try {
      const walletRes = await fetch('/api/wallet')
      if (walletRes.ok) {
        const walletData = await walletRes.json()
        setWalletBalance(walletData.wallet?.balance ?? null)
      }
    } catch {}

    setLoading(false)
  }, [supabase, contestId])

  useEffect(() => { loadData() }, [loadData])

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

  const isLocked = !!(
    contest?.status === 'locked' || contest?.status === 'active' ||
    contest?.status === 'completed' || entry?.is_locked
  )

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

  /* ── Pay entry fee inline ── */
  async function handlePayAndJoin() {
    if (!linkedLeague || !userId || submitting) return
    setSubmitting(true)
    setMsg(null)
    const res = await fetch('/api/wallet/join-contest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ league_id: linkedLeague.id, team_name: 'Bracket Entry' }),
    })
    const json = await res.json()
    if (!res.ok) {
      setMsg({ ok: false, text: json.error ?? 'Payment failed' })
    } else {
      setHasPaid(true)
      setWalletBalance(prev => prev !== null ? prev - Math.round(linkedLeague.buy_in * 100) : null)
    }
    setSubmitting(false)
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

  /* ── Submit ── */
  async function handleSubmit() {
    if (countPicks(picks) < TOTAL || isLocked || submitting) return
    setSubmitting(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/brackets/${contestId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks }),
      })
      const json = await res.json()
      if (!res.ok) setMsg({ ok: false, text: json.error ?? 'Failed to submit' })
      else { setMsg({ ok: true, text: 'Bracket submitted! 🎉' }); await loadData() }
    } finally { setSubmitting(false) }
  }

  /* ── Derived CWS teams ── */
  const cwsT = (srIdx: number) => picks.superRegionals[srIdx] ?? null
  const semi0t1 = cwsT(CWS_SEMIS[0].leftSR)
  const semi0t2 = cwsT(CWS_SEMIS[0].rightSR)
  const semi1t1 = cwsT(CWS_SEMIS[1].leftSR)
  const semi1t2 = cwsT(CWS_SEMIS[1].rightSR)
  const champT1 = picks.semifinals[0] ?? null
  const champT2 = picks.semifinals[1] ?? null
  const total   = countPicks(picks)

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
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>

      {/* ── Top bar ── */}
      <div style={{
        background: C.surf, borderBottom: `1px solid ${C.surf3}`,
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <button onClick={() => router.back()} style={{
          background: C.surf3, border: 'none', color: C.sub,
          padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
          fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
        }}>← BACK</button>

        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 17, letterSpacing: 1 }}>{contest.name}</div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, marginTop: 2 }}>
            Entry: <strong style={{ color: C.gold }}>{(linkedLeague?.buy_in ?? 0) === 0 ? 'Free' : `$${(linkedLeague?.buy_in ?? 0).toFixed(2)}`}</strong>
            &ensp;·&ensp;Status: <strong style={{ color: contest.status === 'open' ? C.green : C.muted, textTransform: 'uppercase' }}>{contest.status}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, minWidth: 200 }}>
          <ProgressBar n={total} total={TOTAL} />
          {entry?.is_submitted
            ? <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.green }}>✓ BRACKET SUBMITTED</span>
            : msg && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: msg.ok ? C.green : C.red }}>{msg.text}</span>
          }
          {!isLocked && !entry?.is_submitted && (
            !hasPaid && (linkedLeague?.buy_in ?? 0) > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub }}>
                  Wallet: {walletBalance !== null ? `$${(walletBalance / 100).toFixed(2)}` : '—'}
                </div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.red }}>
                  Pay ${(linkedLeague?.buy_in ?? 0).toFixed(2)} entry fee to submit
                </div>
                <button
                  onClick={handlePayAndJoin}
                  disabled={submitting || (walletBalance !== null && walletBalance < Math.round((linkedLeague?.buy_in ?? 0) * 100))}
                  style={{ padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', background: C.gold, color: C.bg, fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}
                >
                  {submitting ? 'Processing…' : walletBalance !== null && walletBalance < Math.round((linkedLeague?.buy_in ?? 0) * 100) ? 'Insufficient Balance' : `Pay $${(linkedLeague?.buy_in ?? 0).toFixed(2)} →`}
                </button>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={total < TOTAL || submitting}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  cursor: total >= TOTAL ? 'pointer' : 'not-allowed',
                  background: total >= TOTAL ? C.gold : C.surf3,
                  color: total >= TOTAL ? C.bg : C.muted,
                  fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
                  transition: 'all .2s',
                }}
              >{submitting ? 'Submitting…' : total >= TOTAL ? 'Submit Bracket' : `${TOTAL - total} picks remaining`}</button>
            )
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
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

      {/* ── Leaderboard ── */}
      {tab === 'leaderboard' && (
        <div style={{ padding: 20, maxWidth: 700, margin: '0 auto' }}>
          <BracketLeaderboard contestId={contestId} currentUserId={userId} />
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
          <div className="bracket-desktop" style={{ overflowX: 'auto', padding: '16px 16px 32px' }}>
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
            <div style={{ padding: 16 }}>
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
      `}</style>
    </div>
  )
}
