'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#f5a623', text: '#e4edf7', sub: '#7a90aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a',
}

const SPORTS = [
  { key: 'football',   label: 'Football',   icon: '🏈', desc: 'College Football Playoff' },
  { key: 'basketball', label: 'Basketball', icon: '🏀', desc: 'March Madness'            },
  { key: 'baseball',   label: 'Baseball',   icon: '⚾', desc: 'College World Series'     },
]

export default function BracketsPage() {
  const router  = useRouter()
  const supabase = createClientComponentClient()
  const [sport,    setSport]    = useState('football')
  const [contests, setContests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [userId,   setUserId]   = useState<string | null>(null)
  const [balance,  setBalance]  = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      fetch('/api/wallet').then(r => r.json()).then(d => setBalance(d.wallet?.available ?? 0))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('bracket_contests')
      .select('*')
      .eq('sport', sport)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setContests(data ?? [])
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport])

  const activeSport = SPORTS.find(s => s.key === sport)!

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex' }}>

      {/* Left sidebar */}
      <div style={{
        width: 220, flexShrink: 0, background: C.surf,
        borderRight: `1px solid ${C.surf3}`, padding: '24px 0',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '0 20px 20px', borderBottom: `1px solid ${C.surf3}`, marginBottom: 16 }}>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, padding: 0, marginBottom: 12 }}
          >
            ← Back
          </button>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
            🏆 Bracket Contests
          </div>
        </div>

        {/* Sport tabs */}
        <div style={{ padding: '0 12px', flex: 1 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 8 }}>
            Sport
          </div>
          {SPORTS.map(s => (
            <button
              key={s.key}
              onClick={() => setSport(s.key)}
              style={{
                width: '100%', padding: '12px 14px', marginBottom: 4,
                background: sport === s.key ? 'rgba(245,166,35,.1)' : 'none',
                border: `1px solid ${sport === s.key ? C.gold : 'transparent'}`,
                borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: sport === s.key ? C.gold : C.text, letterSpacing: 0.5 }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 1 }}>
                  {s.desc}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Balance */}
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.surf3}`, marginTop: 'auto' }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            Your Balance
          </div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.gold }}>
            ${(balance / 100).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 26, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 4 }}>
            {activeSport.icon} {activeSport.label} Brackets
          </div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted }}>
            {activeSport.desc} · Pick your bracket, compete for prizes
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
            Loading contests…
          </div>
        ) : contests.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 40px',
            background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{activeSport.icon}</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              No {activeSport.label} Contests Yet
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Bracket contests will appear here when the season begins.
              <br />Check back soon!
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {contests.map(contest => (
              <div
                key={contest.id}
                style={{
                  background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12,
                  padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20,
                  cursor: 'pointer', transition: 'border-color .15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = C.gold + '66'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = C.surf3}
                onClick={() => router.push(`/brackets/${contest.id}`)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.text, letterSpacing: 1, marginBottom: 4 }}>
                    {contest.name}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted }}>
                    <span>🏆 Prize: <strong style={{ color: C.gold }}>${((contest.prize_pool_cents ?? 0) / 100).toFixed(0)}</strong></span>
                    <span>👥 Entries: <strong style={{ color: C.text }}>{contest.entry_count ?? 0}/{contest.max_entries ?? '∞'}</strong></span>
                    <span>💰 Entry: <strong style={{ color: C.text }}>{contest.entry_fee_cents === 0 ? 'Free' : `$${(contest.entry_fee_cents / 100).toFixed(2)}`}</strong></span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    padding: '8px 18px', background: C.gold, borderRadius: 8,
                    fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2,
                    color: C.bg, textTransform: 'uppercase',
                  }}>
                    Enter →
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
