'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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

type Wallet = { balance: number; lifetime_deposited: number; lifetime_withdrawn: number };

type Transaction = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  status: string;
  description: string | null;
  created_at: string;
};

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

const QUICK_AMOUNTS = [
  { label: '$10',  cents: 1000  },
  { label: '$25',  cents: 2500  },
  { label: '$50',  cents: 5000  },
  { label: '$100', cents: 10000 },
];

export function WalletPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [wallet,        setWallet]        = useState<Wallet | null>(null);
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedCents, setSelectedCents] = useState(2500);
  const [customDollars, setCustomDollars] = useState('');
  const [error,         setError]         = useState<string | null>(null);
  const [tab,           setTab]           = useState<'overview' | 'deposit'>('overview');

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

  useEffect(() => { loadWallet(); }, [loadWallet]);

  const depositCents = customDollars
    ? Math.round(parseFloat(customDollars) * 100)
    : selectedCents;

  function handleDeposit() {
    router.push('/wallet');
  }

  const balance = (wallet as any)?.available ?? wallet?.balance ?? 0;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: C.surf, borderRadius: 16, border: '1px solid ' + C.surf3, width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#0e1f35,#0b1624)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 3, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>Your Wallet</div>
            {loading
              ? <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, color: C.muted }}>—</div>
              : <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 32, color: C.gold, letterSpacing: 1 }}>${(balance / 100).toFixed(2)}</div>
            }
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { onClose(); router.push('/wallet'); }}
              style={{ background: 'rgba(212,168,40,.12)', border: '1px solid rgba(212,168,40,.3)', borderRadius: 8, color: C.gold, fontSize: 11, cursor: 'pointer', padding: '6px 12px', fontFamily: 'Oswald,sans-serif', letterSpacing: 1 }}
            >Full Wallet →</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid ' + C.surf3 }}>
          {(['overview', 'deposit'] as const).map(t => (
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
              {t === 'overview' ? 'History' : 'Add Funds'}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px 24px', maxHeight: 380, overflowY: 'auto' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: C.red + '18', border: '1px solid ' + C.red + '44', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.red }}>
              {error}
            </div>
          )}

          {/* OVERVIEW */}
          {tab === 'overview' && (
            loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 12, letterSpacing: 1 }}>Loading…</div>
            ) : transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💳</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.muted }}>No transactions yet</div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted, marginTop: 4 }}>Add funds to get started</div>
              </div>
            ) : (
              <div>
                {transactions.map(tx => {
                  const isCredit = ['deposit', 'contest_refund', 'winnings'].includes(tx.type);
                  const col = TX_COLORS[tx.type] ?? C.muted;
                  return (
                    <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid ' + C.surf3 }}>
                      <div>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600, color: C.text }}>{TX_LABELS[tx.type] ?? tx.type}</div>
                        {tx.description && <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: C.muted, marginTop: 2 }}>{tx.description}</div>}
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 9, color: C.muted, marginTop: 2 }}>{new Date(tx.created_at).toLocaleDateString()} · {tx.status}</div>
                      </div>
                      <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 15, color: col, letterSpacing: 0.5 }}>
                        {isCredit ? '+' : '−'}${(((tx as any).amount_cents ?? tx.amount) / 100).toFixed(2)}
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
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, color: C.muted, marginBottom: 14 }}>Funds available instantly. Secured by Stripe.</div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {QUICK_AMOUNTS.map(({ label, cents }) => (
                  <button
                    key={cents}
                    onClick={() => { setSelectedCents(cents); setCustomDollars(''); }}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'Anton,sans-serif', fontSize: 14,
                      background: !customDollars && selectedCents === cents ? C.gold : C.surf2,
                      border: '1px solid ' + (!customDollars && selectedCents === cents ? C.gold : C.surf3),
                      color: !customDollars && selectedCents === cents ? C.bg : C.text,
                      transition: 'all .15s',
                    }}
                  >{label}</button>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontFamily: 'Oswald,sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Custom Amount</label>
                <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, borderRadius: 8, border: '1px solid ' + (customDollars ? C.gold : C.surf3), overflow: 'hidden' }}>
                  <span style={{ padding: '0 12px', fontFamily: 'Anton,sans-serif', fontSize: 16, color: C.muted }}>$</span>
                  <input
                    type="number" min={10} placeholder="10.00"
                    value={customDollars}
                    onChange={e => setCustomDollars(e.target.value)}
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.text, padding: '12px 0' }}
                  />
                </div>
              </div>

              <button
                onClick={handleDeposit}
                style={{
                  width: '100%', padding: '14px', borderRadius: 10,
                  cursor: 'pointer',
                  background: C.gold, border: 'none',
                  fontFamily: 'Oswald,sans-serif', fontSize: 13, letterSpacing: 2,
                  color: C.bg, fontWeight: 700, transition: 'all .15s',
                }}
              >
                GO TO WALLET →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
