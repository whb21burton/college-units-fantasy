'use client'
import { useState } from 'react'
import { useCompliance } from '@/context/ComplianceContext'

export default function ComplianceBanner() {
  const { restricted, stateName, loading } = useCompliance()
  const [dismissed, setDismissed] = useState(false)

  if (loading || !restricted || dismissed) return null

  return (
    <div style={{
      background:   'rgba(245,166,35,.13)',
      borderBottom: '1px solid rgba(245,166,35,.35)',
      padding:      '10px 20px',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      gap:          12,
      position:     'relative',
      zIndex:       100,
    }}>
      <span style={{
        fontFamily: 'Oswald,sans-serif',
        fontSize:   12,
        color:      '#f5a623',
        letterSpacing: 0.3,
      }}>
        ⚠️ Cash contests are unavailable while you are located in {stateName ?? 'your state'}. You may still view contests and withdraw funds.
      </span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#f5a623', fontSize: 18, padding: '0 4px',
          lineHeight: 1, flexShrink: 0,
        }}
      >✕</button>
    </div>
  )
}
