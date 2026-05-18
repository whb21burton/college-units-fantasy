'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a',
  text: '#e8edf5', sub: '#7a90b0', muted: '#4a5d7a',
  border: '#1e2d47',
};

export interface Section {
  id: string;
  title: string;
}

interface Props {
  title: string;
  subtitle?: string;
  lastUpdated: string;
  sections: Section[];
  children: React.ReactNode;
}

export default function LegalPageLayout({ title, subtitle, lastUpdated, sections, children }: Props) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observerRef.current!.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, [sections]);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: "'Space Grotesk', Inter, sans-serif" }}>
      <style>{`@media print { .no-print { display: none !important; } .print-main { max-width: 100% !important; } }`}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="no-print">
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo.png" alt="CUF" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: 2, color: C.gold, textTransform: 'uppercase' }}>College Units Fantasy</span>
        </Link>
        <button
          onClick={() => window.print()}
          style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 14px', color: C.sub, cursor: 'pointer', fontSize: 12, fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}
        >
          Print / Save PDF
        </button>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 40, alignItems: 'flex-start' }}>
        {/* ToC Sidebar */}
        <aside className="no-print" style={{ width: 220, flexShrink: 0, position: 'sticky', top: 24, paddingTop: 40 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 12 }}>Contents</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sections.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                style={{
                  fontSize: 12, padding: '6px 10px', borderRadius: 6, textDecoration: 'none',
                  color: activeId === s.id ? C.gold : C.sub,
                  background: activeId === s.id ? 'rgba(212,168,40,.1)' : 'transparent',
                  borderLeft: `2px solid ${activeId === s.id ? C.gold : 'transparent'}`,
                  fontFamily: "'Oswald', sans-serif",
                  letterSpacing: 0.5,
                  transition: 'all .15s',
                }}
              >
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="print-main" style={{ flex: 1, padding: '40px 0 80px', maxWidth: 720 }}>
          <div style={{ marginBottom: 8, fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, letterSpacing: 1 }}>Legal</div>
          <h1 style={{ fontFamily: "'Anton', sans-serif", fontSize: 36, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 8px', color: C.text }}>
            {title}
          </h1>
          {subtitle && <p style={{ color: C.sub, fontSize: 14, margin: '0 0 8px' }}>{subtitle}</p>}
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, letterSpacing: 1, marginBottom: 40 }}>
            Last Updated: {lastUpdated}
          </div>
          <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, marginBottom: 40 }} />
          {children}
        </main>
      </div>
    </div>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 48, scrollMarginTop: 24 }}>
      <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: 1.5, textTransform: 'uppercase', color: C.gold, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        {title}
      </h2>
      <div style={{ color: '#c8d4e8', fontSize: 14, lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}
