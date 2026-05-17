'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#f5a623', text: '#e4edf7', sub: '#7a90aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a',
}

function WeeklyPickemCreator() {
  const [name, setName] = useState('')
  const [week, setWeek] = useState(1)
  const [buyIn, setBuyIn] = useState(0)
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
        league_size: 999999,
        draft_type: 'snake',
        is_public: true,
        league_type: 'weekly',
        week,
        team_name: 'Platform',
        copies: 1,
        settings: {},
        max_entries_per_user: null,
        is_capped: false,
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

      <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Contest Name</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Week 1 $5 Shootout"
        maxLength={40}
        style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 13, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }} />

      <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Week</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16 }}>
        {Array.from({ length: 14 }, (_, i) => i + 1).map(w => (
          <button key={w} onClick={() => setWeek(w)}
            style={{ padding: '8px 4px', border: `2px solid ${week === w ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: week === w ? 'rgba(245,166,35,.1)' : C.surf2, color: week === w ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
            {w}
          </button>
        ))}
      </div>

      <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Entry Fee</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[0, 1, 5, 10, 25].map(amt => (
          <button key={amt} onClick={() => setBuyIn(amt)}
            style={{ flex: 1, padding: '8px 4px', border: `2px solid ${buyIn === amt ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: buyIn === amt ? 'rgba(245,166,35,.1)' : C.surf2, color: buyIn === amt ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
            {amt === 0 ? 'Free' : `$${amt}`}
          </button>
        ))}
      </div>

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
  const [maxEntries, setMaxEntries] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const supabase = createClientComponentClient()

  async function handleCreate() {
    setSubmitting(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: err } = await supabase
      .from('bracket_contests')
      .insert({
        name: name.trim(),
        sport,
        season: 2025,
        status: 'open',
        entry_fee_cents: entryFeeCents,
        max_entries: maxEntries,
        created_by: user?.id,
      })
      .select('id')
      .single()
    setSubmitting(false)
    if (!err && data) {
      setSuccess(`✓ "${name}" bracket created and live!`)
      setName('')
      setTimeout(() => setSuccess(''), 4000)
    } else {
      setError(err?.message ?? 'Failed to create')
    }
  }

  return (
    <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 24 }}>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 3, color: C.green, textTransform: 'uppercase', marginBottom: 4 }}>Public Bracket</div>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>🏆 Create Bracket Contest</div>

      <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Sport</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['football', '🏈'], ['basketball', '🏀'], ['baseball', '⚾']] as const).map(([s, icon]) => (
          <button key={s} onClick={() => setSport(s)}
            style={{ flex: 1, padding: '10px 4px', border: `2px solid ${sport === s ? C.gold : C.surf3}`, borderRadius: 8, cursor: 'pointer', background: sport === s ? 'rgba(245,166,35,.1)' : C.surf2, color: sport === s ? C.gold : C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 11, textAlign: 'center' }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
            <div style={{ textTransform: 'capitalize' }}>{s}</div>
          </button>
        ))}
      </div>

      <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Contest Name</label>
      <input value={name} onChange={e => setName(e.target.value)}
        placeholder={`e.g. 2025 ${sport.charAt(0).toUpperCase() + sport.slice(1)} Bracket`}
        maxLength={60}
        style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 13, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }} />

      <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Entry Fee</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([[0, 'Free'], [100, '$1'], [500, '$5'], [1000, '$10'], [2500, '$25']] as [number, string][]).map(([cents, label]) => (
          <button key={cents} onClick={() => setEntryFeeCents(cents)}
            style={{ flex: 1, padding: '8px 4px', border: `2px solid ${entryFeeCents === cents ? C.gold : C.surf3}`, borderRadius: 6, cursor: 'pointer', background: entryFeeCents === cents ? 'rgba(245,166,35,.1)' : C.surf2, color: entryFeeCents === cents ? C.gold : C.sub, fontFamily: 'Anton,sans-serif', fontSize: 12 }}>
            {label}
          </button>
        ))}
      </div>

      <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Max Entries (optional)</label>
      <input type="number" value={maxEntries ?? ''} onChange={e => setMaxEntries(e.target.value ? parseInt(e.target.value) : null)}
        placeholder="Unlimited"
        style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 13, marginBottom: 20, boxSizing: 'border-box', outline: 'none' }} />

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
