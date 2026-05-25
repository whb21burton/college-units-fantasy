'use client'
import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useWallet } from '@/context/WalletContext'

function calculateStripeFee(amountCents: number): number {
  return Math.ceil(amountCents * 0.029) + 30
}

function calculateTotal(amountCents: number): number {
  return amountCents + calculateStripeFee(amountCents)
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#f5a623', text: '#e4edf7', sub: '#7a90aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a', navy: '#0a1628',
}

interface WalletDrawerProps {
  isOpen: boolean
  onClose: () => void
}

type Tab = 'overview' | 'deposit' | 'withdraw'

export default function WalletDrawer({ isOpen, onClose }: WalletDrawerProps) {
  const { balance, pending: pendingBalance, refresh } = useWallet()
  const [tab, setTab] = useState<Tab>('overview')
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [depositAmount, setDepositAmount] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [depositSuccess, setDepositSuccess] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingCents, setPendingCents] = useState(0)

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setTab('overview')
        setClientSecret(null)
        setDepositSuccess(false)
        setDepositAmount(null)
        setCustomAmount('')
      }, 300)
      return
    }
    fetchTransactions()
  }, [isOpen, refreshKey])

  async function fetchTransactions() {
    setLoading(true)
    try {
      const res = await fetch('/api/wallet')
      const data = await res.json()
      if (res.ok) setTransactions(data.transactions ?? [])
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9999,
        width: '100%', maxWidth: 440,
        background: C.bg,
        borderLeft: `1px solid ${C.surf3}`,
        display: 'flex', flexDirection: 'column' as const,
        boxShadow: '-20px 0 60px rgba(0,0,0,0.6)',
        animation: 'walletSlideIn 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>

        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${C.surf} 0%, #0f1e35 100%)`,
          borderBottom: `1px solid ${C.surf3}`,
          padding: '20px 24px 0',
          flexShrink: 0,
        }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(245,166,35,.15)', border: `1px solid rgba(245,166,35,.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                💰
              </div>
              <div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 3, color: C.muted, textTransform: 'uppercase' }}>Your Wallet</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, color: C.gold, letterSpacing: 1, lineHeight: 1 }}>
                  {loading ? '—' : `$${(balance / 100).toFixed(2)}`}
                </div>
              </div>
            </div>
            <button onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: '50%', background: C.surf3, border: 'none', cursor: 'pointer', color: C.sub, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ✕
            </button>
          </div>

          {/* Balance cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'rgba(21,198,120,.06)', border: '1px solid rgba(21,198,120,.15)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.green, textTransform: 'uppercase', marginBottom: 3 }}>Available</div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.green }}>
                {loading ? '—' : `$${(balance / 100).toFixed(2)}`}
              </div>
            </div>
            <div style={{ background: 'rgba(245,166,35,.06)', border: '1px solid rgba(245,166,35,.15)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 8, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 3 }}>In Contests</div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.gold }}>
                {loading ? '—' : `$${(pendingBalance / 100).toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 2 }}>
            {([
              { key: 'overview', label: '📋 History' },
              { key: 'deposit',  label: '+ Add Funds' },
              { key: 'withdraw', label: '↑ Withdraw' },
            ] as { key: Tab; label: string }[]).map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setClientSecret(null); setDepositSuccess(false) }}
                style={{
                  flex: 1, padding: '10px 4px',
                  background: tab === t.key ? C.gold : 'none',
                  border: 'none',
                  borderRadius: '8px 8px 0 0',
                  cursor: 'pointer',
                  fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1,
                  color: tab === t.key ? C.bg : C.muted,
                  fontWeight: tab === t.key ? 700 : 400,
                  transition: 'all .15s',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── HISTORY TAB ── */}
          {tab === 'overview' && (
            loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>Loading…</div>
            ) : transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>💳</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.text, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>No Transactions Yet</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted }}>Add funds to get started</div>
                <button onClick={() => setTab('deposit')}
                  style={{ marginTop: 16, padding: '10px 24px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 2, color: C.bg, textTransform: 'uppercase' }}>
                  Add Funds →
                </button>
              </div>
            ) : (
              <div>
                {transactions.map((tx, i) => {
                  const isCredit = ['deposit', 'refund', 'contest_settlement', 'winnings'].includes(tx.type)
                  const amount = Number(tx.amount_cents ?? 0)
                  const typeLabels: Record<string, string> = {
                    deposit: 'Deposit',
                    withdrawal: 'Withdrawal',
                    contest_entry: 'Contest Entry',
                    contest_settlement: 'Contest Payout',
                    refund: 'Refund',
                    winnings: 'Winnings',
                    rake: 'Fee',
                  }
                  const typeIcons: Record<string, string> = {
                    deposit: '💳',
                    withdrawal: '↑',
                    contest_entry: '🎮',
                    contest_settlement: '🏆',
                    refund: '↩️',
                    winnings: '🏆',
                  }
                  return (
                    <div key={tx.id || i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 0',
                      borderBottom: `1px solid ${C.surf3}`,
                    }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: isCredit ? 'rgba(21,198,120,.1)' : 'rgba(240,58,90,.08)', border: `1px solid ${isCredit ? 'rgba(21,198,120,.2)' : 'rgba(240,58,90,.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                        {typeIcons[tx.type] ?? '💰'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 13, color: C.text, fontWeight: 600 }}>
                          {typeLabels[tx.type] ?? tx.type}
                        </div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 2 }}>
                          {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {tx.status === 'pending' && <span style={{ color: C.gold, marginLeft: 8 }}>● Pending</span>}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: isCredit ? C.green : C.red, flexShrink: 0 }}>
                        {isCredit ? '+' : '−'}${(amount / 100).toFixed(2)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ── DEPOSIT TAB ── */}
          {tab === 'deposit' && (
            depositSuccess ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(21,198,120,.15)', border: '2px solid rgba(21,198,120,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 20px' }}>
                  ✅
                </div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, color: C.green, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Deposit Successful!</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, marginBottom: 24 }}>Funds added to your wallet</div>
                <button onClick={() => { setDepositSuccess(false); setClientSecret(null); setDepositAmount(null); setCustomAmount(''); setRefreshKey(k => k + 1) }}
                  style={{ padding: '12px 28px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.bg }}>
                  Done
                </button>
              </div>
            ) : clientSecret ? (
              <Elements stripe={stripePromise} options={{
                clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: C.gold,
                    colorBackground: C.surf2,
                    colorText: C.text,
                    colorDanger: C.red,
                    fontFamily: 'Oswald, sans-serif',
                    borderRadius: '8px',
                    spacingUnit: '4px',
                  },
                  rules: {
                    '.Input': { border: `1px solid ${C.surf3}`, boxShadow: 'none' },
                    '.Input:focus': { border: `1px solid ${C.gold}`, boxShadow: 'none' },
                    '.Label': { fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em', fontSize: '10px', textTransform: 'uppercase' },
                    '.Tab': { border: `1px solid ${C.surf3}`, background: C.surf2 },
                    '.Tab--selected': { border: `1px solid ${C.gold}`, background: 'rgba(245,166,35,.08)' },
                    '.TabIcon--selected': { fill: C.gold },
                    '.TabLabel--selected': { color: C.gold },
                  }
                }
              }}>
                <StripePaymentForm
                  amountCents={pendingCents}
                  onSuccess={() => {
                    setDepositSuccess(true)
                    refresh()
                    setTimeout(refresh, 3000)
                    setTimeout(refresh, 8000)
                  }}
                  onBack={() => setClientSecret(null)}
                />
              </Elements>
            ) : (
              <div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' as const, marginBottom: 12 }}>
                  Select Amount
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
                  {[1000, 2500, 5000, 10000].map(cents => (
                    <button key={cents} onClick={() => { setDepositAmount(cents); setCustomAmount('') }}
                      style={{ padding: '16px', border: `2px solid ${depositAmount === cents && !customAmount ? C.gold : C.surf3}`, borderRadius: 10, cursor: 'pointer', background: depositAmount === cents && !customAmount ? 'rgba(245,166,35,.08)' : C.surf, fontFamily: 'Anton,sans-serif', fontSize: 24, color: depositAmount === cents && !customAmount ? C.gold : C.text }}>
                      ${(cents / 100)}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', background: C.surf, border: `2px solid ${customAmount ? C.gold : C.surf3}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                  <span style={{ padding: '0 16px', fontFamily: 'Anton,sans-serif', fontSize: 22, color: C.muted }}>$</span>
                  <input type="number" min={1} placeholder="Custom amount" value={customAmount}
                    onChange={e => { setCustomAmount(e.target.value); setDepositAmount(null) }}
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: 'Anton,sans-serif', fontSize: 24, color: C.text, padding: '14px 0' }} />
                </div>
                {(() => {
                  const depositCents = customAmount ? Math.round(parseFloat(customAmount || '0') * 100) : (depositAmount ?? 0)
                  return (
                    <>
                      {depositCents >= 100 && (
                        <div style={{ padding: '12px 14px', background: 'rgba(245,166,35,.06)', border: '1px solid rgba(245,166,35,.15)', borderRadius: 10, marginBottom: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>Wallet credit</span>
                            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.green }}>+${(depositCents / 100).toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>Stripe processing fee</span>
                            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 13, color: C.muted }}>+${(calculateStripeFee(depositCents) / 100).toFixed(2)}</span>
                          </div>
                          <div style={{ height: 1, background: C.surf3, marginBottom: 8 }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, fontWeight: 700 }}>Total charged to card</span>
                            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.gold }}>${(calculateTotal(depositCents) / 100).toFixed(2)}</span>
                          </div>
                          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, marginTop: 6 }}>
                            Your wallet will be credited ${(depositCents / 100).toFixed(2)}. The processing fee covers Stripe payment costs.
                          </div>
                        </div>
                      )}
                      <button onClick={async () => {
                        const cents = depositCents
                        if (cents < 100) return
                        setPendingCents(cents)
                        try {
                          const res = await fetch('/api/wallet/deposit/create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ amountCents: cents, chargeAmountCents: calculateTotal(cents) }),
                          })
                          const data = await res.json()
                          if (data.clientSecret) setClientSecret(data.clientSecret)
                          else alert(data.error ?? 'Failed')
                        } catch { alert('Network error') }
                      }}
                        style={{ width: '100%', padding: '16px', background: '#f5a623', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 2, color: '#070a12', textTransform: 'uppercase' as const }}>
                        {depositCents >= 100
                          ? `Pay $${(calculateTotal(depositCents) / 100).toFixed(2)} → Get $${(depositCents / 100).toFixed(2)}`
                          : 'Select Amount'}
                      </button>
                      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: C.muted, textAlign: 'center' as const, marginTop: 12 }}>
                        🔒 Secured by Stripe · Card accepted
                      </div>
                    </>
                  )
                })()}
              </div>
            )
          )}

          {/* ── WITHDRAW TAB ── */}
          {tab === 'withdraw' && (
            <WithdrawTab
              balance={balance}
              onSuccess={() => { refresh(); setRefreshKey(k => k + 1); setTab('overview') }}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes walletSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}

/* ── Stripe Payment Form ── */
function StripePaymentForm({ amountCents, onSuccess, onBack }: {
  amountCents: number; onSuccess: () => void; onBack: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  async function handlePay() {
    if (!stripe || !elements) return
    setPaying(true)
    setError('')
    const { error: submitError } = await elements.submit()
    if (submitError) { setError(submitError.message ?? 'Error'); setPaying(false); return }
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed')
      setPaying(false)
    } else {
      onSuccess()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7a90aa', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Back
        </button>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: '#f5a623', letterSpacing: 1 }}>
          ${(amountCents / 100).toFixed(2)}
        </div>
      </div>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div style={{ padding: '10px 12px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 8, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#f03a5a', marginTop: 12 }}>
          ⚠️ {error}
        </div>
      )}
      <button onClick={handlePay} disabled={paying || !stripe}
        style={{ width: '100%', padding: '16px', background: paying || !stripe ? '#1e2d47' : 'linear-gradient(135deg, #f5a623, #f0c94a)', border: 'none', borderRadius: 10, cursor: paying ? 'not-allowed' : 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 2, color: paying ? '#3e5470' : '#070a12', marginTop: 16, textTransform: 'uppercase' as const, boxShadow: paying ? 'none' : '0 4px 20px rgba(245,166,35,.3)', transition: 'all .15s' }}>
        {paying ? 'Processing…' : `Pay $${(amountCents / 100).toFixed(2)}`}
      </button>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#3e5470', textAlign: 'center' as const, marginTop: 10 }}>
        🔒 Secured by Stripe · Funds available instantly
      </div>
    </div>
  )
}

/* ── Withdraw Tab ── */
function WithdrawTab({ balance, onSuccess }: { balance: number; onSuccess: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'venmo' | 'paypal' | 'zelle' | 'cashapp'>('venmo')
  const [handle, setHandle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const amountCents = Math.round(parseFloat(amount || '0') * 100)
  const canWithdraw = amountCents >= 100 && amountCents <= balance && handle.trim().length > 0

  const METHODS = [
    { key: 'venmo',   label: 'Venmo',    icon: '🅿️', placeholder: '@username' },
    { key: 'paypal',  label: 'PayPal',   icon: '💙', placeholder: 'email or @username' },
    { key: 'zelle',   label: 'Zelle',    icon: '💜', placeholder: 'phone or email' },
    { key: 'cashapp', label: 'Cash App', icon: '💚', placeholder: '$cashtag' },
  ] as const

  const selectedMethod = METHODS.find(m => m.key === method)!

  async function handleWithdraw() {
    if (!canWithdraw) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/wallet/withdraw-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: amountCents, method, handle: handle.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess(`Request submitted! Ref: ${data.reference}. We'll send within 1-3 business days.`)
        setTimeout(onSuccess, 3000)
      } else {
        setError(data.error ?? 'Failed to submit')
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(21,198,120,.15)', border: '2px solid rgba(21,198,120,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 20px' }}>✅</div>
      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: '#15c678', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Request Submitted!</div>
      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa', lineHeight: 1.6 }}>{success}</div>
    </div>
  )

  return (
    <div>
      {/* Available balance */}
      <div style={{ padding: '14px 16px', background: `linear-gradient(135deg, rgba(21,198,120,.06) 0%, rgba(21,198,120,.02) 100%)`, border: '1px solid rgba(21,198,120,.15)', borderRadius: 10, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa' }}>Available to withdraw</span>
        <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: '#15c678' }}>${(balance / 100).toFixed(2)}</span>
      </div>

      {/* Amount */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: '#3e5470', textTransform: 'uppercase', marginBottom: 8 }}>Amount (min $5)</div>
        <div style={{ display: 'flex', alignItems: 'center', background: '#0c1422', border: `2px solid ${amountCents > balance && amountCents > 0 ? '#f03a5a' : amount ? '#f5a623' : '#1e2d47'}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .15s' }}>
          <span style={{ padding: '0 16px', fontFamily: 'Anton,sans-serif', fontSize: 22, color: amount ? '#f5a623' : '#3e5470' }}>$</span>
          <input type="number" min={5} step="1" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: 'Anton,sans-serif', fontSize: 24, color: '#e4edf7', padding: '14px 0' }} />
        </div>
        {amountCents > balance && amountCents > 0 && (
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: '#f03a5a', marginTop: 6 }}>Exceeds available balance</div>
        )}
      </div>

      {/* Quick amounts */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[100, 500, 1000, 2500].filter(c => c <= balance).map(cents => (
          <button key={cents} onClick={() => setAmount((cents / 100).toFixed(2))}
            style={{ flex: 1, padding: '8px 4px', border: '1px solid #1e2d47', borderRadius: 6, cursor: 'pointer', background: amountCents === cents ? 'rgba(245,166,35,.1)' : '#131d30', fontFamily: 'Anton,sans-serif', fontSize: 12, color: amountCents === cents ? '#f5a623' : '#7a90aa', transition: 'all .15s' }}>
            ${(cents / 100).toFixed(0)}
          </button>
        ))}
        {balance > 0 && (
          <button onClick={() => setAmount((balance / 100).toFixed(2))}
            style={{ flex: 1, padding: '8px 4px', border: '1px solid #1e2d47', borderRadius: 6, cursor: 'pointer', background: '#131d30', fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1, color: '#7a90aa' }}>
            MAX
          </button>
        )}
      </div>

      {/* Payment method */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: '#3e5470', textTransform: 'uppercase', marginBottom: 8 }}>Send Payment To</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {METHODS.map(m => (
            <button key={m.key} onClick={() => setMethod(m.key)}
              style={{ padding: '12px 8px', border: `2px solid ${method === m.key ? '#f5a623' : '#1e2d47'}`, borderRadius: 10, cursor: 'pointer', background: method === m.key ? 'rgba(245,166,35,.08)' : '#0c1422', display: 'flex', alignItems: 'center', gap: 8, transition: 'all .15s' }}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <span style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: method === m.key ? '#f5a623' : '#e4edf7' }}>{m.label}</span>
              {method === m.key && <span style={{ marginLeft: 'auto', color: '#f5a623', fontSize: 12 }}>✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Handle input */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: '#3e5470', textTransform: 'uppercase', marginBottom: 8 }}>
          Your {selectedMethod.label} {method === 'zelle' ? 'Phone/Email' : 'Handle'}
        </div>
        <input value={handle} onChange={e => setHandle(e.target.value)}
          placeholder={selectedMethod.placeholder}
          style={{ width: '100%', padding: '14px 16px', background: '#0c1422', border: `2px solid ${handle ? '#f5a623' : '#1e2d47'}`, borderRadius: 10, color: '#e4edf7', fontFamily: 'Oswald,sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color .15s' }} />
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 8, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#f03a5a', marginBottom: 14 }}>
          ⚠️ {error}
        </div>
      )}

      <button onClick={handleWithdraw} disabled={!canWithdraw || submitting}
        style={{ width: '100%', padding: '16px', background: canWithdraw && !submitting ? 'linear-gradient(135deg, #f5a623, #f0c94a)' : '#1e2d47', border: 'none', borderRadius: 10, cursor: canWithdraw && !submitting ? 'pointer' : 'not-allowed', fontFamily: 'Anton,sans-serif', fontSize: 16, letterSpacing: 2, color: canWithdraw && !submitting ? '#070a12' : '#3e5470', textTransform: 'uppercase' as const, boxShadow: canWithdraw && !submitting ? '0 4px 20px rgba(245,166,35,.3)' : 'none', transition: 'all .15s' }}>
        {submitting ? 'Submitting…' : canWithdraw ? `Withdraw $${parseFloat(amount).toFixed(2)}` : 'Enter Details Above'}
      </button>

      <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, color: '#3e5470', textAlign: 'center' as const, marginTop: 12, lineHeight: 1.8 }}>
        Withdrawals processed within 1-3 business days<br/>
        Minimum $1.00 · You'll receive a confirmation email
      </div>
    </div>
  )
}
