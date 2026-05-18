import Link from 'next/link';

const C = {
  bg: '#05080f', surf: '#0c1220', border: '#1e2d47',
  gold: '#d4a828', text: '#e8edf5', sub: '#7a90b0', muted: '#4a5d7a',
};

export default function Footer() {
  return (
    <footer style={{ background: C.surf, borderTop: `1px solid ${C.border}`, padding: '40px 24px 24px', marginTop: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, marginBottom: 32 }}>
          {/* Column 1 — Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <img src="/logo.png" alt="CUF" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: 2, color: C.gold, textTransform: 'uppercase' }}>College Units Fantasy</span>
            </div>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
              Draft college football units. Dominate your league. For entertainment purposes only. Must be 18+ to participate in paid contests.
            </p>
          </div>

          {/* Column 2 — Legal */}
          <div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 12 }}>Legal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { href: '/legal/terms', label: 'Terms of Service' },
                { href: '/legal/privacy', label: 'Privacy Policy' },
                { href: '/legal/contest-rules', label: 'Contest Rules' },
                { href: '/legal/state-restrictions', label: 'Eligible States' },
              ].map(l => (
                <Link key={l.href} href={l.href} style={{ fontSize: 12, color: C.sub, textDecoration: 'none', fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5 }}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Column 3 — Responsible Gaming */}
          <div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 12 }}>Responsible Gaming</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link href="/legal/responsible-gaming" style={{ fontSize: 12, color: C.sub, textDecoration: 'none', fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5 }}>
                Responsible Gaming Policy
              </Link>
              <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.sub, textDecoration: 'none', fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5 }}>
                National Problem Gambling Helpline
              </a>
              <a href="tel:1-800-522-4700" style={{ fontSize: 12, color: '#2ecc71', textDecoration: 'none', fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5 }}>
                1-800-522-4700 (24/7 Helpline)
              </a>
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '0 0 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Space Grotesk', sans-serif" }}>
            © {new Date().getFullYear()} College Units Fantasy. All rights reserved. Fantasy sports involves real money and risk.
          </div>
          <div style={{ fontSize: 11, color: '#2ecc71', fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>
            🛡️ If you or someone you know has a gambling problem, call 1-800-522-4700
          </div>
        </div>
      </div>
    </footer>
  );
}
