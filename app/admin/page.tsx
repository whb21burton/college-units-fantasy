'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-browser'

const ADMIN_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID

const C = {
  bg:    '#070a12',
  surf:  '#0c1422',
  surf2: '#111827',
  surf3: '#1e2d40',
  gold:  '#f5a623',
  green: '#15c678',
  red:   '#f03a5a',
  text:  '#e8eaf0',
  sub:   '#6b7a99',
  muted: '#3a4a66',
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'pending' || status === 'processing' ? C.gold
    : status === 'succeeded' || status === 'completed' ? C.green
    : C.red
  const bg = status === 'pending' || status === 'processing' ? 'rgba(245,166,35,.12)'
    : status === 'succeeded' || status === 'completed' ? 'rgba(21,198,120,.12)'
    : 'rgba(240,58,90,.12)'
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 11, color, background: bg, padding: '2px 8px', borderRadius: 4, letterSpacing: 0.5 }}>
      {status.toUpperCase()}
    </span>
  )
}

type Modal =
  | { type: 'approve'; withdrawal: any }
  | { type: 'reject';  withdrawal: any }
  | null

export default function AdminPage() {
  const router = useRouter()
  const [userId,      setUserId]      = useState<string | null>(null)
  const [tab,         setTab]         = useState<'withdrawals' | 'deposits' | 'users'>('withdrawals')
  const [stats,       setStats]       = useState<any>(null)
  const [withdrawals, setWithdrawals] = useState<any[]>([])
  const [deposits,    setDeposits]    = useState<any[]>([])
  const [users,       setUsers]       = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState<Modal>(null)
  const [rejectReason,setRejectReason]= useState('')
  const [toast,       setToast]       = useState('')
  const [acting,      setActing]      = useState(false)

  // Auth guard
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || user.id !== ADMIN_ID) { router.replace('/'); return }
      setUserId(user.id)
    })
  }, [router])

  // Load data
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    Promise.all([
      fetch('/api/admin/stats').then(r => r.json()),
      fetch('/api/admin/withdrawals').then(r => r.json()),
      fetch('/api/admin/deposits').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
    ]).then(([s, w, d, u]) => {
      setStats(s)
      setWithdrawals(w.withdrawals ?? [])
      setDeposits(d.deposits ?? [])
      setUsers(u.users ?? [])
      setLoading(false)
    })
  }, [userId])

  async function doAction(withdrawalId: string, action: 'approve' | 'reject', reason?: string) {
    setActing(true)
    const res = await fetch(`/api/admin/withdrawals/${withdrawalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    const json = await res.json()
    setActing(false)
    setModal(null)
    setRejectReason('')
    if (res.ok) {
      showToast(action === 'approve' ? 'Withdrawal approved' : 'Withdrawal rejected')
      // Reload withdrawals
      fetch('/api/admin/withdrawals').then(r => r.json()).then(d => setWithdrawals(d.withdrawals ?? []))
    } else {
      showToast(`Error: ${json.error}`)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '10px 12px', fontFamily: 'Oswald,sans-serif',
    fontSize: 10, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase',
    borderBottom: `1px solid ${C.surf3}`, fontWeight: 400,
  }
  const tdStyle: React.CSSProperties = {
    padding: '12px', fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text,
    borderBottom: `1px solid ${C.surf3}`,
  }

  if (!userId) return null
  if (loading) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 14 }}>
      Loading admin dashboard…
    </div>
  )

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '32px 40px', fontFamily: 'Oswald,sans-serif' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: C.surf2, border: `1px solid ${C.gold}`, borderRadius: 8, padding: '12px 20px', fontSize: 13, color: C.gold, zIndex: 9999 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, letterSpacing: 3, color: C.gold, marginBottom: 4 }}>
          Admin Dashboard
        </div>
        <div style={{ fontSize: 11, color: C.sub, letterSpacing: 1 }}>College Units Fantasy — Internal</div>
      </div>

      {/* Stat cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Total Users',          value: stats.total_users?.toLocaleString() ?? '—' },
            { label: 'Total Deposits',        value: dollars(stats.total_deposits_cents ?? 0) },
            { label: 'Pending Withdrawals',   value: dollars(stats.pending_withdrawals_cents ?? 0) },
            { label: 'Platform Rake',         value: dollars(stats.platform_rake_cents ?? 0) },
          ].map(card => (
            <div key={card.label} style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 26, color: C.gold, lineHeight: 1, marginBottom: 6 }}>{card.value}</div>
              <div style={{ fontSize: 10, color: C.sub, letterSpacing: 1.5, textTransform: 'uppercase' }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: `1px solid ${C.surf3}`, paddingBottom: 0 }}>
        {(['withdrawals', 'deposits', 'users'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase',
            color: tab === t ? C.gold : C.sub,
            borderBottom: tab === t ? `2px solid ${C.gold}` : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t}
            {t === 'withdrawals' && withdrawals.filter(w => w.status === 'pending').length > 0 && (
              <span style={{ marginLeft: 6, background: C.red, color: '#fff', borderRadius: '50%', fontSize: 10, padding: '1px 5px' }}>
                {withdrawals.filter(w => w.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* WITHDRAWALS TAB */}
      {tab === 'withdrawals' && (
        <div style={{ background: C.surf, borderRadius: 12, border: `1px solid ${C.surf3}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['User', 'Amount', 'Balance', 'Requested', 'Status', 'Actions'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 && (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 40 }}>No withdrawals yet</td></tr>
              )}
              {withdrawals.map((w: any) => {
                const isRecent = w.created_at && (Date.now() - new Date(w.created_at).getTime()) < 86400000
                return (
                  <tr key={w.id} style={{ background: isRecent && w.status === 'pending' ? 'rgba(240,58,90,.04)' : 'transparent' }}>
                    <td style={tdStyle}>{w.email}</td>
                    <td style={{ ...tdStyle, color: C.gold }}>{dollars(w.amount_cents)}</td>
                    <td style={{ ...tdStyle, color: C.sub }}>{dollars(w.available_cents ?? 0)}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: C.sub }}>{w.created_at ? new Date(w.created_at).toLocaleDateString() : '—'}</td>
                    <td style={tdStyle}><StatusBadge status={w.status} /></td>
                    <td style={tdStyle}>
                      {w.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setModal({ type: 'approve', withdrawal: w })}
                            style={{ padding: '5px 12px', background: 'rgba(21,198,120,.12)', border: `1px solid rgba(21,198,120,.4)`, borderRadius: 6, cursor: 'pointer', color: C.green, fontSize: 12, fontFamily: 'Oswald,sans-serif' }}>
                            Approve
                          </button>
                          <button onClick={() => { setModal({ type: 'reject', withdrawal: w }); setRejectReason('') }}
                            style={{ padding: '5px 12px', background: 'rgba(240,58,90,.08)', border: `1px solid rgba(240,58,90,.3)`, borderRadius: 6, cursor: 'pointer', color: C.red, fontSize: 12, fontFamily: 'Oswald,sans-serif' }}>
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DEPOSITS TAB */}
      {tab === 'deposits' && (
        <div style={{ background: C.surf, borderRadius: 12, border: `1px solid ${C.surf3}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['User', 'Amount', 'Status', 'Date'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deposits.length === 0 && (
                <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 40 }}>No deposits yet</td></tr>
              )}
              {deposits.map((d: any) => (
                <tr key={d.id}>
                  <td style={tdStyle}>{d.email}</td>
                  <td style={{ ...tdStyle, color: C.gold }}>{dollars(d.amount_cents)}</td>
                  <td style={tdStyle}><StatusBadge status={d.status} /></td>
                  <td style={{ ...tdStyle, fontSize: 11, color: C.sub }}>{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* USERS TAB */}
      {tab === 'users' && (
        <div style={{ background: C.surf, borderRadius: 12, border: `1px solid ${C.surf3}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Email', 'Balance', 'Deposited', 'Withdrawn', 'Joined'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: 40 }}>No users yet</td></tr>
              )}
              {users.map((u: any) => (
                <tr key={u.user_id}>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={{ ...tdStyle, color: C.gold }}>{dollars(u.available_cents)}</td>
                  <td style={{ ...tdStyle, color: C.green }}>{dollars(u.total_deposited_cents)}</td>
                  <td style={{ ...tdStyle, color: C.sub }}>{dollars(u.total_withdrawn_cents)}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: C.sub }}>{u.joined ? new Date(u.joined).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 16, padding: 32, width: 400, maxWidth: '90vw' }}>
            {modal.type === 'approve' && (
              <>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, color: C.green, marginBottom: 12 }}>Confirm Approval</div>
                <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>{modal.withdrawal.email}</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, color: C.gold, marginBottom: 24 }}>{dollars(modal.withdrawal.amount_cents)}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setModal(null)} style={{ flex: 1, padding: '11px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 13 }}>Cancel</button>
                  <button onClick={() => doAction(modal.withdrawal.id, 'approve')} disabled={acting}
                    style={{ flex: 1, padding: '11px', background: 'rgba(21,198,120,.15)', border: `1px solid rgba(21,198,120,.5)`, borderRadius: 8, cursor: acting ? 'wait' : 'pointer', color: C.green, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
                    {acting ? 'Processing…' : 'Confirm Approve'}
                  </button>
                </div>
              </>
            )}
            {modal.type === 'reject' && (
              <>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, letterSpacing: 2, color: C.red, marginBottom: 12 }}>Reject Withdrawal</div>
                <div style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>{modal.withdrawal.email}</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 24, color: C.gold, marginBottom: 16 }}>{dollars(modal.withdrawal.amount_cents)}</div>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (optional)"
                  rows={3}
                  style={{ width: '100%', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontFamily: 'Oswald,sans-serif', fontSize: 12, resize: 'vertical', marginBottom: 16, boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setModal(null)} style={{ flex: 1, padding: '11px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', color: C.sub, fontFamily: 'Oswald,sans-serif', fontSize: 13 }}>Cancel</button>
                  <button onClick={() => doAction(modal.withdrawal.id, 'reject', rejectReason)} disabled={acting}
                    style={{ flex: 1, padding: '11px', background: 'rgba(240,58,90,.12)', border: `1px solid rgba(240,58,90,.4)`, borderRadius: 8, cursor: acting ? 'wait' : 'pointer', color: C.red, fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 1 }}>
                    {acting ? 'Processing…' : 'Confirm Reject'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
