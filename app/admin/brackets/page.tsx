'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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

const ADMIN_EMAIL = 'whb21burton@gmail.com'

type AdminTab = 'tournaments' | 'results' | 'entries'

interface BracketContest {
  id: string
  name: string
  sport: string
  season: number
  status: string
  entry_fee_cents: number
  prize_pool_cents: number
  entry_count: number
  settings: any
  created_at: string
}

interface TournamentMatchup {
  id: string
  contest_id: string
  region: string
  round: string
  matchup_index: number
  team1: any
  team2: any
  winner: any
  series_result: string | null
  status: string
}

interface UserBracketEntry {
  id: string
  entry_name: string
  total_score: number
  correct_picks: number
  is_submitted: boolean
  is_locked: boolean
  user_id: string
  submitted_at: string | null
}

interface NewContestForm {
  name: string
  sport: string
  entry_fee_cents: number
  regional_win: number
  super_regional_win: number
  championship_win: number
  exact_series_bonus: number
  status: string
}

function Input({ label, value, onChange, type = 'text' }: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: C.muted, fontFamily: 'Oswald, sans-serif', letterSpacing: 1 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: C.surf3,
          border: `1px solid ${C.muted}`,
          borderRadius: 6,
          padding: '7px 10px',
          color: C.text,
          fontSize: 13,
          fontFamily: 'Oswald, sans-serif',
          outline: 'none',
          width: '100%',
        }}
      />
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: C.muted, fontFamily: 'Oswald, sans-serif', letterSpacing: 1 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: C.surf3,
          border: `1px solid ${C.muted}`,
          borderRadius: 6,
          padding: '7px 10px',
          color: C.text,
          fontSize: 13,
          fontFamily: 'Oswald, sans-serif',
          outline: 'none',
          width: '100%',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Slider({ label, value, onChange, min, max, step = 1 }: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: C.muted, fontFamily: 'Oswald, sans-serif', letterSpacing: 1 }}>
        {label}: <span style={{ color: C.gold }}>{value}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: C.gold }}
      />
    </div>
  )
}

export default function AdminBracketsPage() {
  const supabase = createClientComponentClient()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tab, setTab] = useState<AdminTab>('tournaments')
  const [contests, setContests] = useState<BracketContest[]>([])
  const [activeContest, setActiveContest] = useState<BracketContest | null>(null)
  const [matchups, setMatchups] = useState<TournamentMatchup[]>([])
  const [entries, setEntries] = useState<UserBracketEntry[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newContest, setNewContest] = useState<NewContestForm>({
    name: '2025 NCAA Baseball Tournament',
    sport: 'baseball',
    entry_fee_cents: 500,
    regional_win: 10,
    super_regional_win: 20,
    championship_win: 40,
    exact_series_bonus: 5,
    status: 'open',
  })

  // Result editing state
  const [editingMatchup, setEditingMatchup] = useState<string | null>(null)
  const [pendingWinnerId, setPendingWinnerId] = useState<string>('')
  const [pendingSeriesResult, setPendingSeriesResult] = useState<'2-0' | '2-1'>('2-0')
  const [savingResult, setSavingResult] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null)
      setAuthLoading(false)
    })
  }, [supabase])

  const loadContests = useCallback(async () => {
    const { data } = await supabase
      .from('bracket_contests')
      .select('*')
      .order('created_at', { ascending: false })
    setContests(data ?? [])
  }, [supabase])

  const loadMatchups = useCallback(async (contestId: string) => {
    const { data } = await supabase
      .from('tournament_matchups')
      .select('*')
      .eq('contest_id', contestId)
      .order('region')
      .order('matchup_index')
    setMatchups(data ?? [])
  }, [supabase])

  const loadEntries = useCallback(async (contestId: string) => {
    const { data } = await supabase
      .from('user_bracket_entries')
      .select('*')
      .eq('contest_id', contestId)
      .order('total_score', { ascending: false })
    setEntries(data ?? [])
  }, [supabase])

  useEffect(() => {
    if (userEmail === ADMIN_EMAIL) loadContests()
  }, [userEmail, loadContests])

  useEffect(() => {
    if (activeContest) {
      loadMatchups(activeContest.id)
      loadEntries(activeContest.id)
    }
  }, [activeContest, loadMatchups, loadEntries])

  const handleCreateContest = async () => {
    setCreating(true)
    setCreateError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('bracket_contests')
      .insert({
        name: newContest.name,
        sport: newContest.sport,
        season: 2025,
        status: newContest.status,
        entry_fee_cents: newContest.entry_fee_cents,
        prize_pool_cents: 0,
        max_entries: 1000,
        entry_count: 0,
        settings: {
          scoring: {
            regional_win: newContest.regional_win,
            super_regional_win: newContest.super_regional_win,
            championship_win: newContest.championship_win,
            exact_series_bonus: newContest.exact_series_bonus,
          },
        },
        created_by: user?.id,
      })
      .select()
      .single()

    if (error) {
      setCreateError(error.message)
    } else {
      setShowCreateForm(false)
      await loadContests()
      if (data) setActiveContest(data)
    }
    setCreating(false)
  }

  const handleSaveResult = async (matchupId: string) => {
    if (!activeContest || !pendingWinnerId) return
    setSavingResult(true)
    setResultMessage(null)

    const res = await fetch(`/api/admin/brackets/${activeContest.id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchupId,
        winnerId: pendingWinnerId,
        seriesResult: pendingSeriesResult,
      }),
    })

    const json = await res.json()
    if (res.ok) {
      setResultMessage(`✓ Saved — ${json.entriesUpdated} entries updated`)
      setEditingMatchup(null)
      await loadMatchups(activeContest.id)
      await loadEntries(activeContest.id)
    } else {
      setResultMessage(`Error: ${json.error}`)
    }
    setSavingResult(false)
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: C.sub, fontFamily: 'Oswald, sans-serif' }}>LOADING...</span>
      </div>
    )
  }

  if (userEmail !== ADMIN_EMAIL) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: C.red, fontFamily: 'Oswald, sans-serif', fontSize: 18 }}>Not authorized.</span>
      </div>
    )
  }

  const tabBtn = (t: AdminTab, label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        padding: '9px 20px',
        background: tab === t ? C.gold : 'transparent',
        color: tab === t ? C.bg : C.sub,
        border: 'none',
        borderRadius: 6,
        fontFamily: 'Oswald, sans-serif',
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: 1.2,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  const groupedMatchups: Record<string, TournamentMatchup[]> = {}
  for (const m of matchups) {
    if (!groupedMatchups[m.region]) groupedMatchups[m.region] = []
    groupedMatchups[m.region].push(m)
  }

  const btnStyle = (variant: 'primary' | 'secondary' | 'danger' = 'primary'): React.CSSProperties => ({
    padding: '7px 16px',
    background: variant === 'primary' ? C.gold : variant === 'danger' ? C.red : C.surf3,
    color: variant === 'primary' ? C.bg : C.text,
    border: 'none',
    borderRadius: 6,
    fontFamily: 'Oswald, sans-serif',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 0.8,
    cursor: 'pointer',
  })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{
        background: C.surf,
        borderBottom: `1px solid ${C.surf3}`,
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: 1, color: C.gold }}>
          BRACKET ADMIN
        </span>
        {activeContest && (
          <span style={{ fontSize: 12, color: C.sub, background: C.surf3, padding: '4px 10px', borderRadius: 6 }}>
            Active: {activeContest.name}
          </span>
        )}
      </div>

      <div style={{ background: C.surf, borderBottom: `1px solid ${C.surf3}`, padding: '8px 24px', display: 'flex', gap: 8 }}>
        {tabBtn('tournaments', 'TOURNAMENTS')}
        {tabBtn('results', 'RESULTS')}
        {tabBtn('entries', 'ENTRIES')}
      </div>

      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

        {/* TOURNAMENTS TAB */}
        {tab === 'tournaments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 16, color: C.text }}>
                Bracket Contests ({contests.length})
              </span>
              <button style={btnStyle('primary')} onClick={() => setShowCreateForm(v => !v)}>
                {showCreateForm ? 'CANCEL' : '+ NEW CONTEST'}
              </button>
            </div>

            {showCreateForm && (
              <div style={{
                background: C.surf,
                border: `1px solid ${C.surf3}`,
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}>
                <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 14, color: C.gold, letterSpacing: 1 }}>
                  CREATE CONTEST
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Input label="NAME" value={newContest.name} onChange={v => setNewContest(p => ({ ...p, name: v }))} />
                  <Select label="SPORT" value={newContest.sport} onChange={v => setNewContest(p => ({ ...p, sport: v }))}
                    options={[{ value: 'baseball', label: 'Baseball' }, { value: 'softball', label: 'Softball' }]} />
                  <Input label="ENTRY FEE (cents)" value={newContest.entry_fee_cents} type="number"
                    onChange={v => setNewContest(p => ({ ...p, entry_fee_cents: Number(v) }))} />
                  <Select label="STATUS" value={newContest.status} onChange={v => setNewContest(p => ({ ...p, status: v }))}
                    options={[
                      { value: 'open', label: 'Open' },
                      { value: 'locked', label: 'Locked' },
                      { value: 'active', label: 'Active' },
                      { value: 'completed', label: 'Completed' },
                    ]} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Slider label="Regional Win" value={newContest.regional_win} min={1} max={50}
                    onChange={v => setNewContest(p => ({ ...p, regional_win: v }))} />
                  <Slider label="Super Regional Win" value={newContest.super_regional_win} min={1} max={100}
                    onChange={v => setNewContest(p => ({ ...p, super_regional_win: v }))} />
                  <Slider label="Championship Win" value={newContest.championship_win} min={1} max={200}
                    onChange={v => setNewContest(p => ({ ...p, championship_win: v }))} />
                  <Slider label="Exact Series Bonus" value={newContest.exact_series_bonus} min={0} max={20}
                    onChange={v => setNewContest(p => ({ ...p, exact_series_bonus: v }))} />
                </div>
                {createError && <div style={{ color: C.red, fontSize: 12 }}>{createError}</div>}
                <div>
                  <button style={btnStyle('primary')} onClick={handleCreateContest} disabled={creating}>
                    {creating ? 'CREATING...' : 'CREATE CONTEST'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contests.map(contest => (
                <div
                  key={contest.id}
                  style={{
                    background: activeContest?.id === contest.id ? 'rgba(245,166,35,0.08)' : C.surf,
                    border: `1px solid ${activeContest?.id === contest.id ? C.gold : C.surf3}`,
                    borderRadius: 8,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveContest(contest)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 14, color: C.text }}>{contest.name}</div>
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                      {contest.sport} · Season {contest.season} · {contest.entry_count} entries · ${(contest.entry_fee_cents / 100).toFixed(2)} entry
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: contest.status === 'open' ? 'rgba(21,198,120,0.15)' : C.surf3,
                    color: contest.status === 'open' ? C.green : C.muted,
                    fontFamily: 'Oswald, sans-serif',
                    textTransform: 'uppercase',
                  }}>
                    {contest.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RESULTS TAB */}
        {tab === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!activeContest ? (
              <div style={{ color: C.muted, fontFamily: 'Oswald, sans-serif', fontSize: 14 }}>
                Select a contest in the Tournaments tab first.
              </div>
            ) : (
              <>
                {resultMessage && (
                  <div style={{
                    background: resultMessage.startsWith('✓') ? 'rgba(21,198,120,0.1)' : 'rgba(240,58,90,0.1)',
                    border: `1px solid ${resultMessage.startsWith('✓') ? C.green : C.red}`,
                    borderRadius: 8,
                    padding: '10px 16px',
                    fontSize: 13,
                    color: resultMessage.startsWith('✓') ? C.green : C.red,
                    fontFamily: 'Oswald, sans-serif',
                  }}>
                    {resultMessage}
                  </div>
                )}

                {Object.entries(groupedMatchups).map(([region, regionMatchups]) => (
                  <div key={region} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      color: C.gold,
                      fontFamily: 'Oswald, sans-serif',
                      textTransform: 'uppercase',
                      borderBottom: `1px solid ${C.surf3}`,
                      paddingBottom: 6,
                    }}>
                      {region.replace(/_/g, ' ')}
                    </div>
                    {regionMatchups.map(m => {
                      const isEditing = editingMatchup === m.id
                      const team1Name = m.team1?.name ?? 'TBD'
                      const team2Name = m.team2?.name ?? 'TBD'
                      return (
                        <div key={m.id} style={{
                          background: C.surf,
                          border: `1px solid ${isEditing ? C.gold : C.surf3}`,
                          borderRadius: 8,
                          padding: '12px 16px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 13, color: C.text }}>
                                G{m.matchup_index + 1}: {team1Name} vs {team2Name}
                              </div>
                              <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                                {m.round} · {m.status}
                                {m.winner && (
                                  <span style={{ color: C.green, marginLeft: 8 }}>
                                    Winner: {m.winner.name} ({m.series_result})
                                  </span>
                                )}
                              </div>
                            </div>
                            {!isEditing && (
                              <button
                                style={btnStyle('secondary')}
                                onClick={() => {
                                  setEditingMatchup(m.id)
                                  setPendingWinnerId(m.winner?.id ?? '')
                                  setPendingSeriesResult((m.series_result as '2-0' | '2-1') ?? '2-0')
                                }}
                                disabled={!m.team1 || !m.team2}
                              >
                                {m.winner ? 'EDIT RESULT' : 'SET RESULT'}
                              </button>
                            )}
                          </div>

                          {isEditing && m.team1 && m.team2 && (
                            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div>
                                <div style={{ fontSize: 11, color: C.muted, fontFamily: 'Oswald, sans-serif', marginBottom: 6 }}>
                                  WINNER
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {[m.team1, m.team2].map(team => (
                                    <button
                                      key={team.id}
                                      onClick={() => setPendingWinnerId(team.id)}
                                      style={{
                                        padding: '6px 14px',
                                        background: pendingWinnerId === team.id ? C.gold : C.surf3,
                                        color: pendingWinnerId === team.id ? C.bg : C.text,
                                        border: 'none',
                                        borderRadius: 6,
                                        fontFamily: 'Oswald, sans-serif',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                      }}
                                    >
                                      #{team.seed} {team.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: C.muted, fontFamily: 'Oswald, sans-serif', marginBottom: 6 }}>
                                  SERIES RESULT
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  {(['2-0', '2-1'] as const).map(sr => (
                                    <button
                                      key={sr}
                                      onClick={() => setPendingSeriesResult(sr)}
                                      style={{
                                        padding: '6px 14px',
                                        background: pendingSeriesResult === sr ? C.gold : C.surf3,
                                        color: pendingSeriesResult === sr ? C.bg : C.text,
                                        border: 'none',
                                        borderRadius: 6,
                                        fontFamily: 'Oswald, sans-serif',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                      }}
                                    >
                                      {sr}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  style={btnStyle('primary')}
                                  onClick={() => handleSaveResult(m.id)}
                                  disabled={savingResult || !pendingWinnerId}
                                >
                                  {savingResult ? 'SAVING...' : 'SAVE RESULT'}
                                </button>
                                <button
                                  style={btnStyle('secondary')}
                                  onClick={() => { setEditingMatchup(null); setResultMessage(null) }}
                                >
                                  CANCEL
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ENTRIES TAB */}
        {tab === 'entries' && (
          <div>
            {!activeContest ? (
              <div style={{ color: C.muted, fontFamily: 'Oswald, sans-serif', fontSize: 14 }}>
                Select a contest in the Tournaments tab first.
              </div>
            ) : (
              <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.surf3}` }}>
                  <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 14, color: C.text }}>
                    Entries — {activeContest.name} ({entries.length})
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['RANK', 'ENTRY NAME', 'SCORE', 'CORRECT', 'SUBMITTED', 'LOCKED'].map(h => (
                        <th key={h} style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 1.5,
                          color: C.muted,
                          fontFamily: 'Oswald, sans-serif',
                          borderBottom: `1px solid ${C.surf3}`,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>
                          No entries yet
                        </td>
                      </tr>
                    ) : entries.map((e, idx) => (
                      <tr key={e.id} style={{
                        background: idx % 2 === 0 ? C.surf : C.surf2,
                        borderBottom: `1px solid ${C.surf3}`,
                      }}>
                        <td style={{ padding: '9px 12px', color: C.muted, fontFamily: 'Oswald, sans-serif', fontSize: 13 }}>{idx + 1}</td>
                        <td style={{ padding: '9px 12px', color: C.text, fontFamily: 'Oswald, sans-serif', fontSize: 13 }}>{e.entry_name}</td>
                        <td style={{ padding: '9px 12px', color: C.gold, fontFamily: 'Oswald, sans-serif', fontSize: 13, fontWeight: 700 }}>{e.total_score}</td>
                        <td style={{ padding: '9px 12px', color: C.sub, fontFamily: 'Oswald, sans-serif', fontSize: 13 }}>{e.correct_picks}</td>
                        <td style={{ padding: '9px 12px', fontFamily: 'Oswald, sans-serif', fontSize: 12 }}>
                          <span style={{ color: e.is_submitted ? C.green : C.muted }}>{e.is_submitted ? 'YES' : 'NO'}</span>
                        </td>
                        <td style={{ padding: '9px 12px', fontFamily: 'Oswald, sans-serif', fontSize: 12 }}>
                          <span style={{ color: e.is_locked ? C.red : C.muted }}>{e.is_locked ? 'LOCKED' : 'OPEN'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
