'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import BracketLeaderboard from '@/components/bracket/BracketLeaderboard'
import type { Team } from '@/lib/bracketTypes'

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#f5a623', text: '#e4edf7', sub: '#7a90aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a',
}

// 2025 NCAA Baseball Tournament regionals
const DEFAULT_REGIONS: Record<string, { name: string; teams: Team[] }> = {
  nashville:   { name: 'Nashville',    teams: [{ id: 'vand',   name: 'Vanderbilt',      seed: 1, record: '45-12', conference: 'SEC'       }, { id: 'etsu',  name: 'E. Tennessee St', seed: 2, record: '42-15', conference: 'SoCon'    }, { id: 'wst',    name: 'Wright State',     seed: 3, record: '36-19', conference: 'HL'        }, { id: 'lou',   name: 'Louisville',      seed: 4, record: '39-18', conference: 'ACC'       }] },
  hattiesburg: { name: 'Hattiesburg',  teams: [{ id: 'smiss',  name: 'Southern Miss',   seed: 1, record: '43-14', conference: 'Sun Belt'  }, { id: 'ala',   name: 'Alabama',          seed: 2, record: '40-16', conference: 'SEC'       }, { id: 'col',    name: 'Columbia',         seed: 3, record: '34-22', conference: 'Ivy'       }, { id: 'mia',   name: 'Miami (FL)',       seed: 4, record: '38-20', conference: 'ACC'       }] },
  tallahassee: { name: 'Tallahassee',  teams: [{ id: 'fsu',    name: 'Florida State',   seed: 1, record: '44-14', conference: 'ACC'       }, { id: 'bcu',   name: 'Bethune-Cookman',  seed: 2, record: '38-22', conference: 'SWAC'      }, { id: 'neu',    name: 'Northeastern',     seed: 3, record: '35-21', conference: 'CAA'       }, { id: 'miss',  name: 'Mississippi State',seed: 4, record: '37-20', conference: 'SEC'       }] },
  corvallis:   { name: 'Corvallis',    teams: [{ id: 'orst',   name: 'Oregon State',    seed: 1, record: '42-16', conference: 'Pac-12'    }, { id: 'tcu',   name: 'TCU',              seed: 2, record: '40-17', conference: 'Big 12'    }, { id: 'mich',   name: 'Michigan',         seed: 3, record: '36-19', conference: 'Big Ten'   }, { id: 'usc',   name: 'USC',              seed: 4, record: '35-21', conference: 'Pac-12'    }] },
  austin:      { name: 'Austin',       teams: [{ id: 'tex',    name: 'Texas',           seed: 1, record: '44-13', conference: 'Big 12'    }, { id: 'uconn', name: 'UConn',            seed: 2, record: '39-18', conference: 'Big East'  }, { id: 'kst',    name: 'Kansas State',     seed: 3, record: '35-22', conference: 'Big 12'    }, { id: 'utsa',  name: 'UTSA',             seed: 4, record: '33-24', conference: 'CUSA'      }] },
  los_angeles: { name: 'Los Angeles',  teams: [{ id: 'ucla',   name: 'UCLA',            seed: 1, record: '42-15', conference: 'Pac-12'    }, { id: 'fres',  name: 'Fresno State',     seed: 2, record: '38-19', conference: 'MWC'       }, { id: 'asu',    name: 'Arizona State',    seed: 3, record: '36-20', conference: 'Pac-12'    }, { id: 'uci',   name: 'UC Irvine',        seed: 4, record: '34-23', conference: 'Big West'  }] },
  oxford:      { name: 'Oxford',       teams: [{ id: 'olemiss',name: 'Ole Miss',         seed: 1, record: '45-12', conference: 'SEC'       }, { id: 'wku',   name: 'Western Kentucky', seed: 2, record: '38-20', conference: 'CUSA'      }, { id: 'gtech',  name: 'Georgia Tech',     seed: 3, record: '35-21', conference: 'ACC'       }, { id: 'murr',  name: 'Murray State',     seed: 4, record: '32-25', conference: 'OVC'       }] },
  athens:      { name: 'Athens',       teams: [{ id: 'uga',    name: 'Georgia',          seed: 1, record: '44-14', conference: 'SEC'       }, { id: 'bing',  name: 'Binghamton',       seed: 2, record: '37-21', conference: 'AE'        }, { id: 'okst',   name: 'Oklahoma State',   seed: 3, record: '36-20', conference: 'Big 12'    }, { id: 'duke',  name: 'Duke',             seed: 4, record: '34-23', conference: 'ACC'       }] },
}

// Pairings: [leftRegion, rightRegion] — index 0-3 maps to 4 super regionals
const SR_PAIRINGS: Array<[string, string]> = [
  ['nashville', 'austin'],
  ['hattiesburg', 'los_angeles'],
  ['tallahassee', 'oxford'],
  ['corvallis', 'athens'],
]

const LEFT_REGIONS  = ['nashville', 'hattiesburg', 'tallahassee', 'corvallis']
const RIGHT_REGIONS = ['austin', 'los_angeles', 'oxford', 'athens']

type BracketPicks = {
  regionals:      Record<string, Team>
  superRegionals: Record<number, Team>
  semifinals:     Record<number, Team>
  champion:       Team | null
  seriesResult:   '2-0' | '2-1' | null
}

function emptyPicks(): BracketPicks {
  return { regionals: {}, superRegionals: {}, semifinals: {}, champion: null, seriesResult: null }
}

function countPicks(p: BracketPicks) {
  return Object.keys(p.regionals).length
    + Object.keys(p.superRegionals).length
    + Object.keys(p.semifinals).length
    + (p.champion ? 1 : 0)
    + (p.seriesResult ? 1 : 0)
}

const TOTAL_PICKS = 16 // 8 regionals + 4 SR + 2 semis + 1 champ + 1 series

type Tab = 'bracket' | 'leaderboard'

/* ── Sub-components ───────────────────────────────────── */

function TeamCard({ team, isPicked, onClick, isLocked }: {
  team: Team; isPicked: boolean; onClick: () => void; isLocked: boolean
}) {
  return (
    <div
      onClick={isLocked ? undefined : onClick}
      style={{
        border: `2px solid ${isPicked ? C.gold : C.surf3}`,
        background: isPicked ? 'rgba(245,166,35,.12)' : C.surf2,
        borderRadius: 8, padding: '8px 6px', cursor: isLocked ? 'default' : 'pointer',
        textAlign: 'center', transition: 'all .15s',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      }}
      onMouseEnter={e => { if (!isLocked && !isPicked) (e.currentTarget as HTMLElement).style.borderColor = C.gold + '66' }}
      onMouseLeave={e => { if (!isPicked) (e.currentTarget as HTMLElement).style.borderColor = C.surf3 }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        background: isPicked ? 'rgba(245,166,35,.2)' : C.surf3,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: isPicked ? C.gold : C.sub }}>
          {team.seed}
        </span>
      </div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: isPicked ? C.gold : C.text, lineHeight: 1.2, maxWidth: 76, wordBreak: 'break-word' }}>
        {team.name}
      </div>
      {team.record && (
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>{team.record}</div>
      )}
    </div>
  )
}

function RegionalPodGrid({ regionKey, regions, picks, onPick, isLocked }: {
  regionKey: string
  regions: Record<string, { name: string; teams: Team[] }>
  picks: BracketPicks
  onPick: (key: string, team: Team) => void
  isLocked: boolean
}) {
  const regionData = regions[regionKey]
  if (!regionData) return null
  const pickedId = picks.regionals[regionKey]?.id
  return (
    <div style={{
      background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10,
      padding: '10px 10px 12px', flex: 1,
    }}>
      <div style={{
        fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.gold,
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8,
      }}>
        {regionData.name} Regional
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        {regionData.teams.map(team => (
          <TeamCard
            key={team.id}
            team={team}
            isPicked={pickedId === team.id}
            onClick={() => onPick(regionKey, team)}
            isLocked={isLocked}
          />
        ))}
      </div>
    </div>
  )
}

function SRBox({ srIndex, side, regions, picks, onSRPick, isLocked }: {
  srIndex: number; side: 'left' | 'right'
  regions: Record<string, { name: string; teams: Team[] }>
  picks: BracketPicks
  onSRPick: (srIndex: number, team: Team) => void
  isLocked: boolean
}) {
  const [leftKey, rightKey] = SR_PAIRINGS[srIndex]
  const regionKey = side === 'left' ? leftKey : rightKey
  const regionData = regions[regionKey]
  const regionalWinner = picks.regionals[regionKey]
  const srWinner = picks.superRegionals[srIndex]
  const isThisSidePicked = !!(srWinner && regionalWinner && srWinner.id === regionalWinner.id)
  const canClick = !!regionalWinner && !isLocked

  return (
    <div
      onClick={canClick ? () => onSRPick(srIndex, regionalWinner!) : undefined}
      style={{
        padding: '10px 12px', background: isThisSidePicked ? 'rgba(245,166,35,.08)' : C.surf,
        border: `1px solid ${isThisSidePicked ? C.gold : C.surf3}`,
        borderRadius: 8, minHeight: 52, flex: 1,
        cursor: canClick ? 'pointer' : 'default',
        opacity: regionalWinner ? 1 : 0.5,
        transition: 'all .15s',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      {regionalWinner ? (
        <>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: isThisSidePicked ? 'rgba(245,166,35,.2)' : C.surf3,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 10, color: isThisSidePicked ? C.gold : C.sub }}>
              {regionalWinner.seed}
            </span>
          </div>
          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: isThisSidePicked ? C.gold : C.text, flex: 1 }}>
            {regionalWinner.name}
          </span>
          {isThisSidePicked && <span style={{ color: C.gold, fontSize: 13 }}>✓</span>}
        </>
      ) : (
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
          {regionData?.name ?? regionKey} Winner
        </span>
      )}
    </div>
  )
}

function CWSMatchupBox({ label, team1, team2, pickedTeam, onPick, isLocked }: {
  label: string
  team1: Team | null
  team2: Team | null
  pickedTeam: Team | null
  onPick: (team: Team) => void
  isLocked: boolean
}) {
  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted,
        letterSpacing: 2, textTransform: 'uppercase',
        padding: '6px 10px', borderBottom: `1px solid ${C.surf3}`, background: C.surf2,
      }}>
        {label}
      </div>
      {[team1, team2].map((team, i) => {
        if (!team) {
          return (
            <div key={i} style={{ padding: '8px 10px', borderBottom: i === 0 ? `1px solid ${C.surf3}` : 'none' }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>TBD</span>
            </div>
          )
        }
        const isPicked = pickedTeam?.id === team.id
        return (
          <div
            key={i}
            onClick={isLocked || !team ? undefined : () => onPick(team)}
            style={{
              padding: '8px 10px',
              borderBottom: i === 0 ? `1px solid ${C.surf3}` : 'none',
              background: isPicked ? 'rgba(245,166,35,.1)' : 'transparent',
              cursor: team && !isLocked ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background .12s',
            }}
          >
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 10, color: C.muted, width: 14 }}>{team.seed}</span>
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: isPicked ? C.gold : C.text, flex: 1 }}>{team.name}</span>
            {isPicked && <span style={{ color: C.gold, fontSize: 12 }}>✓</span>}
          </div>
        )
      })}
    </div>
  )
}

function ChampionshipBox({ team1, team2, champion, seriesResult, onPick, onSeries, isLocked }: {
  team1: Team | null; team2: Team | null
  champion: Team | null; seriesResult: '2-0' | '2-1' | null
  onPick: (team: Team) => void; onSeries: (s: '2-0' | '2-1') => void
  isLocked: boolean
}) {
  return (
    <div style={{
      background: C.surf, border: `2px solid ${C.gold}`, borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{
        fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.gold,
        letterSpacing: 3, textTransform: 'uppercase',
        padding: '8px 12px', background: 'rgba(245,166,35,.08)', textAlign: 'center',
        borderBottom: `1px solid rgba(245,166,35,.3)`,
      }}>
        🏆 National Championship
      </div>
      {[team1, team2].map((team, i) => {
        if (!team) {
          return (
            <div key={i} style={{ padding: '10px 12px', borderBottom: i === 0 ? `1px solid ${C.surf3}` : 'none' }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>TBD</span>
            </div>
          )
        }
        const isPicked = champion?.id === team.id
        return (
          <div
            key={i}
            onClick={isLocked ? undefined : () => onPick(team)}
            style={{
              padding: '10px 12px',
              borderBottom: i === 0 ? `1px solid ${C.surf3}` : 'none',
              background: isPicked ? 'rgba(245,166,35,.12)' : 'transparent',
              cursor: !isLocked ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background .12s',
            }}
          >
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 11, color: C.muted, width: 16 }}>{team.seed}</span>
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: isPicked ? C.gold : C.text, flex: 1 }}>{team.name}</span>
            {isPicked && <span style={{ color: C.gold }}>★</span>}
          </div>
        )
      })}
      {/* Series result picker */}
      {champion && (
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, background: C.surf2 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, marginBottom: 6 }}>SERIES RESULT</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['2-0', '2-1'] as const).map(s => (
              <button
                key={s}
                onClick={isLocked ? undefined : () => onSeries(s)}
                style={{
                  flex: 1, padding: '6px 0',
                  background: seriesResult === s ? C.gold : C.surf3,
                  border: 'none', borderRadius: 6, cursor: isLocked ? 'default' : 'pointer',
                  fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
                  color: seriesResult === s ? C.bg : C.sub,
                  transition: 'all .12s',
                }}
              >{s}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main page ────────────────────────────────────────── */
export default function BracketContestPage() {
  const params  = useParams()
  const router  = useRouter()
  const contestId = params.id as string
  const supabase  = createClientComponentClient()

  const [userId,  setUserId]  = useState<string | null>(null)
  const [contest, setContest] = useState<any>(null)
  const [regions, setRegions] = useState<Record<string, { name: string; teams: Team[] }>>(DEFAULT_REGIONS)
  const [entry,   setEntry]   = useState<any>(null)
  const [picks,   setPicks]   = useState<BracketPicks>(emptyPicks())
  const [tab,     setTab]     = useState<Tab>('bracket')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg,  setSubmitMsg]  = useState<{ ok: boolean; text: string } | null>(null)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)

    const { data: contestData } = await supabase
      .from('bracket_contests').select('*').eq('id', contestId).single()
    if (contestData) {
      setContest(contestData)
      // Use bracket_data.regions if present, else fall back to defaults
      if (contestData.bracket_data?.regions) setRegions(contestData.bracket_data.regions)
    }

    if (user?.id) {
      const { data: entryData } = await supabase
        .from('user_bracket_entries').select('*')
        .eq('contest_id', contestId).eq('user_id', user.id).single()
      if (entryData) {
        setEntry(entryData)
        if (entryData.bracket_data?.picks) {
          setPicks(entryData.bracket_data.picks)
        }
      }
    }

    setLoading(false)
  }, [supabase, contestId])

  useEffect(() => { loadData() }, [loadData])

  const isLocked = !!(
    contest?.status === 'locked' || contest?.status === 'active' ||
    contest?.status === 'completed' || entry?.is_locked
  )

  /* ── Pick handlers ── */
  function handleRegionalPick(regionKey: string, team: Team) {
    if (isLocked) return
    setPicks(prev => {
      const next = { ...prev, regionals: { ...prev.regionals, [regionKey]: team } }
      // Invalidate downstream picks that depended on this regional
      const srIndex = SR_PAIRINGS.findIndex(([l, r]) => l === regionKey || r === regionKey)
      if (srIndex >= 0) {
        const srWinner = prev.superRegionals[srIndex]
        if (srWinner && srWinner.id !== team.id) {
          // Old SR pick was from a different team — invalidate SR and beyond
          const { [srIndex]: _, ...restSR } = next.superRegionals
          next.superRegionals = restSR
          // Figure out which CWS semi this SR feeds and clear it too
          const cwsSemiIdx = srIndex < 2 ? 0 : 1
          if (next.semifinals[cwsSemiIdx]) {
            const { [cwsSemiIdx]: __, ...restSemi } = next.semifinals
            next.semifinals = restSemi
            next.champion = null
            next.seriesResult = null
          }
        }
      }
      return next
    })
  }

  function handleSRPick(srIndex: number, team: Team) {
    if (isLocked) return
    setPicks(prev => {
      const next = { ...prev, superRegionals: { ...prev.superRegionals, [srIndex]: team } }
      // Invalidate CWS semi that depends on this SR
      const cwsSemiIdx = srIndex < 2 ? 0 : 1
      const semiWinner = prev.semifinals[cwsSemiIdx]
      if (semiWinner) {
        // check if semi winner still valid (must be SR0 or SR1 winner for semi 0, etc)
        const siblingIdx = cwsSemiIdx === 0 ? (srIndex === 0 ? 1 : 0) : (srIndex === 2 ? 3 : 2)
        const sr0w = srIndex < 2 ? team : prev.superRegionals[srIndex < 2 ? 0 : 2]
        const sr1w = siblingIdx < 2 ? prev.superRegionals[siblingIdx] : prev.superRegionals[siblingIdx]
        if (!sr0w || !sr1w || (semiWinner.id !== sr0w.id && semiWinner.id !== sr1w.id)) {
          const { [cwsSemiIdx]: _, ...restSemi } = next.semifinals
          next.semifinals = restSemi
          next.champion = null
          next.seriesResult = null
        }
      }
      return next
    })
  }

  function handleSemiFinalPick(semiIdx: number, team: Team) {
    if (isLocked) return
    setPicks(prev => {
      const next = { ...prev, semifinals: { ...prev.semifinals, [semiIdx]: team } }
      if (prev.champion && prev.champion.id !== team.id) {
        // if we changed a semi pick, champ may be invalid
        const otherSemi = prev.semifinals[semiIdx === 0 ? 1 : 0]
        if (prev.champion.id !== (otherSemi?.id ?? '')) {
          next.champion = null
          next.seriesResult = null
        }
      }
      return next
    })
  }

  function handleChampionPick(team: Team) {
    if (isLocked) return
    setPicks(prev => ({ ...prev, champion: team, seriesResult: prev.seriesResult }))
  }

  function handleSeriesPick(s: '2-0' | '2-1') {
    if (isLocked) return
    setPicks(prev => ({ ...prev, seriesResult: s }))
  }

  /* ── Submit ── */
  async function handleSubmit() {
    if (isLocked || submitting) return
    setSubmitting(true)
    setSubmitMsg(null)
    try {
      const res = await fetch(`/api/brackets/${contestId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSubmitMsg({ ok: false, text: json.error ?? 'Failed to submit' })
      } else {
        setSubmitMsg({ ok: true, text: 'Bracket submitted! 🎉' })
        await loadData()
      }
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Derived CWS teams ── */
  // SR0 winner vs SR1 winner → CWS Semi 0
  // SR2 winner vs SR3 winner → CWS Semi 1
  const cwsSemi0Team1 = picks.superRegionals[0] ?? null
  const cwsSemi0Team2 = picks.superRegionals[1] ?? null
  const cwsSemi1Team1 = picks.superRegionals[2] ?? null
  const cwsSemi1Team2 = picks.superRegionals[3] ?? null
  const champTeam1   = picks.semifinals[0] ?? null
  const champTeam2   = picks.semifinals[1] ?? null

  const totalPicks = countPicks(picks)
  const allDone    = totalPicks >= TOTAL_PICKS

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 15, letterSpacing: 2 }}>LOADING BRACKET...</span>
    </div>
  )

  if (!contest) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: C.red, fontFamily: 'Oswald,sans-serif' }}>Contest not found.</span>
    </div>
  )

  /* ── JSX ── */
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

        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 1 }}>{contest.name}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
              Entry: <strong style={{ color: C.gold }}>{contest.entry_fee_cents === 0 ? 'Free' : `$${(contest.entry_fee_cents / 100).toFixed(2)}`}</strong>
            </span>
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
              Status: <strong style={{ color: contest.status === 'open' ? C.green : C.muted, textTransform: 'uppercase' }}>{contest.status}</strong>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {entry?.is_submitted
            ? <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.green }}>✓ SUBMITTED</span>
            : <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: allDone ? C.green : C.sub }}>
                {totalPicks} / {TOTAL_PICKS} picks
              </span>
          }
          {submitMsg && (
            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: submitMsg.ok ? C.green : C.red }}>{submitMsg.text}</span>
          )}
          {!isLocked && !entry?.is_submitted && (
            <button
              onClick={handleSubmit}
              disabled={!allDone || submitting}
              style={{
                padding: '8px 18px', borderRadius: 6, border: 'none', cursor: allDone ? 'pointer' : 'not-allowed',
                background: allDone ? C.gold : C.surf3,
                color: allDone ? C.bg : C.muted,
                fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
              }}
            >{submitting ? 'SUBMITTING...' : 'SUBMIT BRACKET'}</button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.surf3}`, padding: '6px 20px', display: 'flex', gap: 6 }}>
        {(['bracket', 'leaderboard'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px',
            background: tab === t ? C.gold : 'transparent',
            color: tab === t ? C.bg : C.sub,
            border: 'none', borderRadius: 5,
            fontFamily: 'Oswald,sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: 1.5,
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

      {/* ── Bracket ── */}
      {tab === 'bracket' && (
        <div style={{ overflowX: 'auto', padding: '16px 12px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 168px 288px 168px 1fr',
            gap: 10,
            minWidth: 1100,
            alignItems: 'stretch',
          }}>

            {/* ── Col 1: Left regionals ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {LEFT_REGIONS.map(rk => (
                <RegionalPodGrid key={rk} regionKey={rk} regions={regions} picks={picks} onPick={handleRegionalPick} isLocked={isLocked} />
              ))}
            </div>

            {/* ── Col 2: Left super regionals ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', paddingTop: 2, marginBottom: 2 }}>
                Super Regionals
              </div>
              {SR_PAIRINGS.map(([leftKey], srIdx) => (
                <SRBox
                  key={srIdx}
                  srIndex={srIdx}
                  side="left"
                  regions={regions}
                  picks={picks}
                  onSRPick={handleSRPick}
                  isLocked={isLocked}
                />
              ))}
            </div>

            {/* ── Col 3: CWS Center ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', paddingTop: 2, marginBottom: 2 }}>
                CWS · Omaha
              </div>
              <CWSMatchupBox
                label="CWS Semifinal 1"
                team1={cwsSemi0Team1}
                team2={cwsSemi0Team2}
                pickedTeam={picks.semifinals[0] ?? null}
                onPick={t => handleSemiFinalPick(0, t)}
                isLocked={isLocked}
              />

              <ChampionshipBox
                team1={champTeam1}
                team2={champTeam2}
                champion={picks.champion}
                seriesResult={picks.seriesResult}
                onPick={handleChampionPick}
                onSeries={handleSeriesPick}
                isLocked={isLocked}
              />

              <CWSMatchupBox
                label="CWS Semifinal 2"
                team1={cwsSemi1Team1}
                team2={cwsSemi1Team2}
                pickedTeam={picks.semifinals[1] ?? null}
                onPick={t => handleSemiFinalPick(1, t)}
                isLocked={isLocked}
              />

              {/* How to Play */}
              <div style={{
                background: C.surf2, border: `1px solid ${C.surf3}`,
                borderRadius: 8, padding: 14, marginTop: 4,
              }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.gold, letterSpacing: 1, marginBottom: 8 }}>
                  HOW TO PLAY
                </div>
                <ol style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, lineHeight: 2.0, paddingLeft: 16, margin: 0 }}>
                  <li>Pick 1 team to win each of the 8 Regionals</li>
                  <li>Pick 1 team to win each Super Regional (4 total)</li>
                  <li>Pick 1 team to win each CWS Semifinal (2 total)</li>
                  <li>Pick the National Champion and series result (2-0 or 2-1)</li>
                </ol>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
                  Scoring: Regional win = 10 pts · Super Regional = 20 pts · CWS semi = 20 pts · Champion = 40 pts · Exact series +5 pts
                </div>
              </div>
            </div>

            {/* ── Col 4: Right super regionals ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', paddingTop: 2, marginBottom: 2 }}>
                Super Regionals
              </div>
              {SR_PAIRINGS.map(([, rightKey], srIdx) => (
                <SRBox
                  key={srIdx}
                  srIndex={srIdx}
                  side="right"
                  regions={regions}
                  picks={picks}
                  onSRPick={handleSRPick}
                  isLocked={isLocked}
                />
              ))}
            </div>

            {/* ── Col 5: Right regionals ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {RIGHT_REGIONS.map(rk => (
                <RegionalPodGrid key={rk} regionKey={rk} regions={regions} picks={picks} onPick={handleRegionalPick} isLocked={isLocked} />
              ))}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
