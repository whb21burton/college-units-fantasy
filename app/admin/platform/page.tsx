'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { CONFERENCES } from '@/lib/playerPool'

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#f5a623', text: '#e4edf7', sub: '#7a90aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2,
  color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6,
}

function selBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '7px 4px',
    border: `2px solid ${active ? C.gold : C.surf3}`,
    borderRadius: 6, cursor: 'pointer',
    background: active ? 'rgba(245,166,35,.1)' : C.surf2,
    color: active ? C.gold : C.sub,
    fontFamily: 'Anton,sans-serif', fontSize: 11,
  }
}

function PayoutPreview({
  feeAmount, maxAccounts, payoutStructure, setPayoutStructure,
}: {
  feeAmount: number
  maxAccounts: number | null
  payoutStructure: 'winner_take_all' | 'top2' | 'top3' | 'double_up'
  setPayoutStructure: (v: 'winner_take_all' | 'top2' | 'top3' | 'double_up') => void
}) {
  const count = maxAccounts ?? 100
  const totalPool = feeAmount * count
  const net = totalPool * 0.95
  const presets = {
    winner_take_all: [{ place: '1st', pct: 100, amt: net }],
    top2: [{ place: '1st', pct: 70, amt: net * 0.70 }, { place: '2nd', pct: 30, amt: net * 0.30 }],
    top3: [{ place: '1st', pct: 60, amt: net * 0.60 }, { place: '2nd', pct: 25, amt: net * 0.25 }, { place: '3rd', pct: 15, amt: net * 0.15 }],
  }
  const numWinners = Math.floor(count / 2)
  const perWinner = feeAmount * 1.95
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>Payout Structure</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const }}>
        {(['winner_take_all', 'top2', 'top3', 'double_up'] as const).map((key) => (
          <button key={key} onClick={() => setPayoutStructure(key)}
            style={{ flex: 1, minWidth: 60, padding: '8px 4px', border: `2px solid ${payoutStructure === key ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: payoutStructure === key ? 'rgba(245,166,35,.1)' : C.surf2, color: payoutStructure === key ? C.gold : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 0.5 }}>
            {key === 'winner_take_all' ? 'Winner Take All' : key === 'top2' ? 'Top 2' : key === 'top3' ? 'Top 3' : 'Double Up'}
          </button>
        ))}
      </div>
      <div style={{ background: C.surf2, borderRadius: 6, padding: '10px 12px' }}>
        {payoutStructure === 'double_up' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, marginBottom: 3 }}>
              <span>Top {numWinners} players each win</span>
              <span style={{ color: C.gold }}>${perWinner.toFixed(2)} (1.95×)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
              <span>Bottom {count - numWinners} players</span>
              <span style={{ color: C.red }}>lose entry fee</span>
            </div>
          </>
        ) : (
          presets[payoutStructure].map(p => (
            <div key={p.place} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, marginBottom: 3 }}>
              <span>{p.place} place</span>
              <span style={{ color: C.gold }}>${p.amt.toFixed(2)} ({p.pct}%)</span>
            </div>
          ))
        )}
        <div style={{ borderTop: `1px solid ${C.surf3}`, marginTop: 6, paddingTop: 6, fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>
          Based on {count} entries · 5% platform fee deducted
        </div>
      </div>
    </div>
  )
}

function PageControls() {
  const supabase = createClientComponentClient()
  const [locks, setLocks] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const LOCK_KEYS = [
    'public_leagues_locked',
    'create_season_league_locked',
    'bracket_contests_locked',
    'create_bracket_locked',
    'bracket_sport_football_locked',
    'bracket_sport_basketball_locked',
    'bracket_sport_baseball_locked',
  ]

  useEffect(() => {
    supabase.from('platform_settings').select('key, value')
      .in('key', LOCK_KEYS)
      .then(({ data }) => {
        setLocks(Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value === 'true'])))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle(key: string) {
    setSaving(key)
    const newVal = !locks[key]
    const keysToUpdate: Record<string, boolean> = { [key]: newVal }

    if (newVal === true) {
      if (key === 'public_leagues_locked') {
        keysToUpdate['create_season_league_locked'] = true
      }
      if (key === 'bracket_contests_locked') {
        keysToUpdate['create_bracket_locked'] = true
        keysToUpdate['bracket_sport_football_locked'] = true
        keysToUpdate['bracket_sport_basketball_locked'] = true
        keysToUpdate['bracket_sport_baseball_locked'] = true
      }
    }

    for (const [k, v] of Object.entries(keysToUpdate)) {
      await supabase.from('platform_settings')
        .upsert({ key: k, value: v.toString(), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }
    setLocks(prev => ({ ...prev, ...keysToUpdate }))
    setSaving(null)
  }

  function LockRow({ lockKey, label, icon, indent = false, parentLocked = false }: {
    lockKey: string; label: string; icon: string; indent?: boolean; parentLocked?: boolean
  }) {
    const locked = locks[lockKey] ?? false
    const effectiveLocked = locked || parentLocked
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        marginLeft: indent ? 24 : 0,
        background: indent ? C.bg : C.surf2,
        borderRadius: 8,
        border: `1px solid ${effectiveLocked ? 'rgba(240,58,90,.2)' : C.surf3}`,
        opacity: parentLocked ? 0.6 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {indent && <div style={{ width: 2, height: 20, background: C.surf3, marginRight: 4 }} />}
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: effectiveLocked ? C.muted : C.text }}>
            {label}
            {parentLocked && <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginLeft: 8 }}>(parent locked)</span>}
          </span>
        </div>
        <button
          onClick={() => !parentLocked && toggle(lockKey)}
          disabled={saving === lockKey || parentLocked}
          style={{
            padding: '6px 16px',
            background: effectiveLocked ? 'rgba(240,58,90,.15)' : 'rgba(21,198,120,.1)',
            border: `1px solid ${effectiveLocked ? '#f03a5a' : '#15c678'}`,
            borderRadius: 6, cursor: parentLocked ? 'not-allowed' : 'pointer',
            fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1,
            color: effectiveLocked ? '#f03a5a' : '#15c678',
            opacity: parentLocked ? 0.5 : 1,
          }}>
          {saving === lockKey ? '...' : effectiveLocked ? '🔒 Locked' : '🔓 Unlocked'}
        </button>
      </div>
    )
  }

  const publicLeaguesLocked = locks['public_leagues_locked'] ?? false
  const bracketContestsLocked = locks['bracket_contests_locked'] ?? false

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
        🔒 Page Controls
      </div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginBottom: 16, letterSpacing: 0.5 }}>
        Locking a parent automatically locks all subcategories. Subcategories can be locked independently when parent is unlocked.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <LockRow lockKey="public_leagues_locked" label="Browse Public Leagues" icon="🏟️" />
        <LockRow lockKey="create_season_league_locked" label="Create Season League" icon="🏈" indent parentLocked={publicLeaguesLocked} />

        <div style={{ height: 1, background: C.surf3, margin: '8px 0' }} />

        <LockRow lockKey="bracket_contests_locked" label="Bracket Contest Page" icon="🏆" />
        <LockRow lockKey="create_bracket_locked" label="Create Bracket League" icon="➕" indent parentLocked={bracketContestsLocked} />
        <LockRow lockKey="bracket_sport_football_locked" label="Football Bracket" icon="🏈" indent parentLocked={bracketContestsLocked} />
        <LockRow lockKey="bracket_sport_basketball_locked" label="Basketball Bracket" icon="🏀" indent parentLocked={bracketContestsLocked} />
        <LockRow lockKey="bracket_sport_baseball_locked" label="Baseball Bracket" icon="⚾" indent parentLocked={bracketContestsLocked} />
      </div>
    </div>
  )
}

function WeeklyPickemCreator() {
  const [name, setName] = useState('')
  const [week, setWeek] = useState(1)
  const [buyIn, setBuyIn] = useState(0)
  const [maxAccounts, setMaxAccounts] = useState<number | null>(null)
  const [maxPerAccount, setMaxPerAccount] = useState(1)
  const [copies, setCopies] = useState(1)
  const [payoutStructure, setPayoutStructure] = useState<'winner_take_all' | 'top2' | 'top3' | 'double_up'>('winner_take_all')
  const [poolMode, setPoolMode] = useState<'all' | 'conference' | 'custom'>('all')
  const [conferenceFilter, setConferenceFilter] = useState<string>('All D1')
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  async function handleCreate() {
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/leagues/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        buy_in: buyIn,
        league_size: maxAccounts ?? 999999,
        max_entries_per_user: maxPerAccount,
        is_capped: maxAccounts !== null,
        draft_type: 'snake',
        is_public: true,
        league_type: 'weekly',
        week,
        team_name: 'Platform',
        copies,
        conference_filter: poolMode === 'conference' ? conferenceFilter : poolMode === 'all' ? 'All D1' : null,
        settings: {
          allowed_schools: poolMode === 'custom' ? Array.from(selectedSchools) : null,
          payout_structure: payoutStructure,
        },
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (res.ok) {
      setSuccess(`✓ "${name}" created and live in public leagues!`)
      setName('')
      setTimeout(() => setSuccess(''), 4000)
    } else {
      setError(data.error ?? 'Failed to create')
    }
  }

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 24 }}>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 3, color: C.gold, textTransform: 'uppercase', marginBottom: 4 }}>Weekly Pick'em</div>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>⚡ Create Weekly Contest</div>

      <label style={labelStyle}>Contest Name</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Week 1 $5 Shootout"
        maxLength={40}
        style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 13, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }} />

      <label style={labelStyle}>Week</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16 }}>
        {Array.from({ length: 14 }, (_, i) => i + 1).map(w => (
          <button key={w} onClick={() => setWeek(w)}
            style={{ padding: '8px 4px', border: `2px solid ${week === w ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: week === w ? 'rgba(245,166,35,.1)' : C.surf2, color: week === w ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
            {w}
          </button>
        ))}
      </div>

      <label style={labelStyle}>Entry Fee</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[0, 1, 5, 10, 25].map(amt => (
          <button key={amt} onClick={() => setBuyIn(amt)}
            style={{ flex: 1, padding: '8px 4px', border: `2px solid ${buyIn === amt ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: buyIn === amt ? 'rgba(245,166,35,.1)' : C.surf2, color: buyIn === amt ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
            {amt === 0 ? 'Free' : `$${amt}`}
          </button>
        ))}
      </div>

      <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        Max Accounts
      </label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' as const }}>
        {([null, 10, 20, 30, 40, 50, 100] as (number | null)[]).map(n => (
          <button key={n ?? 'unlimited'} onClick={() => setMaxAccounts(n)}
            style={{ padding: '7px 8px', border: `2px solid ${maxAccounts === n ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: maxAccounts === n ? 'rgba(245,166,35,.1)' : C.surf2, color: maxAccounts === n ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 11, minWidth: 36 }}>
            {n === null ? '∞' : n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>Custom:</span>
        <input
          type="number"
          min={1}
          max={100000}
          placeholder="Enter amount"
          value={maxAccounts ?? ''}
          onChange={e => {
            const val = parseInt(e.target.value)
            setMaxAccounts(isNaN(val) || val < 1 ? null : val)
          }}
          style={{ width: 100, padding: '6px 8px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12, outline: 'none' }}
        />
        {maxAccounts !== null && (
          <button onClick={() => setMaxAccounts(null)}
            style={{ padding: '5px 8px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 4, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>
            Clear
          </button>
        )}
      </div>

      <label style={labelStyle}>Entries Per Account</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[1, 2, 3, 5, 10].map(n => (
          <button key={n} onClick={() => setMaxPerAccount(n)}
            style={selBtn(maxPerAccount === n)}>
            {n}
          </button>
        ))}
      </div>

      <label style={labelStyle}>Copies</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
        {[1, 2, 3, 5, 10].map(n => (
          <button key={n} onClick={() => setCopies(n)}
            style={selBtn(copies === n)}>
            {n === 1 ? '1' : `${n}×`}
          </button>
        ))}
        <input type="number" min={1} max={50} value={copies}
          onChange={e => setCopies(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
          style={{ width: 60, padding: '7px 8px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12 }} />
      </div>

      <label style={labelStyle}>Team Pool</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['all', 'conference', 'custom'] as const).map(mode => (
          <button key={mode} onClick={() => setPoolMode(mode)}
            style={{ flex: 1, padding: '8px 4px', border: `2px solid ${poolMode === mode ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: poolMode === mode ? 'rgba(245,166,35,.1)' : C.surf2, color: poolMode === mode ? C.gold : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 10 }}>
            {mode === 'all' ? 'All D1' : mode === 'conference' ? 'By Conference' : 'Custom'}
          </button>
        ))}
      </div>

      {poolMode === 'conference' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {Object.keys(CONFERENCES).map(conf => (
            <button key={conf} onClick={() => setConferenceFilter(conf)}
              style={{ padding: '5px 10px', border: `1px solid ${conferenceFilter === conf ? C.gold : C.surf3}`, borderRadius: 4, cursor: 'pointer', background: conferenceFilter === conf ? 'rgba(245,166,35,.1)' : C.surf2, color: conferenceFilter === conf ? C.gold : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 10 }}>
              {conf}
            </button>
          ))}
        </div>
      )}

      {poolMode === 'custom' && (
        <div style={{ maxHeight: 200, overflowY: 'auto', background: C.surf2, borderRadius: 6, padding: 10, marginBottom: 12 }}>
          {Object.entries(CONFERENCES).map(([conf, teams]) => (
            <div key={conf} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>{conf}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {(teams as string[]).map(team => {
                  const checked = selectedSchools.has(team)
                  return (
                    <button key={team} onClick={() => {
                      const next = new Set(selectedSchools)
                      checked ? next.delete(team) : next.add(team)
                      setSelectedSchools(next)
                    }}
                      style={{ padding: '3px 7px', border: `1px solid ${checked ? C.gold : C.surf3}`, borderRadius: 4, cursor: 'pointer', background: checked ? 'rgba(245,166,35,.1)' : 'transparent', color: checked ? C.gold : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 9 }}>
                      {team}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {buyIn > 0 && (
        <PayoutPreview
          feeAmount={buyIn}
          maxAccounts={maxAccounts}
          payoutStructure={payoutStructure}
          setPayoutStructure={setPayoutStructure}
        />
      )}

      {success && <div style={{ padding: '8px 12px', background: 'rgba(21,198,120,.1)', border: '1px solid rgba(21,198,120,.3)', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.green, marginBottom: 12 }}>{success}</div>}
      {error && <div style={{ padding: '8px 12px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.red, marginBottom: 12 }}>{error}</div>}

      <button onClick={handleCreate} disabled={!name.trim() || submitting}
        style={{ width: '100%', padding: '13px', background: name.trim() ? C.gold : C.surf3, border: 'none', borderRadius: 8, cursor: name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: name.trim() ? C.bg : C.muted, textTransform: 'uppercase' }}>
        {submitting ? 'Creating…' : 'Create & Publish'}
      </button>
    </div>
  )
}

function PublicBracketCreator() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sport, setSport] = useState<'football' | 'basketball' | 'baseball'>('baseball')
  const [activeSport, setActiveSport] = useState<'football' | 'basketball' | 'baseball' | null>(null)
  const [entryFeeCents, setEntryFeeCents] = useState(0)
  const [maxAccounts, setMaxAccounts] = useState<number | null>(null)
  const [maxPerAccount, setMaxPerAccount] = useState(1)
  const [copies, setCopies] = useState(1)
  const [payoutStructure, setPayoutStructure] = useState<'winner_take_all' | 'top2' | 'top3' | 'double_up'>('winner_take_all')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [sportLocks, setSportLocks] = useState({ football: false, basketball: false, baseball: false })
  const supabase = createClientComponentClient()

  useEffect(() => {
    supabase.from('platform_settings').select('key, value')
      .in('key', ['bracket_sport_football_locked', 'bracket_sport_basketball_locked', 'bracket_sport_baseball_locked'])
      .then(({ data }) => {
        const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value === 'true']))
        setSportLocks({
          football:   map['bracket_sport_football_locked']   ?? false,
          basketball: map['bracket_sport_basketball_locked'] ?? false,
          baseball:   map['bracket_sport_baseball_locked']   ?? false,
        })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (sportLocks[sport]) {
      const available = (['baseball', 'basketball', 'football'] as const).find(s => !sportLocks[s])
      if (available) setSport(available)
    }
  }, [sportLocks])

  async function handleCreate() {
    setSubmitting(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const results: string[] = []
    for (let i = 0; i < copies; i++) {
      const contestName = copies > 1 ? `${name.trim()} ${String(i + 1).padStart(2, '0')}` : name.trim()
      const { error: err } = await supabase
        .from('bracket_contests')
        .insert({
          name: contestName,
          sport,
          season: 2025,
          status: 'open',
          entry_fee_cents: entryFeeCents,
          max_entries: maxAccounts,
          settings: {
            max_per_account: maxPerAccount,
            payout_structure: payoutStructure,
            description,
          },
          created_by: user?.id,
        })
      if (err) {
        setError(err.message)
        setSubmitting(false)
        return
      }
      results.push(contestName)
    }
    if (activeSport) {
      await supabase.from('platform_settings').upsert({
        key: 'active_bracket_sport',
        value: activeSport,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    }
    setSubmitting(false)
    setSuccess(`✓ ${results.length} bracket contest${results.length > 1 ? 's' : ''} created and live!`)
    setName('')
    setTimeout(() => setSuccess(''), 4000)
  }

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 24 }}>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 3, color: C.green, textTransform: 'uppercase', marginBottom: 4 }}>Public Bracket</div>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>🏆 Create Bracket Contest</div>

      <label style={{ ...labelStyle, marginBottom: 6 }}>
        Sport (click to set active — users will only see this sport's brackets)
      </label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {([['football', '🏈'], ['basketball', '🏀'], ['baseball', '⚾']] as const).map(([s, icon]) => {
          const isLocked = sportLocks[s]
          const isActive = activeSport === s
          const isSelected = sport === s
          return (
            <button key={s}
              onClick={() => !isLocked && setSport(s)}
              disabled={isLocked}
              style={{
                flex: 1, padding: '12px 4px',
                border: `2px solid ${isActive ? C.green : isSelected && !isLocked ? C.gold : C.surf3}`,
                borderRadius: 8,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                background: isActive ? 'rgba(21,198,120,.12)' : isSelected && !isLocked ? 'rgba(245,166,35,.1)' : C.surf2,
                opacity: isLocked ? 0.35 : 1,
                textAlign: 'center' as const,
                transition: 'all .15s',
              }}>
              <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: isActive ? C.green : isSelected ? C.gold : isLocked ? C.muted : C.sub, textTransform: 'capitalize' as const }}>
                {s} {isLocked ? '🔒' : isActive ? '● ACTIVE' : ''}
              </div>
              {isLocked && <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted }}>Locked</div>}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setActiveSport(sport)}
          style={{ flex: 1, padding: '8px', background: 'rgba(21,198,120,.1)', border: '1px solid rgba(21,198,120,.3)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 1, color: C.green }}>
          ✓ Set {sport} as Active Sport
        </button>
        {activeSport && (
          <button onClick={() => setActiveSport(null)}
            style={{ padding: '8px 12px', background: 'rgba(240,58,90,.08)', border: '1px solid rgba(240,58,90,.2)', borderRadius: 6, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.red }}>
            Clear
          </button>
        )}
      </div>
      {activeSport && (
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.green, marginBottom: 12 }}>
          ✓ Users will see <strong>{activeSport}</strong> brackets by default on the public brackets page
        </div>
      )}

      <label style={labelStyle}>Contest Name</label>
      <input value={name} onChange={e => setName(e.target.value)}
        placeholder={`e.g. 2025 ${sport.charAt(0).toUpperCase() + sport.slice(1)} Bracket`}
        maxLength={60}
        style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 13, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }} />

      <label style={labelStyle}>Contest Description (optional)</label>
      <input value={description} onChange={e => setDescription(e.target.value)}
        placeholder="e.g. Pick all 27 games in the 2025 CWS bracket"
        maxLength={100}
        style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12, marginBottom: 16, boxSizing: 'border-box' as const }} />

      <label style={labelStyle}>Entry Fee</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([[0, 'Free'], [100, '$1'], [500, '$5'], [1000, '$10'], [2500, '$25']] as [number, string][]).map(([cents, label]) => (
          <button key={cents} onClick={() => setEntryFeeCents(cents)}
            style={{ flex: 1, padding: '8px 4px', border: `2px solid ${entryFeeCents === cents ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: entryFeeCents === cents ? 'rgba(245,166,35,.1)' : C.surf2, color: entryFeeCents === cents ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
            {label}
          </button>
        ))}
      </div>

      <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        Max Accounts
      </label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' as const }}>
        {([null, 10, 20, 30, 40, 50, 100] as (number | null)[]).map(n => (
          <button key={n ?? 'unlimited'} onClick={() => setMaxAccounts(n)}
            style={{ padding: '7px 8px', border: `2px solid ${maxAccounts === n ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: maxAccounts === n ? 'rgba(245,166,35,.1)' : C.surf2, color: maxAccounts === n ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 11, minWidth: 36 }}>
            {n === null ? '∞' : n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>Custom:</span>
        <input
          type="number"
          min={1}
          max={100000}
          placeholder="Enter amount"
          value={maxAccounts ?? ''}
          onChange={e => {
            const val = parseInt(e.target.value)
            setMaxAccounts(isNaN(val) || val < 1 ? null : val)
          }}
          style={{ width: 100, padding: '6px 8px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12, outline: 'none' }}
        />
        {maxAccounts !== null && (
          <button onClick={() => setMaxAccounts(null)}
            style={{ padding: '5px 8px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 4, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>
            Clear
          </button>
        )}
      </div>

      <label style={labelStyle}>Entries Per Account</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[1, 2, 3, 5, 10].map(n => (
          <button key={n} onClick={() => setMaxPerAccount(n)}
            style={selBtn(maxPerAccount === n)}>
            {n}
          </button>
        ))}
      </div>

      <label style={labelStyle}>Copies</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
        {[1, 2, 3, 5, 10].map(n => (
          <button key={n} onClick={() => setCopies(n)}
            style={selBtn(copies === n)}>
            {n === 1 ? '1' : `${n}×`}
          </button>
        ))}
        <input type="number" min={1} max={50} value={copies}
          onChange={e => setCopies(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
          style={{ width: 60, padding: '7px 8px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12 }} />
      </div>

      {entryFeeCents > 0 && (
        <PayoutPreview
          feeAmount={entryFeeCents / 100}
          maxAccounts={maxAccounts}
          payoutStructure={payoutStructure}
          setPayoutStructure={setPayoutStructure}
        />
      )}

      {success && <div style={{ padding: '8px 12px', background: 'rgba(21,198,120,.1)', border: '1px solid rgba(21,198,120,.3)', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.green, marginBottom: 12 }}>{success}</div>}
      {error && <div style={{ padding: '8px 12px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.red, marginBottom: 12 }}>{error}</div>}

      <button onClick={handleCreate} disabled={!name.trim() || submitting}
        style={{ width: '100%', padding: '13px', background: name.trim() ? C.green : C.surf3, border: 'none', borderRadius: 8, cursor: name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: name.trim() ? C.bg : C.muted, textTransform: 'uppercase' }}>
        {submitting ? 'Creating…' : 'Create & Publish'}
      </button>

      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 10, textAlign: 'center' }}>
        After creating, go to /admin to add teams and matchups
      </div>
    </div>
  )
}

function ESPNSyncPanel() {
  const [contests, setContests] = useState<any[]>([])
  const [contestId, setContestId] = useState('')
  const [status, setStatus] = useState<any>(null)
  const [syncing, setSyncing] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/admin/espn-status?contestId=__probe__')
      .then(() => {})
      .catch(() => {})
    const supabase = createClientComponentClient()
    supabase.from('bracket_contests')
      .select('id, name, sport, status')
      .eq('sport', 'baseball')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setContests(data ?? [])
        if (data?.[0]) setContestId(data[0].id)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadStatus(id?: string) {
    const cid = id ?? contestId
    if (!cid) return
    const res = await fetch(`/api/admin/espn-status?contestId=${cid}`)
    setStatus(await res.json())
  }

  async function runSync(fullScan = false) {
    if (!contestId) return
    setSyncing(true)
    setMsg('')
    const res = await fetch('/api/admin/espn-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contestId, fullScan }),
    })
    const data = await res.json()
    setMsg(data.error ?? `✓ ${data.gamesUpdated} games updated, ${data.advancementsSuggested} advancements suggested`)
    await loadStatus()
    setSyncing(false)
  }

  async function advance(advancementId: string, action: 'confirm' | 'dismiss') {
    setConfirming(advancementId)
    await fetch('/api/admin/espn-advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advancementId, action }),
    })
    await loadStatus()
    setConfirming(null)
  }

  const pending = status?.pendingAdvancements ?? []
  const syncs   = status?.recentSyncs ?? []

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 24, marginTop: 20 }}>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
        ⚾ ESPN CWS Sync
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
        <select
          value={contestId}
          onChange={e => { setContestId(e.target.value); loadStatus(e.target.value) }}
          style={{ flex: 1, minWidth: 200, padding: '8px 10px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12, outline: 'none' }}>
          {contests.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
          ))}
        </select>
        <button onClick={() => loadStatus()}
          style={{ padding: '8px 14px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 11 }}>
          Refresh
        </button>
        <button onClick={() => runSync(false)} disabled={syncing}
          style={{ padding: '8px 14px', background: 'rgba(245,166,35,.1)', border: `1px solid ${C.gold}`, borderRadius: 6, cursor: 'pointer', color: C.gold, fontFamily: 'Oswald,sans-serif', fontSize: 11 }}>
          {syncing ? 'Syncing...' : 'Sync Today'}
        </button>
        <button onClick={() => runSync(true)} disabled={syncing}
          style={{ padding: '8px 14px', background: 'rgba(245,166,35,.05)', border: `1px solid ${C.surf3}`, borderRadius: 6, cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 11 }}>
          Full Scan
        </button>
      </div>

      {msg && (
        <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: msg.startsWith('✓') ? C.green : C.red }}>
          {msg}
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>
            Pending Advancements ({pending.length})
          </div>
          {pending.map((p: any) => {
            const team = p.advancing_team
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surf2, borderRadius: 8, padding: '10px 12px', marginBottom: 6, gap: 10, flexWrap: 'wrap' as const }}>
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text }}>
                    {team?.displayName ?? team?.name ?? 'Unknown'} — {p.round_type?.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>
                    {p.from_region ?? 'CWS'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => advance(p.id, 'confirm')}
                    disabled={confirming === p.id}
                    style={{ padding: '6px 12px', background: 'rgba(21,198,120,.1)', border: `1px solid ${C.green}`, borderRadius: 6, cursor: 'pointer', color: C.green, fontFamily: 'Oswald,sans-serif', fontSize: 10 }}>
                    {confirming === p.id ? '...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => advance(p.id, 'dismiss')}
                    disabled={confirming === p.id}
                    style={{ padding: '6px 12px', background: 'rgba(240,58,90,.1)', border: `1px solid ${C.red}`, borderRadius: 6, cursor: 'pointer', color: C.red, fontFamily: 'Oswald,sans-serif', fontSize: 10 }}>
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {syncs.length > 0 && (
        <div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
            Recent Syncs
          </div>
          {syncs.map((s: any) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', background: C.surf2, borderRadius: 6, padding: '8px 12px', marginBottom: 4 }}>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
                {new Date(s.synced_at).toLocaleString()}
              </span>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.text }}>
                {s.games_updated} updated · {s.advancements_suggested} suggested · {s.duration_ms}ms
              </span>
            </div>
          ))}
        </div>
      )}

      {!status && (
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, textAlign: 'center', padding: '20px 0' }}>
          Select a contest and click Refresh to load sync status
        </div>
      )}
    </div>
  )
}

function BracketTeamsEditor() {
  const supabase = createClientComponentClient()
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const GLOBAL_KEY = 'global'

  const REGIONS = [
    { key: 'nashville',   display: 'Nashville' },
    { key: 'hattiesburg', display: 'Hattiesburg' },
    { key: 'tallahassee', display: 'Tallahassee' },
    { key: 'corvallis',   display: 'Corvallis' },
    { key: 'austin',      display: 'Austin' },
    { key: 'los_angeles', display: 'Los Angeles' },
    { key: 'oxford',      display: 'Oxford' },
    { key: 'athens',      display: 'Athens' },
  ]

  useEffect(() => {
    setLoading(true)
    supabase.from('bracket_teams').select('*').eq('contest_id', GLOBAL_KEY)
      .order('region_key').order('seed')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setTeams(data)
        } else {
          const empty: any[] = []
          for (const r of REGIONS) {
            for (let seed = 1; seed <= 4; seed++) {
              empty.push({
                contest_id: GLOBAL_KEY,
                region_key: r.key,
                region_display: r.display,
                seed,
                team_id: `${r.key}_${seed}`,
                team_name: '',
                record: '',
              })
            }
          }
          setTeams(empty)
        }
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateTeam(regionKey: string, seed: number, field: string, value: string) {
    setTeams(prev => prev.map(t =>
      t.region_key === regionKey && t.seed === seed ? { ...t, [field]: value } : t
    ))
  }

  function updateRegionDisplay(regionKey: string, display: string) {
    setTeams(prev => prev.map(t =>
      t.region_key === regionKey ? { ...t, region_display: display } : t
    ))
  }

  async function saveTeams() {
    setSaving(true)
    const rows = teams.map(t => ({
      contest_id: GLOBAL_KEY,
      region_key: t.region_key,
      region_display: t.region_display,
      seed: t.seed,
      team_id: t.team_id || `${t.region_key}_${t.seed}`,
      team_name: t.team_name,
      record: t.record,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('bracket_teams')
      .upsert(rows, { onConflict: 'contest_id,region_key,seed' })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
    else alert('Error saving: ' + error.message)
  }

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 24, marginTop: 20 }}>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
        Bracket Teams Editor
      </div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginBottom: 16 }}>
        Set team names and records for each regional. Applies to all bracket contests globally.
      </div>

      {loading ? (
        <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11, textAlign: 'center', padding: 20 }}>Loading...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            {REGIONS.map(region => {
              const regionTeams = teams.filter(t => t.region_key === region.key).sort((a, b) => a.seed - b.seed)
              return (
                <div key={region.key} style={{ background: C.surf2, borderRadius: 8, padding: '12px 14px' }}>
                  <input
                    value={regionTeams[0]?.region_display ?? region.display}
                    onChange={e => updateRegionDisplay(region.key, e.target.value)}
                    placeholder="City name"
                    style={{ width: '100%', padding: '5px 8px', background: C.surf3, border: `1px solid ${C.gold}33`, borderRadius: 5, color: C.gold, fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', outline: 'none', marginBottom: 8, boxSizing: 'border-box' as const }}
                  />
                  {regionTeams.map(team => (
                    <div key={team.seed} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 70px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, color: C.muted, textAlign: 'center' }}>{team.seed}</div>
                      <input
                        value={team.team_name}
                        onChange={e => updateTeam(region.key, team.seed, 'team_name', e.target.value)}
                        placeholder={`Seed ${team.seed} team`}
                        style={{ padding: '5px 8px', background: C.surf3, border: `1px solid ${C.surf3}`, borderRadius: 5, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 11, outline: 'none' }}
                      />
                      <input
                        value={team.record}
                        onChange={e => updateTeam(region.key, team.seed, 'record', e.target.value)}
                        placeholder="00-00"
                        style={{ padding: '5px 6px', background: C.surf3, border: `1px solid ${C.surf3}`, borderRadius: 5, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 10, outline: 'none', textAlign: 'center' }}
                      />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          <button onClick={saveTeams} disabled={saving}
            style={{ width: '100%', padding: '13px', background: saving ? C.surf3 : saved ? C.green : C.gold, border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: saving ? C.muted : C.bg, textTransform: 'uppercase' as const }}>
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save All Teams'}
          </button>
        </>
      )}
    </div>
  )
}

function AdminStats() {
  const supabase = createClientComponentClient()
  const [completedStats, setCompletedStats] = useState<any[]>([])
  const [activeContests, setActiveContests] = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [tab,            setTab]            = useState<'active' | 'completed'>('active')

  useEffect(() => {
    Promise.all([
      supabase.from('admin_contest_stats').select('*').order('completed_at', { ascending: false }),
      supabase.from('leagues').select('id, name, league_type, buy_in, status, created_at, is_public, commissioner_id')
        .gt('buy_in', 0)
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: false }),
      supabase.from('bracket_contests').select('id, name, sport, entry_fee_cents, entry_count, max_entries, status, settings, created_at')
        .gt('entry_fee_cents', 0)
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: false }),
    ]).then(async ([{ data: stats }, { data: leagues }, { data: brackets }]) => {
      setCompletedStats(stats ?? [])

      const leagueItems = await Promise.all((leagues ?? []).map(async l => {
        const { count } = await supabase.from('league_members')
          .select('id', { count: 'exact', head: true })
          .eq('league_id', l.id)
          .eq('is_bot', false)
        const members = count ?? 0
        const gross = l.buy_in * members * 100
        const rake  = Math.floor(gross * 0.05)
        return { ...l, members, gross, rake, type: 'league' }
      }))

      const bracketItems = (brackets ?? []).map(b => {
        const entries = b.entry_count ?? 0
        const gross   = b.entry_fee_cents * entries
        const rake    = Math.floor(gross * 0.05)
        return { ...b, members: entries, gross, rake, buy_in: b.entry_fee_cents / 100, type: 'bracket' }
      })

      setActiveContests([...leagueItems, ...bracketItems].sort((a, b) => b.gross - a.gross))
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalActiveGross    = activeContests.reduce((s, c) => s + (c.gross ?? 0), 0)
  const totalActiveRake     = activeContests.reduce((s, c) => s + (c.rake  ?? 0), 0)
  const totalCompletedRake  = completedStats.reduce((s, c) => s + (c.rake_cents ?? 0), 0)

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 24, marginTop: 20 }}>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
        📊 Contest Stats
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {([
          ['Active Pool',   `$${(totalActiveGross   / 100).toFixed(2)}`],
          ['Pending Rake',  `$${(totalActiveRake    / 100).toFixed(2)}`],
          ['Earned Rake',   `$${(totalCompletedRake / 100).toFixed(2)}`],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} style={{ background: C.surf2, borderRadius: 8, padding: '12px 14px', textAlign: 'center' as const }}>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.gold }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', borderBottom: `1px solid ${C.surf3}`, marginBottom: 16 }}>
        {([['active', 'Active Contests'], ['completed', 'Completed']] as [string, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as 'active' | 'completed')}
            style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === key ? C.gold : 'transparent'}`, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: tab === key ? C.gold : C.muted }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11, textAlign: 'center' as const, padding: 20 }}>Loading…</div>
      ) : tab === 'active' ? (
        activeContests.length === 0 ? (
          <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11, textAlign: 'center' as const, padding: 20 }}>No active paid contests</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {activeContests.map(c => (
              <div key={c.id} style={{ background: C.surf2, borderRadius: 8, padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>
                    {c.type === 'bracket' ? `⚾ BRACKET · ${c.sport}` : `${c.league_type?.toUpperCase()} LEAGUE`} · {c.status} · ${c.buy_in} entry
                    <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: c.is_public ? C.gold : C.muted, background: C.surf3, padding: '1px 5px', borderRadius: 3, marginLeft: 6 }}>
                      {c.type === 'bracket' ? 'BRACKET' : c.is_public ? 'PUBLIC' : 'PRIVATE'}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'center' as const }}>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text }}>{c.members}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted }}>entries</div>
                </div>
                <div style={{ textAlign: 'center' as const }}>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.gold }}>${(c.gross / 100).toFixed(2)}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted }}>pool</div>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.green }}>${(c.rake / 100).toFixed(2)}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, color: C.muted }}>rake</div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        completedStats.length === 0 ? (
          <div style={{ color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11, textAlign: 'center' as const, padding: 20 }}>No completed contests yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {completedStats.map(s => (
              <div key={s.id} style={{ background: C.surf2, borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, marginBottom: 2 }}>{s.contest_name}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>
                    {s.contest_type?.toUpperCase()} · {s.total_entries} entries · {new Date(s.completed_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.gold }}>${(s.rake_cents / 100).toFixed(2)}</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>rake earned</div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function SimulationRunner() {
  const supabase = createClientComponentClient()
  const [contestType,      setContestType]      = useState<'weekly' | 'bracket'>('weekly')
  const [contestId,        setContestId]        = useState('')
  const [contests,         setContests]         = useState<any[]>([])
  const [numBots,          setNumBots]          = useState(5)
  const [simulateResults,  setSimulateResults]  = useState(true)
  const [running,          setRunning]          = useState(false)
  const [result,           setResult]           = useState<any>(null)
  const [error,            setError]            = useState('')
  const [cleaning,         setCleaning]         = useState(false)

  useEffect(() => {
    if (contestType === 'weekly') {
      supabase.from('leagues').select('id, name, buy_in').eq('league_type', 'weekly').eq('is_public', true)
        .then(({ data }) => { setContests(data ?? []); setContestId(data?.[0]?.id ?? '') })
    } else {
      supabase.from('bracket_contests').select('id, name, entry_fee_cents').eq('status', 'open')
        .then(({ data }) => { setContests(data ?? []); setContestId(data?.[0]?.id ?? '') })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestType])

  async function runSimulation() {
    if (!contestId) return
    setRunning(true)
    setResult(null)
    setError('')
    try {
      const res = await fetch('/api/admin/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contestType, contestId, numBots, simulateResults }),
      })
      const data = await res.json()
      if (res.ok) setResult(data)
      else setError(data.error ?? 'Simulation failed')
    } catch (e: any) {
      setError(e.message)
    }
    setRunning(false)
  }

  async function cleanupBots() {
    if (!confirm('Delete ALL bot simulation accounts? This cannot be undone.')) return
    setCleaning(true)
    try {
      const res = await fetch('/api/admin/cleanup-bots', { method: 'POST' })
      const data = await res.json()
      alert(`Cleaned up ${data.deleted} bot account${data.deleted !== 1 ? 's' : ''}${data.errors?.length ? `\n${data.errors.length} error(s)` : ''}`)
    } catch (e: any) {
      alert('Cleanup error: ' + e.message)
    }
    setCleaning(false)
  }

  return (
    <div style={{ background: C.surf, border: `2px solid rgba(240,58,90,.3)`, borderRadius: 12, padding: 24, marginTop: 20 }}>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 3, color: C.red, textTransform: 'uppercase', marginBottom: 4 }}>Admin Only</div>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>🤖 Contest Simulator</div>

      <label style={labelStyle}>Contest Type</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['weekly', 'bracket'] as const).map(t => (
          <button key={t} onClick={() => setContestType(t)}
            style={{ flex: 1, padding: '10px', border: `2px solid ${contestType === t ? C.gold : C.surf3}`, borderRadius: 8, cursor: 'pointer', background: contestType === t ? 'rgba(245,166,35,.1)' : C.surf2, color: contestType === t ? C.gold : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 12, textTransform: 'capitalize' as const }}>
            {t === 'weekly' ? '⚡ Weekly' : '🏆 Bracket'}
          </button>
        ))}
      </div>

      <label style={labelStyle}>Select Contest</label>
      <select value={contestId} onChange={e => setContestId(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 13, marginBottom: 16, outline: 'none' }}>
        {contests.length === 0 && <option value="">No contests available</option>}
        {contests.map(c => (
          <option key={c.id} value={c.id}>
            {c.name} — {c.buy_in != null && c.buy_in > 0 ? `$${c.buy_in}` : c.entry_fee_cents != null && c.entry_fee_cents > 0 ? `$${(c.entry_fee_cents / 100).toFixed(2)}` : 'Free'}
          </option>
        ))}
      </select>

      <label style={labelStyle}>Number of Bots</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {[3, 5, 10, 20, 50].map(n => (
          <button key={n} onClick={() => setNumBots(n)}
            style={{ flex: 1, padding: '7px 4px', border: `2px solid ${numBots === n ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: numBots === n ? 'rgba(245,166,35,.1)' : C.surf2, color: numBots === n ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted }}>Custom:</span>
        <input type="number" min={1} max={1000} value={numBots}
          onChange={e => setNumBots(Math.max(1, parseInt(e.target.value) || 1))}
          style={{ width: 80, padding: '6px 8px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12 }} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
        <input type="checkbox" checked={simulateResults} onChange={e => setSimulateResults(e.target.checked)}
          style={{ accentColor: C.gold, width: 16, height: 16 }} />
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text }}>
          Simulate results &amp; pay out winners
        </span>
      </label>

      {error && (
        <div style={{ padding: '10px 12px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.red, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ padding: '14px 16px', background: 'rgba(21,198,120,.08)', border: '1px solid rgba(21,198,120,.2)', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.green, marginBottom: 10 }}>
            ✓ Simulation Complete — {result.contestName}
          </div>
          {result.botsCreated < numBots && (
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.gold, marginBottom: 8 }}>
              ⚠️ Only {result.botsCreated} bots entered — contest was capped at {result.botsCreated} remaining spots
            </div>
          )}
          {result.realUsersIncluded > 0 && (
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.gold, marginBottom: 8 }}>
              ℹ️ {result.realUsersIncluded} real user{result.realUsersIncluded > 1 ? 's' : ''} included in simulation
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {([
              ['Total Entrants',  result.totalEntrants ?? result.botsCreated],
              ['Bots Created',    result.botsCreated],
              ['Real Users',      result.realUsersIncluded ?? 0],
              ['Total Pool',     `$${(result.totalPoolCents / 100).toFixed(2)}`],
              ['Net Prize Pool', `$${(result.netPoolCents / 100).toFixed(2)}`],
              ['Platform Rake',  `$${(result.rakeCents / 100).toFixed(2)}`],
            ] as [string, any][]).map(([label, value]) => (
              <div key={label} style={{ background: C.surf2, borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' as const }}>{label}</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: C.gold }}>{value}</div>
              </div>
            ))}
          </div>
          {result.payouts.length > 0 && (
            <>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 6 }}>Payouts</div>
              {result.payouts.map((p: any) => (
                <div key={p.rank} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, marginBottom: 4 }}>
                  <span>🏆 Rank #{p.rank} — {p.botEmail}{p.isReal ? ' 👤' : ' 🤖'}</span>
                  <span style={{ color: C.gold }}>${p.payoutDollars}</span>
                </div>
              ))}
            </>
          )}
          {result.errors?.length > 0 && (
            <div style={{ marginTop: 8, fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.red }}>
              {result.errors.length} error(s): {result.errors[0]}
            </div>
          )}
        </div>
      )}

      <button onClick={runSimulation} disabled={!contestId || running}
        style={{ width: '100%', padding: '13px', background: contestId && !running ? C.red : C.surf3, border: 'none', borderRadius: 8, cursor: contestId && !running ? 'pointer' : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: contestId && !running ? '#fff' : C.muted, textTransform: 'uppercase' as const, marginBottom: 12 }}>
        {running ? '⏳ Running Simulation…' : '🤖 Run Simulation'}
      </button>

      <button onClick={cleanupBots} disabled={cleaning}
        style={{ width: '100%', padding: '10px', background: 'none', border: `1px solid rgba(240,58,90,.25)`, borderRadius: 8, cursor: cleaning ? 'not-allowed' : 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' as const }}>
        {cleaning ? 'Cleaning up…' : '🗑️ Delete All Bot Accounts'}
      </button>

      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 8, textAlign: 'center' as const }}>
        Bot accounts are real Supabase users. Use cleanup tool after testing.
      </div>
    </div>
  )
}

export default function PlatformManagerPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email !== 'whb21burton@gmail.com') router.push('/')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '40px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <button onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, marginBottom: 16, padding: 0 }}>
            ← Back to Home
          </button>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
            ⚡ Platform Manager
          </div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted, marginTop: 4 }}>
            Admin only · Everything created here goes directly to Browse Public Leagues
          </div>
        </div>

        <PageControls />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
          <WeeklyPickemCreator />
          <PublicBracketCreator />
        </div>
        <SimulationRunner />
        <AdminStats />
        <ESPNSyncPanel />
        <BracketTeamsEditor />
      </div>
    </div>
  )
}
