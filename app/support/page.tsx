'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const C = {
  bg: '#070a12', surf: '#0c1422', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#f5a623', text: '#e4edf7', sub: '#7a90aa', muted: '#3e5470',
  green: '#15c678', red: '#f03a5a',
}

const CATEGORIES = [
  'Account & Login',
  'Deposits & Withdrawals',
  'Contest Rules',
  'Technical Issue',
  'Responsible Gaming',
  'Other',
]

export default function SupportPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', category: '', subject: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!form.name || !form.email || !form.message) {
      setError('Please fill in all required fields')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess(true)
      } else {
        setError(data.error ?? 'Failed to send message')
      }
    } catch (e) {
      setError('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  const inputStyle = {
    width: '100%', padding: '11px 14px',
    background: C.surf2, border: `1px solid ${C.surf3}`,
    borderRadius: 8, color: C.text,
    fontFamily: 'Oswald,sans-serif', fontSize: 13,
    outline: 'none', boxSizing: 'border-box' as const,
    marginBottom: 16,
  }
  const labelStyle = {
    fontFamily: 'Oswald,sans-serif', fontSize: 10,
    letterSpacing: 2, color: C.muted,
    textTransform: 'uppercase' as const,
    display: 'block', marginBottom: 6,
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: '40px 24px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <button onClick={() => router.push('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontFamily: 'Oswald,sans-serif', fontSize: 11, letterSpacing: 1, marginBottom: 24, padding: 0 }}>
          ← Back
        </button>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 28, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 8 }}>
            Contact Support
          </div>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            Have a question or issue? Fill out the form below and our team will get back to you.
            We typically respond within 24–48 hours.
          </div>
        </div>

        {success ? (
          <div style={{ background: 'rgba(21,198,120,.08)', border: '1px solid rgba(21,198,120,.3)', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 20, color: C.green, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              Message Sent!
            </div>
            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 20 }}>
              We received your message and sent you a confirmation email.
              Our team will respond within 24–48 hours.
            </div>
            <button onClick={() => router.push('/')}
              style={{ padding: '12px 28px', background: C.gold, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 13, letterSpacing: 2, color: C.bg }}>
              Back to Home
            </button>
          </div>
        ) : (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 12, padding: 28 }}>

            <label style={labelStyle}>Your Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Full name" style={inputStyle} />

            <label style={labelStyle}>Your Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="your@email.com" style={inputStyle} />

            <label style={labelStyle}>Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Select a category</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={labelStyle}>Subject</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Brief description of your issue" style={inputStyle} />

            <label style={labelStyle}>Message *</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Describe your issue in detail..."
              rows={6}
              style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'Oswald,sans-serif', fontSize: 13 }} />

            {error && (
              <div style={{ padding: '10px 12px', background: 'rgba(240,58,90,.1)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 6, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.red, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting}
              style={{ width: '100%', padding: '14px', background: submitting ? C.surf3 : C.gold, border: 'none', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2, color: submitting ? C.muted : C.bg, textTransform: 'uppercase' as const }}>
              {submitting ? 'Sending…' : 'Send Message'}
            </button>

            <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, color: C.muted, textAlign: 'center' as const, marginTop: 12 }}>
              Your email is never shared publicly. For urgent issues contact us through this form.
            </div>
          </div>
        )}

        {/* FAQ quick links */}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' as const, marginBottom: 4 }}>Quick Links</div>
          {[
            ['Contest Rules', '/legal/contest-rules'],
            ['Responsible Gaming', '/legal/responsible-gaming'],
            ['State Restrictions', '/legal/state-restrictions'],
            ['Terms of Service', '/legal/terms'],
          ].map(([label, href]) => (
            <button key={href} onClick={() => router.push(href)}
              style={{ padding: '10px 14px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub, textAlign: 'left' as const, letterSpacing: 0.5 }}>
              {label} →
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
