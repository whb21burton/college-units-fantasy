'use client';
import { useState, useEffect, useCallback } from 'react';

const C = {
  bg:    '#070a12',
  surf:  '#0c1220',
  surf2: '#131d30',
  surf3: '#1e2d47',
  gold:  '#d4a828',
  muted: '#4a5d7a',
  text:  '#e8edf5',
  sub:   '#7a90b0',
  green: '#2ecc71',
  red:   '#e74c3c',
};

type Wallet = {
  balance: number;
  pending_balance: number;
  withdrawable_balance: number;
};

type Transaction = {
  id: string;
  type: 'deposit' | 'entry' | 'payout' | 'fee' | 'refund' | 'withdrawal';
  amount: number;
  status: string;
  description: string | null;
  created_at: string;
};

const TX_LABELS: Record<string, string> = {
  deposit:    'Deposit',
  entry:      'League Entry',
  payout:     'Prize Payout',
  fee:        'Platform Fee',
  refund:     'Refund',
  withdrawal: 'Withdrawal',
};

const TX_COLORS: Record<string, string> = {
  deposit:    C.green,
  payout:     C.gold,
  refund:     C.green,
  entry:      C.red,
  fee:        C.muted,
  withdrawal: C.red,
};

export function WalletPanel({ onClose }: { onClose: () => void }) {
  const [wallet,       setWallet]       = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [depositAmt,   setDepositAmt]   = useState('20');
  const [withdrawAmt,  setWithdrawAmt]  = useState('');
  const [depositing,   setDepositing]   = useState(false);
  const [withdrawing,  setWithdrawing]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [tab,          setTab]          = useState<'overview' | 'deposit' | 'withdraw'>('overview');

  const loadWallet = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/wallet');
      const data = await res.json();
      setWallet(data.wallet);
      setTransactions(data.transactions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWallet(); }, [loadWallet]);

  async function handleDeposit() {
    const amount = parseFloat(depositAmt);
    if (!amount || amount < 5) { setError('Minimum deposit is $5'); return; }
    setError(null);
    setDepositing(true);
    try {
      const res  = await fetch('/api/wallet/deposit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok) { setError(data.error ?? `Server error (${res.status})`); return; }
      if (!data.url) { setError('No checkout URL returned. Check Stripe configuration.'); return; }
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err: any) {
      setError(err?.message ?? 'Network error. Please try again.');
    } finally {
      setDepositing(false);
    }
  }

  async function handleWithdraw() {
    const amount = parseFloat(withdrawAmt);
    if (!amount || amount < 10) { setError('Minimum withdrawal is $10'); return; }
    setError(null);
    setWithdrawing(true);
    try {
      const res  = await fetch('/api/wallet/withdraw', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'NO_STRIPE_ACCOUNT') {
          setError('Connect your bank account to withdraw. Feature coming soon.');
        } else {
          setError(data.error);
        }
        return;
      }
      await loadWallet();
      setWithdrawAmt('');
      setTab('overview');
    } finally {
      setWithdrawing(false);
    }
  }

  const QUICK_AMOUNTS = [10, 20, 50, 100];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.surf, borderRadius: 16,
        border: '1px solid ' + C.surf3,
        width: '100%', maxWidth: 420,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg,#0e1f35,#0b1624)',
          padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 3, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
              Your Wallet
            </div>
            {loading ? (
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, color: C.muted }}>—</div>
            ) : (
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, color: C.gold, letterSpacing: 1 }}>
                ${(wallet?.balance ?? 0).toFixed(2)}
              </div>
            )}
            {!loading && (wallet?.withdrawable_balance ?? 0) > 0 && (
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.green, marginTop: 4 }}>
                ${wallet!.withdrawable_balance.toFixed(2)} withdrawable
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: 4 }}
          >✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid ' + C.surf3 }}>
          {(['overview', 'deposit', 'withdraw'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); }}
              style={{
                flex: 1, padding: '10px 0',
                background: 'none', border: 'none',
                fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2,
                textTransform: 'uppercase', cursor: 'pointer',
                color: tab === t ? C.gold : C.muted,
                borderBottom: tab === t ? '2px solid ' + C.gold : '2px solid transparent',
              }}
            >
              {t === 'overview' ? 'History' : t === 'deposit' ? 'Add Funds' : 'Withdraw'}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px 24px', maxHeight: 380, overflowY: 'auto' }}>
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 16,
              background: C.red + '18', border: '1px solid ' + C.red + '44',
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.red,
            }}>{error}</div>
          )}

          {/* OVERVIEW */}
          {tab === 'overview' && (
            loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1 }}>
                Loading…
              </div>
            ) : transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💳</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.muted }}>No transactions yet</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted, marginTop: 4 }}>Add funds to get started</div>
              </div>
            ) : (
              <div>
                {transactions.map(tx => {
                  const isCredit = tx.type === 'deposit' || tx.type === 'payout' || tx.type === 'refund';
                  const col = TX_COLORS[tx.type] || C.muted;
                  return (
                    <div key={tx.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: '1px solid ' + C.surf3,
                    }}>
                      <div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: C.text }}>
                          {TX_LABELS[tx.type] || tx.type}
                        </div>
                        {tx.description && (
                          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.muted, marginTop: 2 }}>
                            {tx.description}
                          </div>
                        )}
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, color: C.muted, marginTop: 2 }}>
                          {new Date(tx.created_at).toLocaleDateString()} · {tx.status}
                        </div>
                      </div>
                      <div style={{
                        fontFamily: 'Anton,sans-serif', fontSize: 15,
                        color: col,
                        letterSpacing: 0.5,
                      }}>
                        {isCredit ? '+' : '−'}${Math.abs(tx.amount).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* DEPOSIT */}
          {tab === 'deposit' && (
            <div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted, marginBottom: 12 }}>
                Funds are available instantly after payment.
              </div>

              {/* Quick amounts */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {QUICK_AMOUNTS.map(amt => (
                  <button
                    key={amt}
                    onClick={() => setDepositAmt(String(amt))}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'Anton,sans-serif', fontSize: 14,
                      background: depositAmt === String(amt) ? C.gold : C.surf2,
                      border: '1px solid ' + (depositAmt === String(amt) ? C.gold : C.surf3),
                      color: depositAmt === String(amt) ? C.bg : C.text,
                      transition: 'all .15s',
                    }}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
                  Custom Amount
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, borderRadius: 8, border: '1px solid ' + C.surf3, overflow: 'hidden' }}>
                  <span style={{ padding: '0 12px', fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.muted }}>$</span>
                  <input
                    type="number"
                    min={5}
                    max={10000}
                    value={depositAmt}
                    onChange={e => setDepositAmt(e.target.value)}
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text,
                      padding: '12px 0',
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleDeposit}
                disabled={depositing}
                style={{
                  width: '100%', padding: '14px', borderRadius: 10, cursor: depositing ? 'not-allowed' : 'pointer',
                  background: depositing ? C.muted : C.gold, border: 'none',
                  fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 2,
                  color: depositing ? C.surf3 : C.bg, fontWeight: 700,
                  transition: 'all .15s',
                }}
              >
                {depositing ? 'REDIRECTING…' : `DEPOSIT $${parseFloat(depositAmt || '0').toFixed(2)} VIA STRIPE`}
              </button>

              <div style={{ marginTop: 12, fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.muted, textAlign: 'center' }}>
                Secured by Stripe · No card data touches our servers
              </div>
            </div>
          )}

          {/* WITHDRAW */}
          {tab === 'withdraw' && (
            <div>
              <div style={{
                padding: '12px 14px', borderRadius: 8, marginBottom: 16,
                background: C.surf2, border: '1px solid ' + C.surf3,
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.muted }}>Available to withdraw</span>
                <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.green }}>
                  ${(wallet?.withdrawable_balance ?? 0).toFixed(2)}
                </span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
                  Amount
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, borderRadius: 8, border: '1px solid ' + C.surf3, overflow: 'hidden' }}>
                  <span style={{ padding: '0 12px', fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.muted }}>$</span>
                  <input
                    type="number"
                    min={10}
                    max={wallet?.withdrawable_balance ?? 0}
                    value={withdrawAmt}
                    onChange={e => setWithdrawAmt(e.target.value)}
                    placeholder="0.00"
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text,
                      padding: '12px 0',
                    }}
                  />
                  <button
                    onClick={() => setWithdrawAmt(String(wallet?.withdrawable_balance ?? 0))}
                    style={{
                      padding: '0 12px', background: 'none', border: 'none',
                      fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 1,
                      color: C.gold, cursor: 'pointer', textTransform: 'uppercase',
                    }}
                  >MAX</button>
                </div>
              </div>

              <button
                onClick={handleWithdraw}
                disabled={withdrawing || (wallet?.withdrawable_balance ?? 0) === 0}
                style={{
                  width: '100%', padding: '14px', borderRadius: 10,
                  cursor: (withdrawing || (wallet?.withdrawable_balance ?? 0) === 0) ? 'not-allowed' : 'pointer',
                  background: (withdrawing || (wallet?.withdrawable_balance ?? 0) === 0) ? C.muted : C.green,
                  border: 'none',
                  fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 2,
                  color: C.bg, fontWeight: 700,
                  transition: 'all .15s',
                }}
              >
                {withdrawing ? 'PROCESSING…' : 'WITHDRAW TO BANK'}
              </button>

              <div style={{ marginTop: 12, fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.muted, textAlign: 'center' }}>
                Withdrawals require a connected bank account · Powered by Stripe
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
