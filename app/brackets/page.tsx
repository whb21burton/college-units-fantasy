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
  const [sport,          setSport]          = useState('football')
  const [contests,       setContests]       = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [userId,         setUserId]         = useState<string | null>(null)
  const [balance,        setBalance]        = useState(0)
  const [myEntryCounts,  setMyEntryCounts]  = useState<Record<string, number>>({})
  const [isAdmin,        setIsAdmin]        = useState(false)

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'active_bracket_sport')
      .single()
      .then(({ data }) => { if (data?.value) setSport(data.value as any) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      if (user.email === 'whb21burton@gmail.com') setIsAdmin(true)
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

  useEffect(() => {
    if (!userId || contests.length === 0) return
    const ids = contests.map(c => c.id)
    supabase
      .from('user_bracket_entries')
      .select('contest_id')
      .eq('user_id', userId)
      .in('contest_id', ids)
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        for (const row of data ?? []) {
          counts[row.contest_id] = (counts[row.contest_id] ?? 0) + 1
        }
        setMyEntryCounts(counts)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, contests])

  async function handleDeleteContest(contestId: string, contestName: string) {
    if (!confirm(`Delete "${contestName}"? This cannot be undone.`)) return
    const { error } = await supabase
      .from('bracket_contests')
      .delete()
      .eq('id', contestId)
    if (!error) {
      setContests(prev => prev.filter(c => c.id !== contestId))
    } else {
      alert('Error deleting: ' + error.message)
    }
  }

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
          <div>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '2fr 1fr 1fr 1fr 1fr 1fr auto auto' : '2fr 1fr 1fr 1fr 1fr 1fr auto', gap: 8, padding: '8px 16px', borderBottom: `1px solid ${C.surf3}`, marginBottom: 4 }}>
              {['Contest', 'Your Entries', 'Entry Fee', 'Total Prizes', 'Entries', 'Live/Start', ''].map((h, i) => (
                <div key={i} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>{h}</div>
              ))}
              {isAdmin && <div />}
            </div>
            {contests.map(contest => {
              const myCount    = myEntryCounts[contest.id] ?? 0
              const maxPerAcct = contest.settings?.max_per_account ?? 1
              const entryFee   = contest.entry_fee_cents / 100
              const totalEntries = contest.entry_count ?? 0
              const totalPrize = (entryFee * totalEntries * 0.95).toFixed(2)
              const sportIcon  = contest.sport === 'football' ? '🏈' : contest.sport === 'basketball' ? '🏀' : '⚾'
              return (
                <div key={contest.id}
                  style={{ display: 'grid', gridTemplateColumns: isAdmin ? '2fr 1fr 1fr 1fr 1fr 1fr auto auto' : '2fr 1fr 1fr 1fr 1fr 1fr auto', gap: 8, padding: '14px 16px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, marginBottom: 6, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text, fontWeight: 600 }}>{contest.name}</div>
                    <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {sportIcon} {contest.sport.charAt(0).toUpperCase() + contest.sport.slice(1)} · Bracket
                    </div>
                    {contest.settings?.description && (
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.sub, marginTop: 2 }}>{contest.settings.description}</div>
                    )}
                  </div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: myCount > 0 ? C.gold : C.muted }}>
                    {myCount} / {maxPerAcct === 999 ? '∞' : maxPerAcct}
                  </div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text }}>
                    {contest.entry_fee_cents === 0
                      ? <span style={{ color: C.green, fontFamily: 'Anton,sans-serif', fontSize: 13 }}>FREE</span>
                      : <span>🪙 ${entryFee.toFixed(2)}</span>}
                  </div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.gold }}>
                    ${totalPrize}
                  </div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text }}>
                    {totalEntries}{contest.max_entries ? `/${contest.max_entries}` : '/∞'}
                  </div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, lineHeight: 1.3 }}>
                    When first<br />game starts
                  </div>
                  <button
                    onClick={() => router.push(`/brackets/${contest.id}`)}
                    style={{ padding: '8px 16px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1, color: C.bg, whiteSpace: 'nowrap' as const }}>
                    Enter
                  </button>
                  {isAdmin && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteContest(contest.id, contest.name) }}
                      style={{ padding: '8px 10px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: C.red, transition: 'all .15s' }}
                      title="Delete contest">
                      🗑️
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
