'use client';

import { useEffect, useState } from 'react';

interface Props {
  stateCode?: string;
}

interface RestrictionInfo {
  eligible: boolean;
  state_name: string | null;
  reason: string | null;
}

export default function StateRestrictionBanner({ stateCode }: Props) {
  const [info, setInfo] = useState<RestrictionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!stateCode || stateCode.length !== 2) return;
    fetch(`/api/compliance/check-state?state=${stateCode}`)
      .then(r => r.json())
      .then(d => {
        if (!d.eligible) setInfo(d);
      })
      .catch(() => {});
  }, [stateCode]);

  if (!info || dismissed) return null;

  return (
    <div style={{
      background: 'rgba(231,76,60,.12)', border: '1px solid rgba(231,76,60,.3)',
      borderRadius: 10, padding: '14px 18px', marginBottom: 16,
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: 1, color: '#e74c3c', textTransform: 'uppercase', marginBottom: 4 }}>
          Paid Contests Restricted in {info.state_name ?? stateCode}
        </div>
        <div style={{ fontSize: 12, color: '#7a90b0', lineHeight: 1.5 }}>
          {info.reason ?? 'Paid daily fantasy sports contests are not permitted in your state.'}{' '}
          You may still enjoy free-to-play contests.{' '}
          <a href="/legal/state-restrictions" style={{ color: '#d4a828', textDecoration: 'none' }}>Learn more →</a>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: 'none', border: 'none', color: '#4a5d7a', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
