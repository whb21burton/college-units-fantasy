'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Stripe redirects here if the onboarding link expired — restart onboarding
export default function ConnectRefreshPage() {
  const router = useRouter();

  useEffect(() => {
    async function restart() {
      try {
        const res  = await fetch('/api/wallet/connect/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (data.url) { window.location.href = data.url; return; }
      } catch {}
      router.push('/wallet');
    }
    restart();
  }, [router]);

  return (
    <div style={{ minHeight: '100vh', background: '#05080f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', fontFamily: "'Oswald',sans-serif", fontSize: 13, letterSpacing: 2, color: '#4a5d7a', textTransform: 'uppercase' }}>
        Restarting onboarding…
      </div>
    </div>
  );
}
