'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', border: '#1e2d47',
  text: '#e8edf5', sub: '#7a90b0', muted: '#4a5d7a',
  gold: '#d4a828', goldLight: '#f0c94a',
  green: '#2ecc71', red: '#e74c3c',
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [success,         setSuccess]         = useState(false);
  const [sessionReady,    setSessionReady]    = useState(false);

  useEffect(() => {
    // Supabase exchanges the token from the URL hash automatically on load.
    // Wait for the auth state change that signals the recovery session is active.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setSessionReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleReset() {
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push('/'), 2500);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 14px',
    background: C.surf2, border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.text,
    fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
    outline: 'none', marginBottom: 12,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 420, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#0a1020,#05080f)', padding: '28px 28px 24px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <img src="/logo.png" alt="CUF" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span style={{ fontFamily: 'Anton,sans-serif', fontSize: 12, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
              College Units Fantasy
            </span>
          </div>
          <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 22, letterSpacing: 2, color: C.text, textTransform: 'uppercase', marginBottom: 6 }}>
            Set New Password
          </div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.5 }}>
            Choose a new password for your account.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '28px' }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
              <div style={{ fontFamily: 'Anton,sans-serif', fontSize: 18, color: C.green, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Password Updated
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
                Your password has been updated successfully. Redirecting you to the homepage…
              </div>
            </div>
          ) : !sessionReady ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontFamily: 'Oswald,sans-serif', fontSize: 12, color: C.muted, letterSpacing: 1 }}>
                Verifying reset link…
              </div>
            </div>
          ) : (
            <>
              <input
                style={inputStyle}
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleReset(); }}
              />
              <input
                style={{ ...inputStyle, marginBottom: 16 }}
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleReset(); }}
              />
              {error && (
                <div style={{ color: C.red, fontFamily: 'Oswald,sans-serif', fontSize: 12, marginBottom: 14 }}>{error}</div>
              )}
              <button
                onClick={handleReset}
                disabled={loading}
                style={{
                  width: '100%', padding: '14px',
                  background: `linear-gradient(135deg,${C.gold},${C.goldLight})`,
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'Anton,sans-serif', fontSize: 14, letterSpacing: 2,
                  color: C.bg, textTransform: 'uppercase',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
