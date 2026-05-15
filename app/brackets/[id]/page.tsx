'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { TournamentMatchup, UserBracketEntry, UserBracketPick, Team } from '@/lib/bracketTypes'
import RegionalPod from '@/components/bracket/RegionalPod'
import MatchupCard from '@/components/bracket/MatchupCard'
import BracketLeaderboard from '@/components/bracket/BracketLeaderboard'

const C = {
  bg: '#070a12',
  surf: '#0c1422',
  surf2: '#131d30',
  surf3: '#1e2d47',
  gold: '#f5a623',
  text: '#e4edf7',
  sub: '#7a90aa',
  muted: '#3e5470',
  green: '#15c678',
  red: '#f03a5a',
}

interface BracketContest {
  id: string
  name: string
  sport: string
  season: number
  status: string
  entry_fee_cents: number
  prize_pool_cents: number
  max_entries: number
  entry_count: number
  settings: any
}

type Tab = 'bracket' | 'leaderboard'

function formatCents(cents: number): string {
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(2)}`
}

export default function BracketContestPage() {
  const params = useParams()
  const router = useRouter()
  const contestId = params.id as string
  const supabase = createClientComponentClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [contest, setContest] = useState<BracketContest | null>(null)
  const [matchups, setMatchups] = useState<TournamentMatchup[]>([])
  const [entry, setEntry] = useState<UserBracketEntry | null>(null)
  const [picks, setPicks] = useState<UserBracketPick[]>([])
  const [tab, setTab] = useState<Tab>('bracket')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)

    const [contestRes, matchupsRes] = await Promise.all([
      supabase.from('bracket_contests').select('*').eq('id', contestId).single(),
      supabase.from('tournament_matchups').select('*').eq('contest_id', contestId).order('matchup_index'),
    ])

    if (contestRes.data) setContest(contestRes.data)
    if (matchupsRes.data) setMatchups(matchupsRes.data)

    if (user?.id) {
      const { data: entryData } = await supabase
        .from('user_bracket_entries')
        .select('*')
        .eq('contest_id', contestId)
        .eq('user_id', user.id)
        .single()

      if (entryData) {
        setEntry(entryData)
        const { data: picksData } = await supabase
          .from('user_bracket_picks')
          .select('*')
          .eq('entry_id', entryData.id)
        if (picksData) setPicks(picksData)
      }
    }

    setLoading(false)
  }, [supabase, contestId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const isLocked = !!(
    contest?.status === 'locked' ||
    contest?.status === 'active' ||
    contest?.status === 'completed' ||
    entry?.is_locked
  )

  const picksNeeded = matchups.filter(m => m.team1 !== null && m.team2 !== null).length
  const picksCount = picks.length
  const allPicksMade = picksCount >= picksNeeded && picksNeeded > 0

  const handlePick = async (matchupId: string, team: Team, predictedSeries?: '2-0' | '2-1') => {
    if (isLocked) return

    // Optimistic update
    setPicks(prev => {
      const existing = prev.findIndex(p => p.matchup_id === matchupId)
      const updated: UserBracketPick = {
        id: existing >= 0 ? prev[existing].id : `temp-${matchupId}`,
        entry_id: entry?.id ?? '',
        matchup_id: matchupId,
        picked_team: team,
        predicted_series: predictedSeries ?? null,
        is_correct: null,
        points_earned: 0,
      }
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = updated
        return next
      }
      return [...prev, updated]
    })

    const res = await fetch(`/api/brackets/${contestId}/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchupId, pickedTeam: team, predictedSeries }),
    })

    if (res.ok) {
      const json = await res.json()
      // Refresh entry so we have a real entry id for future picks
      if (!entry && json.entryId) {
        const { data: entryData } = await supabase
          .from('user_bracket_entries')
          .select('*')
          .eq('id', json.entryId)
          .single()
        if (entryData) {
          setEntry(entryData)
          // Refresh picks with real ids
          const { data: picksData } = await supabase
            .from('user_bracket_picks')
            .select('*')
            .eq('entry_id', entryData.id)
          if (picksData) setPicks(picksData)
        }
      }
    }
  }

  const handleSubmit = async () => {
    if (!allPicksMade || isLocked || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/brackets/${contestId}/submit`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setSubmitError(json.error ?? 'Failed to submit')
      } else {
        setSubmitSuccess(true)
        await loadData()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const getMatchupsByRegion = (region: string) =>
    matchups.filter(m => m.region === region).sort((a, b) => a.matchup_index - b.matchup_index)

  const getPicksByMatchups = (regionMatchups: TournamentMatchup[]) => {
    const ids = new Set(regionMatchups.map(m => m.id))
    return picks.filter(p => ids.has(p.matchup_id))
  }

  const srMatchup1 = matchups.find(m => m.region === 'super_regional_1')
  const srMatchup2 = matchups.find(m => m.region === 'super_regional_2')
  const champMatchup = matchups.find(m => m.region === 'championship')

  const pickFor = (matchup: TournamentMatchup | undefined): UserBracketPick | null => {
    if (!matchup) return null
    return picks.find(p => p.matchup_id === matchup.id) ?? null
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: C.sub, fontFamily: 'Oswald, sans-serif', fontSize: 16, letterSpacing: 1 }}>
          LOADING...
        </span>
      </div>
    )
  }

  if (!contest) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: C.red, fontFamily: 'Oswald, sans-serif' }}>Contest not found.</span>
      </div>
    )
  }

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 24px',
    background: active ? C.gold : 'transparent',
    color: active ? C.bg : C.sub,
    border: 'none',
    borderRadius: 6,
    fontFamily: 'Oswald, sans-serif',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 1.5,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      {/* Top bar */}
      <div style={{
        background: C.surf,
        borderBottom: `1px solid ${C.surf3}`,
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: C.surf3,
            border: 'none',
            color: C.sub,
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'Oswald, sans-serif',
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          ← BACK
        </button>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            fontFamily: 'Anton, sans-serif',
            fontSize: 20,
            color: C.text,
            letterSpacing: 1,
          }}>
            {contest.name}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 2 }}>
            <span style={{ fontSize: 12, color: C.sub }}>
              Entry: <strong style={{ color: C.gold }}>{formatCents(contest.entry_fee_cents)}</strong>
            </span>
            <span style={{ fontSize: 12, color: C.sub }}>
              Prize Pool: <strong style={{ color: C.green }}>{formatCents(contest.prize_pool_cents)}</strong>
            </span>
            <span style={{ fontSize: 12, color: C.sub }}>
              Status: <strong style={{ color: contest.status === 'open' ? C.green : C.muted, textTransform: 'uppercase' }}>{contest.status}</strong>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {!isLocked && (
            <div style={{ fontSize: 11, color: allPicksMade ? C.green : C.sub }}>
              {picksCount} / {picksNeeded} picks made
            </div>
          )}
          {entry?.is_submitted && (
            <div style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>✓ BRACKET SUBMITTED</div>
          )}
          {submitSuccess && !entry?.is_submitted && (
            <div style={{ fontSize: 11, color: C.green }}>Submitted!</div>
          )}
          {submitError && (
            <div style={{ fontSize: 11, color: C.red }}>{submitError}</div>
          )}
          {!isLocked && !entry?.is_submitted && (
            <button
              onClick={handleSubmit}
              disabled={!allPicksMade || submitting}
              style={{
                padding: '8px 20px',
                background: allPicksMade ? C.gold : C.surf3,
                color: allPicksMade ? C.bg : C.muted,
                border: 'none',
                borderRadius: 6,
                fontFamily: 'Oswald, sans-serif',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: 1,
                cursor: allPicksMade ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
              }}
            >
              {submitting ? 'SUBMITTING...' : 'SUBMIT BRACKET'}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        background: C.surf,
        borderBottom: `1px solid ${C.surf3}`,
        padding: '8px 20px',
        display: 'flex',
        gap: 8,
      }}>
        <button style={tabButtonStyle(tab === 'bracket')} onClick={() => setTab('bracket')}>BRACKET</button>
        <button style={tabButtonStyle(tab === 'leaderboard')} onClick={() => setTab('leaderboard')}>LEADERBOARD</button>
      </div>

      {/* Content */}
      {tab === 'leaderboard' ? (
        <div style={{ padding: 20, maxWidth: 700, margin: '0 auto' }}>
          <BracketLeaderboard contestId={contestId} currentUserId={userId} />
        </div>
      ) : (
        <div style={{ overflowX: 'auto', padding: 16 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            gap: 16,
            minWidth: 960,
            alignItems: 'start',
          }}>
            {/* Left: Stillwater + Baton Rouge */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <RegionalPod
                regionName="Stillwater"
                matchups={getMatchupsByRegion('stillwater')}
                userPicks={getPicksByMatchups(getMatchupsByRegion('stillwater'))}
                onPick={handlePick}
                isLocked={isLocked}
                mirrored={false}
              />
              <RegionalPod
                regionName="Baton Rouge"
                matchups={getMatchupsByRegion('baton_rouge')}
                userPicks={getPicksByMatchups(getMatchupsByRegion('baton_rouge'))}
                onPick={handlePick}
                isLocked={isLocked}
                mirrored={false}
              />
            </div>

            {/* Center: Super Regional 1, Championship, Super Regional 2 */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              alignItems: 'center',
              padding: '0 8px',
              minWidth: 240,
            }}>
              <div style={{ width: '100%' }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  color: C.muted,
                  fontFamily: 'Oswald, sans-serif',
                  textAlign: 'center',
                  marginBottom: 8,
                }}>
                  SUPER REGIONAL 1
                </div>
                {srMatchup1 ? (
                  <MatchupCard
                    matchup={srMatchup1}
                    userPick={pickFor(srMatchup1)}
                    onPick={handlePick}
                    isLocked={isLocked}
                    showSeriesPicker={true}
                  />
                ) : (
                  <div style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>TBD</div>
                )}
              </div>

              <div style={{ width: '100%' }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  color: C.gold,
                  fontFamily: 'Oswald, sans-serif',
                  textAlign: 'center',
                  marginBottom: 8,
                }}>
                  CHAMPIONSHIP — CWS
                </div>
                {champMatchup ? (
                  <MatchupCard
                    matchup={champMatchup}
                    userPick={pickFor(champMatchup)}
                    onPick={handlePick}
                    isLocked={isLocked}
                    showSeriesPicker={true}
                  />
                ) : (
                  <div style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>TBD</div>
                )}
              </div>

              <div style={{ width: '100%' }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  color: C.muted,
                  fontFamily: 'Oswald, sans-serif',
                  textAlign: 'center',
                  marginBottom: 8,
                }}>
                  SUPER REGIONAL 2
                </div>
                {srMatchup2 ? (
                  <MatchupCard
                    matchup={srMatchup2}
                    userPick={pickFor(srMatchup2)}
                    onPick={handlePick}
                    isLocked={isLocked}
                    showSeriesPicker={true}
                  />
                ) : (
                  <div style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>TBD</div>
                )}
              </div>
            </div>

            {/* Right: Clemson + Coral Gables */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <RegionalPod
                regionName="Clemson"
                matchups={getMatchupsByRegion('clemson')}
                userPicks={getPicksByMatchups(getMatchupsByRegion('clemson'))}
                onPick={handlePick}
                isLocked={isLocked}
                mirrored={true}
              />
              <RegionalPod
                regionName="Coral Gables"
                matchups={getMatchupsByRegion('coral_gables')}
                userPicks={getPicksByMatchups(getMatchupsByRegion('coral_gables'))}
                onPick={handlePick}
                isLocked={isLocked}
                mirrored={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
