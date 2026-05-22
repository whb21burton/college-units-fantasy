'use client'
import { useState, useEffect } from 'react'

export default function MobileInstallBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = (window.navigator as any).standalone === true
    const dismissed = sessionStorage.getItem('install_banner_dismissed')
    if (isIOS && !isStandalone && !dismissed) setShow(true)
  }, [])

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9990,
      background: '#0c1422', borderTop: '1px solid #1e2d47',
      padding: '12px 16px 20px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
    }}>
      <div style={{ fontSize: 32, flexShrink: 0 }}>🏈</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 14, color: '#f5a623', letterSpacing: 1, marginBottom: 3 }}>
          ADD TO HOME SCREEN
        </div>
        <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 11, color: '#7a90aa', lineHeight: 1.5 }}>
          For the best experience with no browser bar — tap{' '}
          <span style={{ color: '#e4edf7' }}>Share</span>{' '}
          <span style={{ fontSize: 13 }}>⎙</span>{' '}
          then{' '}
          <span style={{ color: '#e4edf7' }}>"Add to Home Screen"</span>
        </div>
      </div>
      <button
        onClick={() => { sessionStorage.setItem('install_banner_dismissed', '1'); setShow(false) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3e5470', fontSize: 18, padding: 4, flexShrink: 0 }}>
        ✕
      </button>
    </div>
  )
}
