// v2 — deposit route updated to /api/wallet/deposit/create
'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const stripeAppearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary:     '#f5a623',
    colorBackground:  '#0c1422',
    colorText:        '#e4edf7',
    colorDanger:      '#f03a5a',
    fontFamily:       'Space Grotesk, sans-serif',
    borderRadius:     '8px',
  },
};

const C = {
  bg:        '#05080f',
  surf:      '#0c1220',
  surf2:     '#131d30',
  surf3:     '#1e2d47',
  gold:      '#d4a828',
  goldLight: '#f0c94a',
  muted:     '#4a5d7a',
  text:      '#e8edf5',
  sub:       '#7a90b0',
  green:     '#2ecc71',
  red:       '#e74c3c',
};

const QUICK_AMOUNTS = [
  { label: '$10',  cents: 1000  },
  { label: '$25',  cents: 2500  },
  { label: '$50',  cents: 5000  },
  { label: '$100', cents: 10000 },
  { label: '$250', cents: 25000 },
];

const TX_LABELS: Record<string, string> = {
  deposit:        'Deposit',
  contest_entry:  'League Entry',
  contest_refund: 'Refund',
  winnings:       'Prize Winnings',
  withdrawal:     'Withdrawal',
};

const TX_COLORS: Record<string, string> = {
  deposit:        C.green,
  contest_entry:  C.red,
  contest_refund: C.green,
  winnings:       C.gold,
  withdrawal:     C.red,
};

const TX_ICONS: Record<string, string> = {
  deposit:             '💰',
  contest_settlement:  '🏆',
  contest_entry:       '🎮',
  withdrawal:          '🏦',
  contest_refund:      '💰',
  winnings:            '🏆',
};

type Wallet      = { balance: number; lifetime_deposited: number; lifetime_withdrawn: number };
type Transaction = { id: string; type: string; amount: number; amount_cents?: number; balance_after: number; status: string; description: string | null; created_at: string };

function fmt(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 16, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,.6)', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

/* ── Stripe payment form (must be inside <Elements>) ── */
function PaymentForm({
  amountCents,
  onSuccess,
  onCancel,
}: {
  amountCents: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [paying, setPaying]   = useState(false);
  const [payErr, setPayErr]   = useState<string | null>(null);

  async function handlePay() {
    if (!stripe || !elements) return;
    setPaying(true);
    setPayErr(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/wallet?payment_intent_result=success`,
      },
    });
    // confirmPayment only returns here on error (otherwise it redirects)
    setPayErr(error?.message ?? 'Payment failed');
    setPaying(false);
  }

  return (
    <div style={{ padding: '0 24px 24px' }}>
      {payErr && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: `${C.red}18`, border: `1px solid ${C.red}44`, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.red }}>
          {payErr}
        </div>
      )}
      <PaymentElement options={{ layout: 'tabs' }} />
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: '13px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 10, cursor: 'pointer', fontFamily: "'Oswald',sans-serif", fontSize: 12, letterSpacing: 1, color: C.sub }}
        >
          BACK
        </button>
        <button
          onClick={handlePay}
          disabled={paying || !stripe}
          style={{ flex: 2, padding: '13px', background: paying ? C.surf3 : `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 10, cursor: paying ? 'wait' : 'pointer', fontFamily: "'Anton',sans-serif", fontSize: 15, letterSpacing: 2, color: paying ? C.muted : C.bg, transition: 'all .15s' }}
        >
          {paying ? 'PROCESSING…' : `PAY ${fmt(amountCents)}`}
        </button>
      </div>
      <div style={{ marginTop: 10, textAlign: 'center', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted }}>Secured by Stripe · SSL encrypted</div>
    </div>
  );
}

function WalletInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const connectResult         = searchParams.get('connect');
  const paymentIntentResult   = searchParams.get('payment_intent_result');
  // Legacy Stripe Checkout result param
  const depositResult         = searchParams.get('deposit');

  const [wallet,        setWallet]        = useState<Wallet | null>(null);
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [onboarded,     setOnboarded]     = useState(false);
  const [modal,         setModal]         = useState<'deposit' | 'withdraw' | null>(null);
  const [toast,         setToast]         = useState<string | null>(null);
  const [error,         setError]         = useState<string | null>(null);

  // Deposit state
  const [selCents,      setSelCents]      = useState(2500);
  const [customDollars, setCustomDollars] = useState('');
  const [depositing,    setDepositing]    = useState(false);
  // Stripe Elements state
  const [clientSecret,  setClientSecret]  = useState<string | null>(null);
  const [depositCentsForStripe, setDepositCentsForStripe] = useState(0);

  // Withdraw state
  const [withdrawAmt,   setWithdrawAmt]   = useState('');
  const [withdrawing,   setWithdrawing]   = useState(false);
  const [withdrawDone,  setWithdrawDone]  = useState(false);
  const [connecting,    setConnecting]    = useState(false);

  const showToast = (msg: string, ms = 5000) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  const loadWallet = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/wallet');
      const data = await res.json();
      if (res.ok) { setWallet(data.wallet); setTransactions(data.transactions ?? []); }
    } finally {
      setLoading(false);
    }
  }, []);

  const checkOnboarded = useCallback(async () => {
    const res = await fetch('/api/wallet/connect/status');
    if (res.ok) {
      const data = await res.json();
      setOnboarded(data.onboarded ?? false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!u) { router.push('/'); return; }
      loadWallet();
      checkOnboarded();
    });
  }, [loadWallet, checkOnboarded, router]);

  // Handle return from Stripe (redirect back after confirmPayment)
  useEffect(() => {
    if (paymentIntentResult === 'success') {
      loadWallet();
      showToast('Deposit successful! Funds are in your wallet.');
    } else if (depositResult === 'success') {
      loadWallet();
      showToast('Deposit successful! Funds are in your wallet.');
    } else if (depositResult === 'cancelled') {
      showToast('Deposit cancelled.', 3000);
    } else if (connectResult === 'success') {
      checkOnboarded();
      showToast('Bank account connected! You can now withdraw winnings.');
    }
  }, [paymentIntentResult, depositResult, connectResult, loadWallet, checkOnboarded]);

  const depositCents = customDollars
    ? Math.round(parseFloat(customDollars) * 100)
    : selCents;

  async function handleAddFunds() {
    if (depositCents < 500) { setError('Minimum deposit is $5'); return; }
    if (depositCents > 50000) { setError('Maximum deposit is $500'); return; }
    setError(null);
    setDepositing(true);
    try {
      const res  = await fetch('/api/wallet/deposit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: depositCents }),
      });
      const data = await res.json();
      if (!res.ok || !data.clientSecret) {
        setError(data.error ?? 'Failed to create deposit');
        return;
      }
      setClientSecret(data.clientSecret);
      setDepositCentsForStripe(depositCents);
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setDepositing(false);
    }
  }

  function handleDepositModalClose() {
    setModal(null);
    setError(null);
    setClientSecret(null);
    setCustomDollars('');
    setSelCents(2500);
  }

  async function handleWithdraw() {
    const cents = Math.round(parseFloat(withdrawAmt) * 100);
    if (!cents || cents < 1000) { setError('Minimum withdrawal is $10'); return; }
    setError(null);
    setWithdrawing(true);
    try {
      const res  = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: cents }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresOnboarding) { setError('Connect your bank account first.'); }
        else { setError(data.error ?? 'Withdrawal failed'); }
        return;
      }
      setWithdrawAmt('');
      setWithdrawDone(true);
      await loadWallet();
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleConnectOnboard() {
    setConnecting(true);
    setError(null);
    try {
      const res  = await fetch('/api/wallet/connect/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok || !data.url) { setError(data.error ?? 'Onboarding failed'); return; }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setConnecting(false);
    }
  }

  const bal = wallet?.balance ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <style>{`* { box-sizing: border-box; } input:focus { outline: none; border-color: ${C.gold} !important; }`}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: C.surf, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '12px 24px', zIndex: 9999, fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.text, boxShadow: '0 8px 32px rgba(0,0,0,.5)', maxWidth: 400, textAlign: 'center', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 20px' }}>

        {/* Back */}
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, marginBottom: 24, padding: 0 }}>
          ← Back to Dashboard
        </button>

        {/* Balance hero */}
        <div style={{ background: 'linear-gradient(135deg,#0e1f35,#0b1624)', border: `1px solid ${C.surf3}`, borderRadius: 20, padding: '32px 28px', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight}, transparent)` }} />
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 10, letterSpacing: 3, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
            Available Balance
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 24 }}>
            <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 56, color: C.gold, letterSpacing: 1, lineHeight: 1 }}>
              {loading ? '—' : fmt(bal)}
            </div>
            <button onClick={loadWallet} title="Refresh" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, padding: '0 0 6px 0' }}>⟳</button>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => { setModal('deposit'); setError(null); setClientSecret(null); }}
              style={{ flex: 1, padding: '14px', background: `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: "'Anton',sans-serif", fontSize: 14, letterSpacing: 2, color: C.bg, textTransform: 'uppercase' }}
            >
              + Add Funds
            </button>
            <button
              onClick={() => { setModal('withdraw'); setError(null); setWithdrawAmt(''); setWithdrawDone(false); }}
              style={{ flex: 1, padding: '14px', background: 'rgba(46,204,113,.12)', border: `1px solid rgba(46,204,113,.3)`, borderRadius: 10, cursor: 'pointer', fontFamily: "'Anton',sans-serif", fontSize: 14, letterSpacing: 2, color: C.green, textTransform: 'uppercase' }}
            >
              Withdraw
            </button>
          </div>

          {/* Stats row */}
          {!loading && wallet && (
            <div style={{ display: 'flex', gap: 24, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.surf3}` }}>
              {[
                ['Total Deposited', fmt(wallet.lifetime_deposited)],
                ['Total Withdrawn', fmt(wallet.lifetime_withdrawn)],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 16, color: C.sub }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transaction history */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' }}>
            Transaction History
          </div>
          <button onClick={loadWallet} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontFamily: "'Oswald',sans-serif", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
            Refresh
          </button>
        </div>

        <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontFamily: "'Oswald',sans-serif", letterSpacing: 2, fontSize: 12 }}>Loading…</div>
          ) : transactions.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💳</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: C.sub, fontWeight: 600, marginBottom: 6 }}>No transactions yet</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.muted }}>Add funds to get started</div>
            </div>
          ) : (
            <div>
              {transactions.slice(0, 20).map((tx, i) => {
                const isCredit = ['deposit', 'contest_refund', 'winnings'].includes(tx.type);
                const col      = TX_COLORS[tx.type] ?? C.muted;
                const icon     = TX_ICONS[tx.type] ?? '💳';
                const amtCents = tx.amount_cents ?? tx.amount ?? 0;
                return (
                  <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < Math.min(transactions.length, 20) - 1 ? `1px solid ${C.surf3}` : 'none' }}>
                    <div style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>{icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.description || TX_LABELS[tx.type] || tx.type}
                      </div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {new Date(tx.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 15, color: col }}>
                        {isCredit ? '+' : '−'}{fmt(amtCents)}
                      </div>
                      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 9, letterSpacing: 1, color: tx.status === 'completed' ? C.green : tx.status === 'failed' ? C.red : C.muted, textTransform: 'uppercase', marginTop: 2 }}>
                        {tx.status}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 20, textAlign: 'center', fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.muted }}>
          Payments secured by Stripe · College Units Fantasy 2026
        </div>
      </div>

      {/* ── DEPOSIT MODAL ── */}
      {modal === 'deposit' && (
        <Modal onClose={handleDepositModalClose}>
          <div style={{ background: 'linear-gradient(135deg,#0e1f35,#0b1624)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 18, letterSpacing: 1, color: C.gold, textTransform: 'uppercase' }}>
              {clientSecret ? `Pay ${fmt(depositCentsForStripe)}` : 'Add Funds'}
            </div>
            <button onClick={handleDepositModalClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>

          {/* Amount selector — shown before Stripe Elements */}
          {!clientSecret && (
            <div style={{ padding: 24 }}>
              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: `${C.red}18`, border: `1px solid ${C.red}44`, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.red }}>
                  {error}
                </div>
              )}

              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>Select Amount</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}>
                {QUICK_AMOUNTS.map(({ label, cents }) => (
                  <button
                    key={cents}
                    onClick={() => { setSelCents(cents); setCustomDollars(''); }}
                    style={{ padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontFamily: "'Anton',sans-serif", fontSize: 14, background: !customDollars && selCents === cents ? C.gold : C.surf2, border: `1px solid ${!customDollars && selCents === cents ? C.gold : C.surf3}`, color: !customDollars && selCents === cents ? C.bg : C.text, transition: 'all .15s' }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Custom Amount</div>
                <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, borderRadius: 8, border: `1px solid ${customDollars ? C.gold : C.surf3}`, overflow: 'hidden', transition: 'border-color .15s' }}>
                  <span style={{ padding: '0 12px', fontFamily: "'Anton',sans-serif", fontSize: 18, color: C.muted }}>$</span>
                  <input
                    type="number"
                    min={5}
                    max={500}
                    placeholder="5.00"
                    value={customDollars}
                    onChange={e => setCustomDollars(e.target.value)}
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: "'Anton',sans-serif", fontSize: 22, color: C.text, padding: '12px 0' }}
                  />
                </div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.muted, marginTop: 4 }}>Min $5 · Max $500</div>
              </div>

              <button
                onClick={handleAddFunds}
                disabled={depositing || depositCents < 500 || depositCents > 50000}
                style={{ width: '100%', padding: '15px', background: depositing || depositCents < 500 ? C.surf3 : `linear-gradient(135deg,${C.gold},${C.goldLight})`, border: 'none', borderRadius: 10, cursor: depositing ? 'wait' : 'pointer', fontFamily: "'Anton',sans-serif", fontSize: 15, letterSpacing: 2, color: depositing || depositCents < 500 ? C.muted : C.bg, transition: 'all .15s' }}
              >
                {depositing ? 'LOADING…' : `ADD FUNDS ${fmt(depositCents)}`}
              </button>
              <div style={{ marginTop: 10, textAlign: 'center', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted }}>Funds available instantly. Secured by Stripe.</div>
            </div>
          )}

          {/* Stripe Elements — shown after clientSecret received */}
          {clientSecret && (
            <div style={{ padding: '24px 24px 0' }}>
              <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: 'rgba(212,168,40,.08)', border: `1px solid rgba(212,168,40,.2)`, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub }}>
                Depositing <strong style={{ color: C.gold }}>{fmt(depositCentsForStripe)}</strong> to your wallet
              </div>
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance: stripeAppearance }}
              >
                <PaymentForm
                  amountCents={depositCentsForStripe}
                  onSuccess={() => {
                    handleDepositModalClose();
                    loadWallet();
                    showToast('Deposit successful! Funds are in your wallet.');
                  }}
                  onCancel={() => setClientSecret(null)}
                />
              </Elements>
            </div>
          )}
        </Modal>
      )}

      {/* ── WITHDRAW MODAL ── */}
      {modal === 'withdraw' && (
        <Modal onClose={() => { setModal(null); setError(null); setWithdrawDone(false); }}>
          <div style={{ background: 'linear-gradient(135deg,#0e1f35,#0b1624)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 18, letterSpacing: 1, color: C.green, textTransform: 'uppercase' }}>Withdraw</div>
            <button onClick={() => { setModal(null); setError(null); setWithdrawDone(false); }} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>
          <div style={{ padding: 24 }}>

            {/* Success state */}
            {withdrawDone ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 20, color: C.green, letterSpacing: 1, marginBottom: 8 }}>Withdrawal Requested</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 20 }}>
                  Withdrawal requested — pending review.<br />Withdrawals are reviewed within 24 hours.
                </div>
                <button onClick={() => { setModal(null); setWithdrawDone(false); }} style={{ padding: '12px 32px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: "'Oswald',sans-serif", fontSize: 12, letterSpacing: 1, color: C.sub }}>
                  CLOSE
                </button>
              </div>
            ) : (
              <>
                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: `${C.red}18`, border: `1px solid ${C.red}44`, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.red }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, marginBottom: 20 }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.muted }}>Available</span>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 20, color: C.green }}>{fmt(bal)}</span>
                </div>

                {onboarded ? (
                  <>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Amount to Withdraw</div>
                      <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, borderRadius: 8, border: `1px solid ${C.surf3}`, overflow: 'hidden' }}>
                        <span style={{ padding: '0 12px', fontFamily: "'Anton',sans-serif", fontSize: 18, color: C.muted }}>$</span>
                        <input type="number" min={10} max={bal / 100} value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} placeholder="10.00" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: "'Anton',sans-serif", fontSize: 22, color: C.text, padding: '12px 0' }} />
                        <button onClick={() => setWithdrawAmt((bal / 100).toFixed(2))} style={{ padding: '0 12px', background: 'none', border: 'none', fontFamily: "'Oswald',sans-serif", fontSize: 9, letterSpacing: 1, color: C.gold, cursor: 'pointer', textTransform: 'uppercase' }}>MAX</button>
                      </div>
                    </div>
                    <button
                      onClick={handleWithdraw}
                      disabled={withdrawing || !withdrawAmt || bal === 0}
                      style={{ width: '100%', padding: '15px', background: withdrawing ? C.surf3 : C.green, border: 'none', borderRadius: 10, cursor: withdrawing ? 'wait' : 'pointer', fontFamily: "'Anton',sans-serif", fontSize: 15, letterSpacing: 2, color: C.bg, transition: 'all .15s' }}
                    >
                      {withdrawing ? 'PROCESSING…' : 'REQUEST WITHDRAWAL'}
                    </button>
                    <div style={{ marginTop: 10, textAlign: 'center', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted }}>
                      Withdrawals are reviewed within 24 hours.
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '16px', background: 'rgba(212,168,40,.07)', border: `1px solid rgba(212,168,40,.2)`, borderRadius: 10 }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.sub, marginBottom: 14, lineHeight: 1.5 }}>
                      Connect a bank account to withdraw your winnings via Stripe.
                    </div>
                    <button
                      onClick={handleConnectOnboard}
                      disabled={connecting}
                      style={{ width: '100%', padding: '13px', background: connecting ? C.surf3 : 'rgba(212,168,40,.15)', border: `1px solid ${C.gold}`, borderRadius: 8, cursor: 'pointer', fontFamily: "'Oswald',sans-serif", fontSize: 12, letterSpacing: 2, color: C.gold, textTransform: 'uppercase' }}
                    >
                      {connecting ? 'REDIRECTING…' : 'Connect Bank Account'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#05080f' }} />}>
      <WalletInner />
    </Suspense>
  );
}
