'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ConnectReturnPage() {
  const router  = useRouter();
  const [status, setStatus] = useState<'checking' | 'success' | 'pending'>('checking');

  useEffect(() => {
    async function check() {
      try {
        const res  = await fetch('/api/wallet/connect/status');
        const data = await res.json();
        setStatus(data.onboarded ? 'success' : 'pending');
      } catch {
        setStatus('pending');
      }
      setTimeout(() => router.push('/wallet?connect=success'), 2000);
    }
    check();
  }, [router]);

  const C = { bg: '#05080f', gold: '#d4a828', green: '#2ecc71', text: '#e8edf5', sub: '#7a90b0' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        {status === 'checking' ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 14, letterSpacing: 2, color: C.sub, textTransform: 'uppercase' }}>
              Verifying account…
            </div>
          </>
        ) : status === 'success' ? (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏦</div>
            <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 28, letterSpacing: 1, color: C.green, textTransform: 'uppercase', marginBottom: 8 }}>
              Bank Account Connected!
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.sub }}>
              Redirecting to your wallet…
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 14, letterSpacing: 1, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>
              Onboarding incomplete
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.sub }}>
              Redirecting back to wallet…
            </div>
          </>
        )}
      </div>
    </div>
  );
}
