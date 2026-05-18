'use client';

import { useState } from 'react';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a',
  text: '#e8edf5', sub: '#7a90b0', muted: '#4a5d7a',
  green: '#2ecc71', red: '#e74c3c',
};

interface Props {
  onAccepted: () => void;
  onDecline: () => void;
}

const HIGHLIGHTS = [
  { icon: '🏈', text: 'Skill-based fantasy contests with real entry fees and prizes' },
  { icon: '🔞', text: 'Must be 18 or older to participate in paid contests' },
  { icon: '📍', text: 'Available only in eligible U.S. states — check Eligible States' },
  { icon: '💰', text: 'We retain up to 5% platform fee (rake) from prize pools' },
  { icon: '🛡️', text: 'You may self-exclude at any time — contact support' },
  { icon: '⚠️', text: 'Fantasy sports involves real money. Only play with funds you can afford to lose' },
];

export default function TermsAcceptanceModal({ onAccepted, onDecline }: Props) {
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    if (!agreed) return;
    setLoading(true);
    try {
      const res = await fetch('/api/compliance/accept-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termsVersion: '1.0', privacyVersion: '1.0' }),
      });
      if (res.ok) {
        onAccepted();
      } else {
        setError('Failed to save acceptance. Please try again.');
      }
    } catch (e) {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,8,15,.92)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 16, padding: 36, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: 2, textTransform: 'uppercase', color: C.text, marginBottom: 8 }}>Terms of Service</div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>Last updated May 18, 2026</div>
        </div>

        <div style={{ fontSize: 13, color: C.sub, marginBottom: 20, lineHeight: 1.6 }}>
          Before you continue, please review these key points about using College Units Fantasy:
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {HIGHLIGHTS.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: C.surf2, borderRadius: 8, padding: '10px 14px' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{h.icon}</span>
              <span style={{ fontSize: 13, color: '#c8d4e8', lineHeight: 1.5 }}>{h.text}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'rgba(212,168,40,.06)', border: `1px solid rgba(212,168,40,.2)`, borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
          By accepting, you agree to our full{' '}
          <a href="/legal/terms" target="_blank" style={{ color: C.gold }}>Terms of Service</a>,{' '}
          <a href="/legal/privacy" target="_blank" style={{ color: C.gold }}>Privacy Policy</a>, and{' '}
          <a href="/legal/contest-rules" target="_blank" style={{ color: C.gold }}>Contest Rules</a>.
          Read them in full before agreeing.
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: 2, accentColor: C.gold, width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
            I have read and agree to the Terms of Service, Privacy Policy, and Contest Rules. I am 18 or older and located in an eligible state.
          </span>
        </label>

        {error && (
          <div style={{ background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: C.red, fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={!agreed || loading}
          style={{
            width: '100%', padding: 14, background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
            border: 'none', borderRadius: 8, cursor: !agreed || loading ? 'not-allowed' : 'pointer',
            fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: C.bg,
            opacity: !agreed || loading ? 0.5 : 1, marginBottom: 10,
          }}
        >
          {loading ? 'Saving...' : 'Accept & Continue'}
        </button>

        <button
          onClick={onDecline}
          style={{
            width: '100%', padding: 12, background: 'none', border: `1px solid ${C.surf3}`,
            borderRadius: 8, cursor: 'pointer', color: C.muted, fontSize: 12,
            fontFamily: "'Oswald', sans-serif", letterSpacing: 1,
          }}
        >
          Decline — Sign Out
        </button>
      </div>
    </div>
  );
}
