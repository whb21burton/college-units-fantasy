'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

type AuthMode = 'magic' | 'password' | 'signup';

interface AuthModalProps {
  onClose: () => void;
  redirectTo?: string;
  title?: string;
  subtitle?: string;
}

export function AuthModal({ onClose, redirectTo, title, subtitle }: AuthModalProps) {
  const [mode, setMode]         = useState<AuthMode>('magic');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const callbackUrl = `${appUrl}/auth/callback${redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : ''}`;

  async function handleMagicLink() {
    if (!email) return;
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  }

  async function handlePassword() {
    if (!email || !password) return;
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    onClose();
  }

  async function handleSignup() {
    if (!email || !password || !name) return;
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: callbackUrl,
        data: { display_name: name },
      },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  }

  async function handleGoogle() {
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    });
    if (error) { setError(error.message); setLoading(false); }
  }

  const submit = mode === 'magic' ? handleMagicLink
               : mode === 'signup' ? handleSignup
               : handlePassword;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)',
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 901,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{
          width: '100%', maxWidth: 440,
          background: '#0c1220',
          border: '1px solid #1e2d47',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,.8), 0 0 0 1px rgba(212,168,40,.1)',
          animation: 'modalIn .2s ease',
        }}>

          {/* Gold top bar */}
          <div style={{
            height: 3,
            background: 'linear-gradient(90deg, #d4a828, #f0c94a, #d4a828)',
          }} />

          {/* Header */}
          <div style={{ padding: '28px 32px 0' }}>
            <button onClick={onClose} style={{
              position: 'absolute', top: 16, right: 16,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#4a5d7a', fontSize: 22, lineHeight: 1,
              width: 32, height: 32, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>

            {/* Logo mark */}
            <div style={{ marginBottom: 16 }}>
              <span style={{
                fontFamily: "'Anton', sans-serif",
                fontSize: 14, letterSpacing: 3,
                background: 'linear-gradient(135deg, #f0c94a, #d4a828)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                textTransform: 'uppercase',
              }}>🏈 College Units Fantasy</span>
            </div>

            <h2 style={{
              fontFamily: "'Anton', sans-serif",
              fontSize: 26, letterSpacing: 1,
              color: '#e8edf5', marginBottom: 6,
              textTransform: 'uppercase',
            }}>
              {title || (mode === 'signup' ? 'Create Account' : 'Sign In')}
            </h2>
            <p style={{
              fontFamily: "'Oswald', sans-serif",
              fontSize: 13, color: '#7a90b0', letterSpacing: .5, marginBottom: 28,
            }}>
              {subtitle || (mode === 'signup'
                ? 'Join the only fantasy game built for CFB fans'
                : 'Welcome back to the gridiron')}
            </p>
          </div>

          {/* Sent state */}
          {sent ? (
            <div style={{ padding: '0 32px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
              <div style={{
                fontFamily: "'Anton', sans-serif",
                fontSize: 20, color: '#d4a828', letterSpacing: 1,
                textTransform: 'uppercase', marginBottom: 8,
              }}>Check Your Email</div>
              <p style={{
                fontFamily: "'Oswald', sans-serif",
                fontSize: 14, color: '#7a90b0', lineHeight: 1.6,
              }}>
                We sent a login link to <strong style={{ color: '#e8edf5' }}>{email}</strong>.
                Click it to sign in — no password needed.
              </p>
              <button onClick={() => setSent(false)} style={{
                marginTop: 24,
                background: 'none', border: '1px solid #1e2d47',
                color: '#7a90b0', fontFamily: "'Oswald', sans-serif",
                fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase',
                padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
              }}>
                Try Different Email
              </button>
            </div>
          ) : (
            <div style={{ padding: '0 32px 32px' }}>

              {/* Mode tabs */}
              <div style={{
                display: 'flex', gap: 4, marginBottom: 24,
                background: '#05080f', borderRadius: 8, padding: 4,
              }}>
                {([
                  ['magic',    '✉️ Magic Link'],
                  ['password', '🔑 Password'],
                  ['signup',   '🚀 Sign Up'],
                ] as [AuthMode, string][]).map(([m, label]) => (
                  <button key={m} onClick={() => { setMode(m); setError(null); }} style={{
                    flex: 1, padding: '8px 0',
                    fontFamily: "'Oswald', sans-serif",
                    fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    background: mode === m ? '#1e2d47' : 'transparent',
                    color: mode === m ? '#d4a828' : '#4a5d7a',
                    transition: 'all .15s',
                  }}>{label}</button>
                ))}
              </div>

              {/* Google OAuth */}
              <button onClick={handleGoogle} disabled={loading} style={{
                width: '100%', padding: '12px',
                background: '#131d30', border: '1px solid #1e2d47',
                borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                marginBottom: 20, transition: 'all .15s',
                opacity: loading ? .6 : 1,
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#d4a828')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2d47')}
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
                </svg>
                <span style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontSize: 13, letterSpacing: 1, color: '#e8edf5',
                }}>Continue with Google</span>
              </button>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
              }}>
                <div style={{ flex: 1, height: 1, background: '#1e2d47' }} />
                <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10,
                  color: '#4a5d7a', letterSpacing: 2 }}>OR</span>
                <div style={{ flex: 1, height: 1, background: '#1e2d47' }} />
              </div>

              {/* Name field (signup only) */}
              {mode === 'signup' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Your Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Bama Bill"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#d4a828')}
                    onBlur={e  => (e.target.style.borderColor = '#1e2d47')}
                  />
                </div>
              )}

              {/* Email */}
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#d4a828')}
                  onBlur={e  => (e.target.style.borderColor = '#1e2d47')}
                />
              </div>

              {/* Password (non-magic modes) */}
              {mode !== 'magic' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Password</label>
                  <input
                    type="password"
                    placeholder={mode === 'signup' ? 'Min 8 characters' : '••••••••'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = '#d4a828')}
                    onBlur={e  => (e.target.style.borderColor = '#1e2d47')}
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  marginBottom: 14, padding: '10px 14px',
                  background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)',
                  borderRadius: 6,
                  fontFamily: "'Oswald', sans-serif", fontSize: 12, color: '#e74c3c',
                  letterSpacing: .5,
                }}>⚠️ {error}</div>
              )}

              {/* Submit */}
              <button onClick={submit} disabled={loading || !email} style={{
                width: '100%', padding: '14px',
                background: !email || loading
                  ? '#1e2d47'
                  : 'linear-gradient(135deg, #d4a828, #f0c94a)',
                border: 'none', borderRadius: 8, cursor: !email ? 'not-allowed' : 'pointer',
                fontFamily: "'Anton', sans-serif",
                fontSize: 15, letterSpacing: 2, textTransform: 'uppercase',
                color: !email || loading ? '#4a5d7a' : '#05080f',
                transition: 'all .2s',
                marginBottom: 16,
              }}>
                {loading ? '...' : mode === 'magic'
                  ? 'Send Magic Link'
                  : mode === 'signup'
                  ? 'Create Account'
                  : 'Sign In'}
              </button>

              <p style={{
                textAlign: 'center',
                fontFamily: "'Oswald', sans-serif",
                fontSize: 11, color: '#4a5d7a', letterSpacing: .5,
              }}>
                {mode === 'magic' && 'No password needed. We\'ll email you a one-click login link.'}
                {mode === 'password' && (
                  <span>
                    Forgot password?{' '}
                    <button onClick={() => setMode('magic')} style={{
                      background: 'none', border: 'none', color: '#d4a828',
                      cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
                    }}>Use magic link instead</button>
                  </span>
                )}
                {mode === 'signup' && (
                  <span>
                    Already have an account?{' '}
                    <button onClick={() => setMode('magic')} style={{
                      background: 'none', border: 'none', color: '#d4a828',
                      cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
                    }}>Sign in</button>
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(12px) scale(.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </>
  );
}

// ── Shared input styles ──────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: '#05080f',
  border: '1px solid #1e2d47',
  borderRadius: 8,
  color: '#e8edf5',
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  outline: 'none',
  transition: 'border-color .15s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Oswald', sans-serif",
  fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
  color: '#4a5d7a', marginBottom: 6,
};
