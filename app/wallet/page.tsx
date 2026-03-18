'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a',
  muted: '#4a5d7a', text: '#e8edf5', sub: '#7a90b0',
  green: '#2ecc71', red: '#e74c3c',
};

const QUICK_AMOUNTS = [
  { label: '$10',  cents: 1000  },
  { label: '$25',  cents: 2500  },
  { label: '$50',  cents: 5000  },
  { label: '$100', cents: 10000 },
  { label: '$250', cents: 25000 },
];

const TX_LABELS: Record<string, string> = {
  deposit:       'Deposit',
  contest_entry: 'League Entry',
  contest_refund:'Refund',
  winnings:      'Prize Winnings',
  withdrawal:    'Withdrawal',
};

const TX_COLORS: Record<string, string> = {
  deposit:        C.green,
  contest_entry:  C.red,
  contest_refund: C.green,
  winnings:       C.gold,
  withdrawal:     C.red,
};

type Wallet = {
  balance: number;
  lifetime_deposited: number;
  lifetime_withdrawn: number;
};

type Transaction = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  status: string;
  description: string | null;
  created_at: string;
};

function WalletInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const depositResult = searchParams.get('deposit');
  const connectResult = searchParams.get('connect');

  const [user,         setUser]         = useState<any>(null);
  const [wallet,       setWallet]       = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState<'history' | 'deposit' | 'withdraw'>(
    depositResult === 'success' ? 'history' : 'deposit'
  );
  const [selectedCents, setSelectedCents] = useState(2500);
  const [customDollars, setCustomDollars] = useState('');
  const [depositing,    setDepositing]    = useState(false);
  const [withdrawCents, setWithdrawCents] = useState('');
  const [withdrawing,   setWithdrawing]   = useState(false);
  const [toast,         setToast]         = useState<string | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [connecting,    setConnecting]    = useState(false);
  const [hasConnect,    setHasConnect]    = useState(false);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/wallet');
      const data = await res.json();
      if (res.ok) {
        setWallet(data.wallet);
        setTransactions(data.transactions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!u) { router.push('/'); return; }
      setUser(u);
      loadWallet();
      // Check if user has a Stripe connect account
      supabase
        .from('profiles')
        .select('stripe_connect_account_id')
        .eq('id', u.id)
        .single()
        .then(({ data }) => setHasConnect(!!data?.stripe_connect_account_id));
    });
  }, [loadWallet, router]);

  useEffect(() => {
    if (depositResult === 'success') {
      setToast('Deposit successful! Funds are now in your wallet.');
      setTimeout(() => setToast(null), 5000);
    } else if (depositResult === 'cancelled') {
      setToast('Deposit cancelled.');
      setTimeout(() => setToast(null), 3000);
    } else if (connectResult === 'success') {
      setToast('Bank account connected! You can now withdraw winnings.');
      setHasConnect(true);
      setTimeout(() => setToast(null), 5000);
    }
  }, [depositResult, connectResult]);

  const depositAmountCents = customDollars
    ? Math.round(parseFloat(customDollars) * 100)
    : selectedCents;

  async function handleDeposit() {
    if (depositAmountCents < 1000) { setError('Minimum deposit is $10'); return; }
    setError(null);
    setDepositing(true);
    try {
      const res  = await fetch('/api/wallet/deposit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount_cents: depositAmountCents }),
      });
      let data: any = {};
      try { data = await res.json(); } catch {}
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to start checkout. Check Stripe setup.');
        return;
      }
      window.location.href = data.url;
    } catch (err: any) {
      setError(err?.message ?? 'Network error');
    } finally {
      setDepositing(false);
    }
  }

  async function handleWithdraw() {
    const cents = Math.round(parseFloat(withdrawCents) * 100);
    if (!cents || cents < 1000) { setError('Minimum withdrawal is $10'); return; }
    setError(null);
    setWithdrawing(true);
    try {
      const res  = await fetch('/api/wallet/withdraw', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount_cents: cents }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'NO_STRIPE_ACCOUNT') {
          setError('Connect your bank account first (see button below).');
        } else {
          setError(data.error);
        }
        return;
      }
      setWithdrawCents('');
      await loadWallet();
      setToast('Withdrawal submitted! Funds will arrive in 1-3 business days.');
      setTimeout(() => setToast(null), 6000);
    } catch (err: any) {
      setError(err?.message ?? 'Network error');
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleConnectOnboard() {
    setConnecting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/stripe/connect/onboard', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to start onboarding');
        return;
      }
      window.location.href = data.url;
    } catch (err: any) {
      setError(err?.message ?? 'Network error');
    } finally {
      setConnecting(false);
    }
  }

  const balanceDollars = ((wallet?.balance ?? 0) / 100).toFixed(2);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <style>{`* { box-sizing: border-box; } input:focus { outline: none; border-color: ${C.gold} !important; }`}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: C.surf, border: `1px solid ${C.gold}`, borderRadius: 10,
          padding: '12px 24px', zIndex: 9999, fontFamily: "'Space Grotesk',sans-serif",
          fontSize: 13, color: C.text, boxShadow: '0 8px 32px rgba(0,0,0,.5)',
          maxWidth: 400, textAlign: 'center',
        }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}>

        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, marginBottom: 24, padding: 0 }}
        >
          ← Back to Dashboard
        </button>

        {/* Balance card */}
        <div style={{
          background: 'linear-gradient(135deg,#0e1f35,#0b1624)',
          border: `1px solid ${C.surf3}`, borderRadius: 16,
          padding: '28px 28px 24px',
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 10, letterSpacing: 3, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
                Wallet Balance
              </div>
              <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 48, color: C.gold, letterSpacing: 1, lineHeight: 1 }}>
                {loading ? '—' : `$${balanceDollars}`}
              </div>
            </div>
            <img src="/logo.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain', opacity: 0.5 }} />
          </div>

          {!loading && wallet && (
            <div style={{ display: 'flex', gap: 24, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.surf3}` }}>
              <div>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
                  Total Deposited
                </div>
                <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 16, color: C.sub }}>
                  ${(wallet.lifetime_deposited / 100).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
                  Total Withdrawn
                </div>
                <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 16, color: C.sub }}>
                  ${(wallet.lifetime_withdrawn / 100).toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.surf, borderRadius: 12, padding: 4, border: `1px solid ${C.surf3}` }}>
          {(['deposit', 'withdraw', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); }}
              style={{
                flex: 1, padding: '10px 0',
                background: tab === t ? C.surf3 : 'transparent',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: "'Oswald',sans-serif", fontSize: 11,
                letterSpacing: 2, textTransform: 'uppercase',
                color: tab === t ? C.gold : C.muted,
                transition: 'all .15s',
              }}
            >
              {t === 'deposit' ? 'Add Funds' : t === 'withdraw' ? 'Withdraw' : 'History'}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 8, marginBottom: 16,
            background: `${C.red}18`, border: `1px solid ${C.red}44`,
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.red,
          }}>{error}</div>
        )}

        {/* DEPOSIT TAB */}
        {tab === 'deposit' && (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, padding: 24 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.muted, marginBottom: 20 }}>
              Funds are available instantly after payment. Secured by Stripe.
            </div>

            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>
              Select Amount
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}>
              {QUICK_AMOUNTS.map(({ label, cents }) => (
                <button
                  key={cents}
                  onClick={() => { setSelectedCents(cents); setCustomDollars(''); }}
                  style={{
                    padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                    fontFamily: "'Anton',sans-serif", fontSize: 14,
                    background: !customDollars && selectedCents === cents ? C.gold : C.surf2,
                    border: `1px solid ${!customDollars && selectedCents === cents ? C.gold : C.surf3}`,
                    color: !customDollars && selectedCents === cents ? C.bg : C.text,
                    transition: 'all .15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
                Custom Amount
              </div>
              <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, borderRadius: 8, border: `1px solid ${customDollars ? C.gold : C.surf3}`, overflow: 'hidden', transition: 'border-color .15s' }}>
                <span style={{ padding: '0 12px', fontFamily: "'Anton',sans-serif", fontSize: 18, color: C.muted }}>$</span>
                <input
                  type="number"
                  min={10}
                  placeholder="10.00"
                  value={customDollars}
                  onChange={e => setCustomDollars(e.target.value)}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: "'Anton',sans-serif", fontSize: 22, color: C.text, padding: '12px 0' }}
                />
              </div>
            </div>

            <button
              onClick={handleDeposit}
              disabled={depositing || depositAmountCents < 1000}
              style={{
                width: '100%', padding: '15px',
                background: depositing || depositAmountCents < 1000 ? C.surf3 : `linear-gradient(135deg,${C.gold},${C.goldLight})`,
                border: 'none', borderRadius: 10, cursor: depositing ? 'wait' : 'pointer',
                fontFamily: "'Anton',sans-serif", fontSize: 15, letterSpacing: 2,
                color: depositing || depositAmountCents < 1000 ? C.muted : C.bg,
                transition: 'all .15s',
              }}
            >
              {depositing ? 'REDIRECTING…' : `DEPOSIT $${(depositAmountCents / 100).toFixed(2)} VIA STRIPE`}
            </button>
          </div>
        )}

        {/* WITHDRAW TAB */}
        {tab === 'withdraw' && (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, padding: 24 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: C.surf2, border: `1px solid ${C.surf3}`,
              borderRadius: 8, marginBottom: 20,
            }}>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.muted }}>Available balance</span>
              <span style={{ fontFamily: "'Anton',sans-serif", fontSize: 20, color: C.green }}>
                {loading ? '—' : `$${balanceDollars}`}
              </span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>
                Amount to Withdraw
              </div>
              <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, borderRadius: 8, border: `1px solid ${C.surf3}`, overflow: 'hidden' }}>
                <span style={{ padding: '0 12px', fontFamily: "'Anton',sans-serif", fontSize: 18, color: C.muted }}>$</span>
                <input
                  type="number"
                  min={10}
                  max={(wallet?.balance ?? 0) / 100}
                  value={withdrawCents}
                  onChange={e => setWithdrawCents(e.target.value)}
                  placeholder="10.00"
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: "'Anton',sans-serif", fontSize: 22, color: C.text, padding: '12px 0' }}
                />
                <button
                  onClick={() => setWithdrawCents(((wallet?.balance ?? 0) / 100).toFixed(2))}
                  style={{ padding: '0 12px', background: 'none', border: 'none', fontFamily: "'Oswald',sans-serif", fontSize: 9, letterSpacing: 1, color: C.gold, cursor: 'pointer', textTransform: 'uppercase' }}
                >MAX</button>
              </div>
            </div>

            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawCents || (wallet?.balance ?? 0) === 0}
              style={{
                width: '100%', padding: '15px',
                background: withdrawing ? C.surf3 : C.green,
                border: 'none', borderRadius: 10, cursor: withdrawing ? 'wait' : 'pointer',
                fontFamily: "'Anton',sans-serif", fontSize: 15, letterSpacing: 2,
                color: C.bg, transition: 'all .15s', marginBottom: 12,
              }}
            >
              {withdrawing ? 'PROCESSING…' : 'WITHDRAW TO BANK'}
            </button>

            {!hasConnect && (
              <div style={{ padding: '14px 16px', background: 'rgba(212,168,40,.08)', border: `1px solid rgba(212,168,40,.2)`, borderRadius: 8, marginTop: 4 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, marginBottom: 10 }}>
                  You need to connect a bank account to withdraw.
                </div>
                <button
                  onClick={handleConnectOnboard}
                  disabled={connecting}
                  style={{
                    width: '100%', padding: '11px',
                    background: connecting ? C.surf3 : 'rgba(212,168,40,.15)',
                    border: `1px solid ${C.gold}`, borderRadius: 8, cursor: 'pointer',
                    fontFamily: "'Oswald',sans-serif", fontSize: 11, letterSpacing: 2,
                    color: C.gold, textTransform: 'uppercase',
                  }}
                >
                  {connecting ? 'REDIRECTING…' : 'CONNECT BANK ACCOUNT'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontFamily: "'Oswald',sans-serif", letterSpacing: 2, fontSize: 12 }}>Loading…</div>
            ) : transactions.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>💳</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.muted }}>No transactions yet</div>
              </div>
            ) : (
              transactions.map((tx, i) => {
                const isCredit = ['deposit', 'contest_refund', 'winnings'].includes(tx.type);
                const color    = TX_COLORS[tx.type] ?? C.muted;
                return (
                  <div key={tx.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 20px',
                    borderBottom: i < transactions.length - 1 ? `1px solid ${C.surf3}` : 'none',
                  }}>
                    <div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: C.text }}>
                        {TX_LABELS[tx.type] ?? tx.type}
                      </div>
                      {tx.description && (
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted, marginTop: 2 }}>
                          {tx.description}
                        </div>
                      )}
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.muted, marginTop: 2 }}>
                        {new Date(tx.created_at).toLocaleDateString()} · {tx.status}
                        {tx.balance_after != null && ` · bal $${(tx.balance_after / 100).toFixed(2)}`}
                      </div>
                    </div>
                    <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 16, color, letterSpacing: 0.5 }}>
                      {isCredit ? '+' : '−'}${(tx.amount / 100).toFixed(2)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.muted }}>
          Payments secured by Stripe · College Units Fantasy 2026
        </div>
      </div>
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
