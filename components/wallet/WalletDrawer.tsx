'use client'
import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#f5a623', text: '#e4edf7', sub: '#7a90aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a',
}

interface WalletDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export default function WalletDrawer({ isOpen, onClose }: WalletDrawerProps) {
  const [tab, setTab] = useState<'overview' | 'deposit'>('overview')
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [depositAmount, setDepositAmount] = useState(1000)
  const [customAmount, setCustomAmount] = useState('')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [depositSuccess, setDepositSuccess] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    fetchWallet()
  }, [isOpen])

  async function fetchWallet() {
    setLoading(true)
    const res = await fetch('/api/wallet')
    const data = await res.json()
    if (res.ok) {
      setBalance(data.wallet?.available ?? 0)
      setTransactions(data.transactions ?? [])
    }
    setLoading(false)
  }

  async function handleStartDeposit() {
    const amount = customAmount ? Math.round(parseFloat(customAmount) * 100) : depositAmount
    if (amount < 500) return
    const res = await fetch('/api/wallet/deposit/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents: amount }),
    })
    const data = await res.json()
    if (res.ok && data.clientSecret) setClientSecret(data.clientSecret)
  }

  const AMOUNTS = [1000, 2500, 5000, 10000]

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)' }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9999,
        width: '100%', maxWidth: 420,
        background: C.surf, borderLeft: `1px solid ${C.surf3}`,
        display: 'flex', flexDirection: 'column' as const,
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
        animation: 'slideInRight 0.25s ease',
      }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.surf3}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 3, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>Your Wallet</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, color: C.gold, letterSpacing: 1 }}>
              {loading ? '—' : `$${(balance / 100).toFixed(2)}`}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 24, padding: 4, lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.surf3}`, flexShrink: 0 }}>
          {[
            { key: 'overview', label: 'History' },
            { key: 'deposit', label: 'Add Funds' },
          ].map(t => (
            <button key={t.key} onClick={() => { setTab(t.key as any); setClientSecret(null); setDepositSuccess(false) }}
              style={{ flex: 1, padding: '12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: tab === t.key ? C.gold : C.muted, borderBottom: `2px solid ${tab === t.key ? C.gold : 'transparent'}` }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12 }}>Loading…</div>
            ) : transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted }}>No transactions yet</div>
              </div>
            ) : (
              <div>
                {transactions.map(tx => {
                  const isCredit = ['deposit', 'refund', 'winnings', 'contest_settlement'].includes(tx.type)
                  const amount = Number(tx.amount_cents ?? 0)
                  return (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${C.surf3}` }}>
                      <div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.text, fontWeight: 600 }}>
                          {tx.description || tx.type}
                        </div>
                        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, marginTop: 2 }}>
                          {new Date(tx.created_at).toLocaleDateString()} · {tx.status}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: isCredit ? C.green : C.red }}>
                        {isCredit ? '+' : '−'}${(amount / 100).toFixed(2)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* DEPOSIT TAB */}
          {tab === 'deposit' && (
            depositSuccess ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.green, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Deposit Successful!</div>
                <button onClick={() => { setDepositSuccess(false); setClientSecret(null); fetchWallet(); setTab('overview') }}
                  style={{ padding: '12px 24px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.bg, marginTop: 16 }}>
                  View Balance
                </button>
              </div>
            ) : clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: C.gold } } }}>
                <StripePaymentForm
                  clientSecret={clientSecret}
                  onSuccess={() => { setDepositSuccess(true); fetchWallet() }}
                  onCancel={() => setClientSecret(null)}
                />
              </Elements>
            ) : (
              <div>
                <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.muted, marginBottom: 16 }}>
                  Funds available instantly. Secured by Stripe.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
                  {AMOUNTS.map(amt => (
                    <button key={amt} onClick={() => { setDepositAmount(amt); setCustomAmount('') }}
                      style={{ padding: '12px', border: `2px solid ${depositAmount === amt && !customAmount ? C.gold : C.surf3}`, borderRadius: 8, cursor: 'pointer', background: depositAmount === amt && !customAmount ? 'rgba(245,166,35,.1)' : C.surf2, fontFamily: 'Anton,sans-serif', fontSize: 16, color: depositAmount === amt && !customAmount ? C.gold : C.text }}>
                      ${(amt / 100).toFixed(0)}
                    </button>
                  ))}
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Custom Amount</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, borderRadius: 8, border: `1px solid ${customAmount ? C.gold : C.surf3}`, overflow: 'hidden' }}>
                    <span style={{ padding: '0 12px', fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.muted }}>$</span>
                    <input type="number" min={5} placeholder="5.00" value={customAmount}
                      onChange={e => setCustomAmount(e.target.value)}
                      style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, padding: '12px 0' }} />
                  </div>
                </div>
                <button onClick={handleStartDeposit}
                  disabled={(customAmount ? parseFloat(customAmount) * 100 : depositAmount) < 500}
                  style={{ width: '100%', padding: '14px', background: C.gold, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 2, color: C.bg, fontWeight: 700, textTransform: 'uppercase' as const }}>
                  DEPOSIT ${customAmount ? parseFloat(customAmount || '0').toFixed(2) : (depositAmount / 100).toFixed(2)}
                </button>
              </div>
            )
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}

function StripePaymentForm({ clientSecret, onSuccess, onCancel }: { clientSecret: string; onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  async function handlePay() {
    if (!stripe || !elements) return
    setPaying(true)
    setError('')
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })
    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed')
      setPaying(false)
    } else {
      onSuccess()
    }
  }

  return (
    <div>
      <PaymentElement />
      {error && <div style={{ color: '#f03a5a', fontFamily: 'Oswald,sans-serif', fontSize: 11, marginTop: 8 }}>{error}</div>}
      <button onClick={handlePay} disabled={paying || !stripe}
        style={{ width: '100%', padding: '14px', background: '#f5a623', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: '#070a12', marginTop: 16, textTransform: 'uppercase' as const }}>
        {paying ? 'Processing…' : 'Pay Now'}
      </button>
      <button onClick={onCancel}
        style={{ width: '100%', padding: '12px', background: 'none', border: '1px solid #1e2d47', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa', marginTop: 8, textTransform: 'uppercase' as const }}>
        ← Back
      </button>
    </div>
  )
}
