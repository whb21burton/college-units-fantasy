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
  payoutStructure: 'winner_take_all' | 'top2' | 'top3'
  setPayoutStructure: (v: 'winner_take_all' | 'top2' | 'top3') => void
}) {
  const totalPool = feeAmount * (maxAccounts ?? 100)
  const net = totalPool * 0.95
  const presets = {
    winner_take_all: [{ place: '1st', pct: 100, amt: net }],
    top2: [{ place: '1st', pct: 70, amt: net * 0.70 }, { place: '2nd', pct: 30, amt: net * 0.30 }],
    top3: [{ place: '1st', pct: 60, amt: net * 0.60 }, { place: '2nd', pct: 25, amt: net * 0.25 }, { place: '3rd', pct: 15, amt: net * 0.15 }],
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>Payout Structure</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['winner_take_all', 'top2', 'top3'] as const).map((key) => (
          <button key={key} onClick={() => setPayoutStructure(key)}
            style={{ flex: 1, padding: '8px 4px', border: `2px solid ${payoutStructure === key ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: payoutStructure === key ? 'rgba(245,166,35,.1)' : C.surf2, color: payoutStructure === key ? C.gold : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 0.5 }}>
            {key === 'winner_take_all' ? 'Winner Take All' : key === 'top2' ? 'Top 2' : 'Top 3'}
          </button>
        ))}
      </div>
      <div style={{ background: C.surf2, borderRadius: 6, padding: '10px 12px' }}>
        {presets[payoutStructure].map(p => (
          <div key={p.place} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, marginBottom: 3 }}>
            <span>{p.place} place</span>
            <span style={{ color: C.gold }}>${p.amt.toFixed(2)} ({p.pct}%)</span>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${C.surf3}`, marginTop: 6, paddingTop: 6, fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted }}>
          Based on {maxAccounts ?? 100} entries · 5% platform fee deducted
        </div>
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
  const [payoutStructure, setPayoutStructure] = useState<'winner_take_all' | 'top2' | 'top3'>('winner_take_all')
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

      <label style={labelStyle}>Max Accounts</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([null, 50, 100, 250, 500, 1000] as (number | null)[]).map(n => (
          <button key={n ?? 'unlimited'} onClick={() => setMaxAccounts(n)}
            style={selBtn(maxAccounts === n)}>
            {n === null ? '∞' : n}
          </button>
        ))}
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
  const [sport, setSport] = useState<'football' | 'basketball' | 'baseball'>('baseball')
  const [entryFeeCents, setEntryFeeCents] = useState(0)
  const [maxAccounts, setMaxAccounts] = useState<number | null>(null)
  const [maxPerAccount, setMaxPerAccount] = useState(1)
  const [copies, setCopies] = useState(1)
  const [payoutStructure, setPayoutStructure] = useState<'winner_take_all' | 'top2' | 'top3'>('winner_take_all')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const supabase = createClientComponentClient()

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
    setSubmitting(false)
    setSuccess(`✓ ${results.length} bracket contest${results.length > 1 ? 's' : ''} created and live!`)
    setName('')
    setTimeout(() => setSuccess(''), 4000)
  }

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 24 }}>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 3, color: C.green, textTransform: 'uppercase', marginBottom: 4 }}>Public Bracket</div>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>🏆 Create Bracket Contest</div>

      <label style={labelStyle}>Sport</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['football', '🏈'], ['basketball', '🏀'], ['baseball', '⚾']] as const).map(([s, icon]) => (
          <button key={s} onClick={() => setSport(s)}
            style={{ flex: 1, padding: '10px 4px', border: `2px solid ${sport === s ? C.gold : C.surf3}`, borderRadius: 8, cursor: 'pointer', background: sport === s ? 'rgba(245,166,35,.1)' : C.surf2, color: sport === s ? C.gold : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 11, textAlign: 'center' }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
            <div style={{ textTransform: 'capitalize' }}>{s}</div>
          </button>
        ))}
      </div>

      <label style={labelStyle}>Contest Name</label>
      <input value={name} onChange={e => setName(e.target.value)}
        placeholder={`e.g. 2025 ${sport.charAt(0).toUpperCase() + sport.slice(1)} Bracket`}
        maxLength={60}
        style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 13, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }} />

      <label style={labelStyle}>Entry Fee</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([[0, 'Free'], [100, '$1'], [500, '$5'], [1000, '$10'], [2500, '$25']] as [number, string][]).map(([cents, label]) => (
          <button key={cents} onClick={() => setEntryFeeCents(cents)}
            style={{ flex: 1, padding: '8px 4px', border: `2px solid ${entryFeeCents === cents ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: entryFeeCents === cents ? 'rgba(245,166,35,.1)' : C.surf2, color: entryFeeCents === cents ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
            {label}
          </button>
        ))}
      </div>

      <label style={labelStyle}>Max Accounts</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([null, 50, 100, 250, 500, 1000] as (number | null)[]).map(n => (
          <button key={n ?? 'unlimited'} onClick={() => setMaxAccounts(n)}
            style={selBtn(maxAccounts === n)}>
            {n === null ? '∞' : n}
          </button>
        ))}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
          <WeeklyPickemCreator />
          <PublicBracketCreator />
        </div>
      </div>
    </div>
  )
}
