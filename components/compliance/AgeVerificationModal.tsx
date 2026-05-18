'use client';

import { useState } from 'react';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a',
  text: '#e8edf5', sub: '#7a90b0', muted: '#4a5d7a',
  green: '#2ecc71', red: '#e74c3c',
};

interface Props {
  onVerified: () => void;
  onDecline: () => void;
}

export default function AgeVerificationModal({ onVerified, onDecline }: Props) {
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    if (!dob) { setError('Please enter your date of birth.'); return; }
    setLoading(true);
    setError(null);

    const res = await fetch('/api/compliance/verify-age', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateOfBirth: dob }),
    });
    const data = await res.json();

    if (res.ok && data.eligible) {
      onVerified();
    } else {
      setError(data.reason ?? data.error ?? 'Verification failed.');
    }
    setLoading(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,8,15,.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 16, padding: 36, maxWidth: 420, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔞</div>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 24, letterSpacing: 2, textTransform: 'uppercase', color: C.text, marginBottom: 8 }}>Age Verification</div>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
            You must be 18 or older to participate in paid contests. Please confirm your date of birth.
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontFamily: "'Oswald', sans-serif", letterSpacing: 1, color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>Date of Birth</div>
          <input
            type="date"
            value={dob}
            onChange={e => setDob(e.target.value)}
            max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
            style={{
              width: '100%', padding: '12px 14px', background: C.surf2, border: `1px solid ${C.surf3}`,
              borderRadius: 8, color: C.text, fontSize: 15, outline: 'none', fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: C.red, fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={loading || !dob}
          style={{
            width: '100%', padding: 14, background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
            border: 'none', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
            fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: C.bg,
            opacity: loading || !dob ? 0.6 : 1, marginBottom: 10,
          }}
        >
          {loading ? 'Verifying...' : 'Confirm Age'}
        </button>

        <button
          onClick={onDecline}
          style={{
            width: '100%', padding: 12, background: 'none', border: `1px solid ${C.surf3}`,
            borderRadius: 8, cursor: 'pointer', color: C.muted, fontSize: 12,
            fontFamily: "'Oswald', sans-serif", letterSpacing: 1,
          }}
        >
          I am under 18 — Exit
        </button>

        <div style={{ marginTop: 16, fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 1.5 }}>
          By continuing, you confirm you are 18 or older and agree to our{' '}
          <a href="/legal/terms" target="_blank" style={{ color: C.sub }}>Terms of Service</a>.
          Your date of birth is encrypted and stored securely.
        </div>
      </div>
    </div>
  );
}
