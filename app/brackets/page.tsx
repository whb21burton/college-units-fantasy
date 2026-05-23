'use client'
import { useState, useEffect, useRef } from 'react'
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
  const router   = useRouter()
  const supabase = createClientComponentClient()

  const [pageLocked,      setPageLocked]      = useState<boolean | null>(null)
  const [sportLocks,      setSportLocks]      = useState({ football: false, basketball: false, baseball: false })
  const [sport,           setSport]           = useState<'football' | 'basketball' | 'baseball'>('baseball')
  const [contests,        setContests]        = useState<any[]>([])
  const [loading,         setLoading]         = useState(true)
  const [userId,          setUserId]          = useState<string | null>(null)
  const [userBalance,     setUserBalance]     = useState(0)
  const [myEntryCounts,   setMyEntryCounts]   = useState<Record<string, number>>({})
  const [isAdmin,         setIsAdmin]         = useState(false)
  const [selectedContest, setSelectedContest] = useState<any>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [teamName,        setTeamName]        = useState('')
  const [entering,        setEntering]        = useState(false)
  const [enterError,      setEnterError]      = useState('')
  const [isMobile,        setIsMobile]        = useState(false)
  const [sidebarOpen,     setSidebarOpen]     = useState(false)
  const touchStartX = useRef<number>(0)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function handleTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (dx > 60) setSidebarOpen(true)
    if (dx < -60) setSidebarOpen(false)
  }

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['active_bracket_sport', 'bracket_contests_locked', 'bracket_sport_football_locked', 'bracket_sport_basketball_locked', 'bracket_sport_baseball_locked'])
      .then(({ data }) => {
        const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]))
        if (map['active_bracket_sport']) setSport(map['active_bracket_sport'] as any)
        setPageLocked(map['bracket_contests_locked'] === 'true')
        setSportLocks({
          football:   map['bracket_sport_football_locked']   === 'true',
          basketball: map['bracket_sport_basketball_locked'] === 'true',
          baseball:   map['bracket_sport_baseball_locked']   === 'true',
        })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      if (user.email === 'whb21burton@gmail.com') setIsAdmin(true)
      fetch('/api/wallet').then(r => r.json()).then(d => setUserBalance(d.wallet?.available ?? 0))
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
      .eq('created_by', '603b48b1-3e85-4c72-bedb-c5166bbe9c6e')
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

  async function handleEnterContest(contest: any) {
    const feeCents = contest.entry_fee_cents ?? 0
    setEntering(true)
    setEnterError('')

    // Check if already has entry row
    const { data: existing } = await supabase
      .from('user_bracket_entries')
      .select('id, entry_number')
      .eq('contest_id', contest.id)
      .eq('user_id', userId!)
      .order('entry_number', { ascending: true })

    if (existing && existing.length > 0) {
      setEntering(false)
      setShowDetailModal(false)
      router.push('/my-leagues?contest=' + contest.id)
      return
    }

    // Recovery: already paid but no entry row (broken state from previous failed insert)
    if (feeCents > 0) {
      const { data: paidTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId!)
        .eq('type', 'contest_entry')
        .eq('status', 'completed')
        .ilike('description', `%${contest.id}%`)
        .maybeSingle()

      if (paidTx) {
        await supabase.from('user_bracket_entries').upsert({
          contest_id:   contest.id,
          user_id:      userId!,
          entry_name:   teamName.trim() || 'My Bracket',
          entry_number: 1,
          is_submitted: false,
        }, { onConflict: 'contest_id,user_id,entry_number' })
        setMyEntryCounts(prev => ({ ...prev, [contest.id]: 1 }))
        setEntering(false)
        setShowDetailModal(false)
        router.push('/my-leagues?contest=' + contest.id)
        return
      }
    }

    // Normal flow — pay then create entry
    if (feeCents > 0) {
      if (userBalance < feeCents) {
        setEnterError(`Not enough funds. Need $${(feeCents / 100).toFixed(2)}, you have $${(userBalance / 100).toFixed(2)}.`)
        setEntering(false)
        return
      }
      const res = await fetch('/api/wallet/bracket-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contestId: contest.id, buyInCents: feeCents, entryNumber: 1 }),
      })
      if (!res.ok) {
        const d = await res.json()
        setEnterError(d.error ?? 'Payment failed')
        setEntering(false)
        return
      }
      setUserBalance(prev => prev - feeCents)
    }

    // Create entry row
    const { error: upsertErr } = await supabase.from('user_bracket_entries').upsert({
      contest_id:   contest.id,
      user_id:      userId!,
      entry_name:   teamName.trim() || 'My Bracket',
      entry_number: 1,
      is_submitted: false,
    }, { onConflict: 'contest_id,user_id,entry_number' })

    if (upsertErr) {
      // Payment succeeded but entry row failed — retry once
      await supabase.from('user_bracket_entries').upsert({
        contest_id:   contest.id,
        user_id:      userId!,
        entry_name:   teamName.trim() || 'My Bracket',
        entry_number: 1,
        is_submitted: false,
      }, { onConflict: 'contest_id,user_id,entry_number' })
    }

    setEntering(false)
    setShowDetailModal(false)
    setMyEntryCounts(prev => ({ ...prev, [contest.id]: (prev[contest.id] ?? 0) + 1 }))
    router.push('/my-leagues?contest=' + contest.id)
  }

  async function handleDeleteContest(contestId: string, contestName: string) {
    if (!confirm(`Delete "${contestName}"? All paid entries will be refunded.`)) return
    const res = await fetch(`/api/brackets/${contestId}/delete`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setContests(prev => prev.filter(c => c.id !== contestId))
      if (data.refunded > 0) alert(`Contest deleted. ${data.refunded} refund(s) issued.`)
    } else {
      alert('Error: ' + (data.error ?? 'Delete failed'))
    }
  }

  async function handleCompleteContest(contestId: string, contestName: string) {
    if (!confirm(`Complete "${contestName}" and distribute payouts?`)) return
    const res = await fetch(`/api/brackets/${contestId}/complete`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setContests(prev => prev.filter(c => c.id !== contestId))
      alert(`Completed! ${data.totalEntries} entries · $${(data.netPoolCents / 100).toFixed(2)} net pool · ${data.payouts.length} payout(s).`)
    } else {
      alert('Error: ' + (data.error ?? 'Complete failed'))
    }
  }

  if (pageLocked === null) return null
  if (pageLocked && !isAdmin) return (
    <div style={{ minHeight: '100vh', background: '#070a12', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 64 }}>🔒</div>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 24, color: '#e4edf7', letterSpacing: 2, textTransform: 'uppercase' }}>Bracket Contests Unavailable</div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: '#7a90aa' }}>This section is temporarily unavailable. Check back soon.</div>
      <button onClick={() => router.push('/')} style={{ padding: '12px 24px', background: 'none', border: '1px solid #1e2d47', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 12, color: '#7a90aa', marginTop: 8 }}>← Back to Home</button>
    </div>
  )

  const activeSport = SPORTS.find(s => s.key === sport)!

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column' }}>

      {/* Mobile header */}
      {isMobile && (
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: C.surf, borderBottom: `1px solid ${C.surf3}`, flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gold, fontSize: 20, padding: 0 }}>☰</button>
          <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: C.text, letterSpacing: 1, textTransform: 'uppercase' }}>
            Bracket Contests
          </span>
        </div>
      )}

      {/* Backdrop */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)' }} />
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* Left sidebar */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          width: 220, flexShrink: 0, background: C.surf,
          borderRight: `1px solid ${C.surf3}`, padding: '24px 0',
          display: 'flex', flexDirection: 'column',
          ...(isMobile ? {
            position: 'fixed' as const, top: 0, left: 0, bottom: 0,
            width: '80vw', maxWidth: 300, zIndex: 1000,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.6)' : 'none',
            overflowY: 'auto' as const,
          } : {}),
        }}
      >
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

        <div style={{ padding: '0 12px', flex: 1 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 8 }}>
            Sport
          </div>
          {SPORTS.map(s => {
            const sportLocked = !isAdmin && sportLocks[s.key as keyof typeof sportLocks]
            return (
              <button
                key={s.key}
                onClick={() => !sportLocked && setSport(s.key as 'football' | 'basketball' | 'baseball')}
                disabled={sportLocked}
                style={{
                  width: '100%', padding: '12px 14px', marginBottom: 4,
                  background: sport === s.key ? 'rgba(245,166,35,.1)' : 'none',
                  border: `1px solid ${sport === s.key ? C.gold : 'transparent'}`,
                  borderRadius: 8, cursor: sportLocked ? 'not-allowed' : 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: sportLocked ? 0.4 : 1,
                }}
              >
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: sport === s.key ? C.gold : sportLocked ? C.muted : C.text, letterSpacing: 0.5 }}>
                    {s.label}{sportLocked ? ' 🔒' : ''}
                  </div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 1 }}>
                    {s.desc}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.surf3}`, marginTop: 'auto' }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            Your Balance
          </div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.gold }}>
            ${(userBalance / 100).toFixed(2)}
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
            <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '2fr 1fr 1fr 1fr 1fr 1fr auto auto auto' : '2fr 1fr 1fr 1fr 1fr 1fr auto', gap: 8, padding: '8px 16px', borderBottom: `1px solid ${C.surf3}`, marginBottom: 4 }}>
              {['Contest', 'Your Entries', 'Entry Fee', 'Total Prizes', 'Entries', 'Live/Start', ''].map((h, i) => (
                <div key={i} style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>{h}</div>
              ))}
              {isAdmin && <><div /><div /></>}
            </div>
            {contests.map(contest => {
              const myCount      = myEntryCounts[contest.id] ?? 0
              const alreadyEntered = myCount > 0
              const maxPerAcct   = contest.settings?.max_per_account ?? 1
              const entryFee     = contest.entry_fee_cents / 100
              const totalEntries = contest.entry_count ?? 0
              const totalPrize   = (entryFee * totalEntries * 0.95).toFixed(2)
              const sportIcon    = contest.sport === 'football' ? '🏈' : contest.sport === 'basketball' ? '🏀' : '⚾'
              return (
                <div key={contest.id}
                  onClick={() => {
                    if (alreadyEntered) { router.push('/my-leagues?contest=' + contest.id); return }
                    setSelectedContest(contest); setShowDetailModal(true); setEnterError(''); setTeamName('')
                  }}
                  style={{ display: 'grid', gridTemplateColumns: isAdmin ? '2fr 1fr 1fr 1fr 1fr 1fr auto auto auto' : '2fr 1fr 1fr 1fr 1fr 1fr auto', gap: 8, padding: '14px 16px', background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, marginBottom: 6, alignItems: 'center', cursor: 'pointer', transition: 'border-color .12s', opacity: alreadyEntered ? 0.75 : 1 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = alreadyEntered ? C.green : C.gold)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.surf3)}
                >
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
                    onClick={e => { e.stopPropagation(); if (alreadyEntered) { router.push('/my-leagues?contest=' + contest.id); return } setSelectedContest(contest); setShowDetailModal(true); setEnterError(''); setTeamName('') }}
                    style={{ padding: '8px 16px', background: alreadyEntered ? 'rgba(21,198,120,.1)' : C.gold, border: alreadyEntered ? '1px solid rgba(21,198,120,.3)' : 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 1, color: alreadyEntered ? C.green : C.bg, whiteSpace: 'nowrap' as const }}>
                    {alreadyEntered ? '✓ Entered' : 'Enter'}
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); handleCompleteContest(contest.id, contest.name) }}
                        style={{ padding: '8px 10px', background: 'rgba(21,198,120,.1)', border: '1px solid rgba(21,198,120,.3)', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: C.green }}
                        title="Complete & pay out">
                        ✓
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteContest(contest.id, contest.name) }}
                        style={{ padding: '8px 10px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: C.red }}
                        title="Delete contest">
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      </div>{/* end flex wrapper */}

      {/* ── Contest detail / enter modal ── */}
      {showDetailModal && selectedContest && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowDetailModal(false)}
        >
          <div
            style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.surf3}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 4 }}>
                  {selectedContest.sport === 'baseball' ? '⚾' : selectedContest.sport === 'football' ? '🏈' : '🏀'} {selectedContest.sport} · Bracket Contest
                </div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, color: C.text, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {selectedContest.name}
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 20, padding: 4 }}
              >✕</button>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, borderBottom: `1px solid ${C.surf3}` }}>
              {[
                ['Entry',   selectedContest.entry_fee_cents === 0 ? 'FREE' : `$${(selectedContest.entry_fee_cents / 100).toFixed(2)}`],
                ['Entries', `${selectedContest.entry_count ?? 0}${selectedContest.max_entries ? ` / ${selectedContest.max_entries}` : ''}`],
                ['Prizes',  selectedContest.prize_pool_cents > 0 ? `$${(selectedContest.prize_pool_cents / 100).toFixed(2)}` : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ padding: '14px 16px', background: C.surf2, textAlign: 'center' as const }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.gold }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              {selectedContest.max_entries && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub }}>
                  <span>Spots Left</span>
                  <span style={{ color: C.text }}>{(selectedContest.max_entries ?? 0) - (selectedContest.entry_count ?? 0)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub }}>
                <span>Max Entries Per Person</span>
                <span style={{ color: C.text }}>{selectedContest.settings?.max_per_account ?? 1}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub }}>
                <span>Scoring</span>
                <span style={{ color: C.text }}>1 pt per correct pick</span>
              </div>

              {selectedContest.settings?.payout_structure && (
                <div style={{ marginBottom: 20, padding: '12px 14px', background: C.surf2, borderRadius: 8 }}>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Payout Structure</div>
                  <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub }}>
                    {selectedContest.settings.payout_structure === 'winner_take_all' && '🥇 Winner takes 100% of net pool'}
                    {selectedContest.settings.payout_structure === 'top2'            && '🥇 1st: 70% · 🥈 2nd: 30%'}
                    {selectedContest.settings.payout_structure === 'top3'            && '🥇 1st: 60% · 🥈 2nd: 25% · 🥉 3rd: 15%'}
                    {selectedContest.settings.payout_structure === 'double_up'       && '🔁 Top 50% wins 1.95× entry fee'}
                  </div>
                </div>
              )}

              <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Your Entry Name
              </label>
              <input
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="e.g. My Bracket"
                maxLength={40}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && teamName.trim() && !entering) handleEnterContest(selectedContest) }}
                style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12 }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, padding: '10px 12px', background: C.surf2, borderRadius: 8 }}>
                <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted }}>Wallet Balance</span>
                <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: userBalance >= (selectedContest.entry_fee_cents ?? 0) ? C.green : C.red }}>
                  ${(userBalance / 100).toFixed(2)}
                </span>
              </div>

              {enterError && (
                <div style={{ padding: '8px 12px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.red, marginBottom: 12 }}>
                  ⚠️ {enterError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowDetailModal(false)}
                  style={{ flex: 1, padding: '12px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, color: C.sub }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleEnterContest(selectedContest)}
                  disabled={entering || !teamName.trim()}
                  style={{ flex: 2, padding: '12px', background: !entering && teamName.trim() ? C.gold : C.surf3, border: 'none', borderRadius: 8, cursor: !entering && teamName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: !entering && teamName.trim() ? C.bg : C.muted, textTransform: 'uppercase' as const }}
                >
                  {entering ? 'Entering...' :
                   selectedContest.entry_fee_cents === 0 ? 'Enter Free' :
                   `Pay $${(selectedContest.entry_fee_cents / 100).toFixed(2)} & Enter`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
