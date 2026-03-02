'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import type { CreateLeagueFormData } from '@/types';

const BUY_INS  = [0, 10, 25, 50];
const SIZES    = [4, 6, 8, 10, 12];

const C = {
  bg:'#05080f', surf:'#0c1220', surf2:'#131d30', surf3:'#1e2d47',
  gold:'#d4a828', goldLight:'#f0c94a', muted:'#4a5d7a',
  text:'#e8edf5', sub:'#7a90b0', red:'#e74c3c', green:'#2ecc71',
};

type Step = 1 | 2 | 3 | 4;

export function CreateLeagueWizard() {
  const router = useRouter();
  const [step, setStep]   = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [createdLeague, setCreatedLeague] = useState<{ id: string; invite_code: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState<CreateLeagueFormData>({
    name:        '',
    buy_in:      0,
    league_size: 8,
    draft_type:  'snake',
    salary_cap:  200,
    team_name:   '',
  });

  function set<K extends keyof CreateLeagueFormData>(k: K, v: CreateLeagueFormData[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleCreate() {
    setLoading(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('You must be signed in.'); setLoading(false); return; }

    const { data, error: dbError } = await supabase
      .from('leagues')
      .insert({
        name:            form.name.trim(),
        commissioner_id: user.id,
        buy_in:          form.buy_in,
        league_size:     form.league_size,
        draft_type:      form.draft_type,
        salary_cap:      form.salary_cap,
        invite_code:     '',   // trigger fills this in
        status:          'forming',
      })
      .select('id, invite_code, name')
      .single();

    if (dbError || !data) {
      setError(dbError?.message || 'Failed to create league.');
      setLoading(false); return;
    }

    // Add commissioner as first member
    await supabase.from('league_members').insert({
      league_id: data.id,
      user_id:   user.id,
      team_name: form.team_name.trim() || 'My Team',
      draft_slot: 1,
    });

    setCreatedLeague(data);
    setStep(4);
    setLoading(false);
  }

  const inviteUrl = createdLeague
    ? `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/join/${createdLeague.invite_code}`
    : '';

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const canProceed1 = form.name.trim().length >= 3;
  const canProceed2 = form.team_name.trim().length >= 2;

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', padding: '40px 20px',
    }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .wiz-step { animation: slideIn .25s ease; }
        input:focus, textarea:focus { outline: none !important; border-color: ${C.gold} !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{
          fontFamily: "'Anton', sans-serif", fontSize: 11,
          letterSpacing: 4, color: C.gold, textTransform: 'uppercase',
          marginBottom: 10,
        }}>🏈 League Setup</div>
        <h1 style={{
          fontFamily: "'Anton', sans-serif", fontSize: 36,
          letterSpacing: 1.5, color: C.text, textTransform: 'uppercase',
          lineHeight: 1,
        }}>Create Your League</h1>
      </div>

      {/* ── Progress bar ── */}
      {step < 4 && (
        <div style={{ marginBottom: 36 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            {(['League Settings', 'Your Team', 'Review'].map((label, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', margin: '0 auto 6px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Anton', sans-serif", fontSize: 13,
                  background: step > i+1 ? C.green : step === i+1 ? C.gold : C.surf3,
                  color: step > i+1 ? '#fff' : step === i+1 ? C.bg : C.muted,
                  transition: 'all .3s',
                }}>
                  {step > i+1 ? '✓' : i+1}
                </div>
                <div style={{
                  fontFamily: "'Oswald', sans-serif", fontSize: 9,
                  letterSpacing: 2, textTransform: 'uppercase',
                  color: step === i+1 ? C.gold : C.muted,
                }}>{label}</div>
              </div>
            )))}
          </div>
          <div style={{ height: 2, background: C.surf3, borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight})`,
              width: `${((step - 1) / 2) * 100}%`,
              transition: 'width .4s ease',
            }} />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 1 — League Settings
      ══════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="wiz-step">
          <Card>
            <FieldLabel>League Name</FieldLabel>
            <input
              type="text"
              placeholder="e.g. Saturday Legends 2026"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              maxLength={40}
              style={inputStyle}
            />
            <div style={{
              textAlign: 'right', fontSize: 11,
              color: C.muted, marginTop: 4, fontFamily: "'Oswald', sans-serif",
            }}>{form.name.length}/40</div>

            <Spacer />

            <FieldLabel>League Size</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {SIZES.map(n => (
                <ToggleBtn key={n} active={form.league_size === n} onClick={() => set('league_size', n)}>
                  {n} teams
                </ToggleBtn>
              ))}
            </div>
            <div style={{
              marginTop: 8, fontFamily: "'Oswald', sans-serif",
              fontSize: 11, color: C.muted, letterSpacing: .5,
            }}>
              {form.league_size <= 6
                ? '⚡ Small league — faster drafts, more personal'
                : form.league_size <= 8
                ? '⚖️ Standard size — most competitive balance'
                : '🏟️ Large league — deep rosters, full waiver wire'}
            </div>

            <Spacer />

            <FieldLabel>Buy-In Amount</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {BUY_INS.map(n => (
                <ToggleBtn key={n} active={form.buy_in === n} onClick={() => set('buy_in', n)}>
                  {n === 0 ? 'Free' : `$${n}`}
                </ToggleBtn>
              ))}
            </div>
            {form.buy_in > 0 && (
              <div style={{
                marginTop: 10, padding: '10px 14px',
                background: 'rgba(212,168,40,.08)', border: '1px solid rgba(212,168,40,.2)',
                borderRadius: 8, fontFamily: "'Oswald', sans-serif",
                fontSize: 12, color: C.sub, letterSpacing: .5,
              }}>
                🏆 Winner takes <strong style={{ color: C.gold }}>
                  ${form.buy_in * form.league_size}
                </strong> (${form.buy_in} × {form.league_size} teams).
                Stripe payment link added after league fills.
              </div>
            )}

            <Spacer />

            <FieldLabel>Draft Type</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <ToggleBtn active={form.draft_type === 'snake'} onClick={() => set('draft_type', 'snake')}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>🐍</div>
                <strong>Snake Draft</strong>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  Pick order reverses each round
                </div>
              </ToggleBtn>
              <ToggleBtn active={form.draft_type === 'salary'} onClick={() => set('draft_type', 'salary')}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>💰</div>
                <strong>Salary Cap</strong>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  ${form.salary_cap} cap · bid on players
                </div>
              </ToggleBtn>
            </div>
          </Card>

          <NavRow>
            <div />
            <PrimaryBtn disabled={!canProceed1} onClick={() => setStep(2)}>
              Next: Your Team →
            </PrimaryBtn>
          </NavRow>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 2 — Team Name
      ══════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="wiz-step">
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
              <div style={{
                fontFamily: "'Oswald', sans-serif", fontSize: 13,
                color: C.sub, letterSpacing: .5,
              }}>
                You're the commissioner of <strong style={{ color: C.gold }}>{form.name}</strong>.
                What's your team called?
              </div>
            </div>

            <FieldLabel>Your Team Name</FieldLabel>
            <input
              type="text"
              placeholder="e.g. Tuscaloosa Tide Riders"
              value={form.team_name}
              onChange={e => set('team_name', e.target.value)}
              maxLength={32}
              autoFocus
              style={{ ...inputStyle, fontSize: 18, textAlign: 'center', padding: '16px' }}
            />
            <div style={{
              textAlign: 'right', fontSize: 11,
              color: C.muted, marginTop: 4, fontFamily: "'Oswald', sans-serif",
            }}>{form.team_name.length}/32</div>

            <div style={{
              marginTop: 20, padding: '12px 16px',
              background: C.surf2, borderRadius: 8,
              fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.sub,
              letterSpacing: .5, lineHeight: 1.7,
            }}>
              <strong style={{ color: C.text }}>As commissioner you can:</strong><br/>
              Set the draft order · Kick members · Start the draft when ready
            </div>
          </Card>

          <NavRow>
            <GhostBtn onClick={() => setStep(1)}>← Back</GhostBtn>
            <PrimaryBtn disabled={!canProceed2} onClick={() => setStep(3)}>
              Next: Review →
            </PrimaryBtn>
          </NavRow>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 3 — Review & Create
      ══════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="wiz-step">
          <Card>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18,
              letterSpacing: 1, color: C.text, textTransform: 'uppercase',
              marginBottom: 20 }}>
              Review League Settings
            </div>

            {[
              ['League Name', form.name],
              ['League Size', `${form.league_size} teams`],
              ['Buy-In',      form.buy_in === 0 ? 'Free' : `$${form.buy_in} per team · $${form.buy_in * form.league_size} total pot`],
              ['Draft Type',  form.draft_type === 'snake' ? '🐍 Snake Draft' : `💰 Salary Cap ($${form.salary_cap})`],
              ['Your Team',   form.team_name],
              ['Season',      'Weeks 1–10 regular season · 6-team playoff (Wks 11–13)'],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: `1px solid ${C.surf3}`,
                gap: 16,
              }}>
                <span style={{ fontFamily: "'Oswald', sans-serif",
                  fontSize: 12, color: C.muted, letterSpacing: 1,
                  textTransform: 'uppercase', flexShrink: 0 }}>{k}</span>
                <span style={{ fontFamily: "'Oswald', sans-serif",
                  fontSize: 13, color: C.text, textAlign: 'right' }}>{v}</span>
              </div>
            ))}

            {error && (
              <div style={{
                marginTop: 16, padding: '10px 14px',
                background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)',
                borderRadius: 6, fontFamily: "'Oswald', sans-serif",
                fontSize: 12, color: C.red,
              }}>⚠️ {error}</div>
            )}
          </Card>

          <NavRow>
            <GhostBtn onClick={() => setStep(2)}>← Back</GhostBtn>
            <PrimaryBtn onClick={handleCreate} disabled={loading}>
              {loading ? '⏳ Creating...' : '🚀 Create League'}
            </PrimaryBtn>
          </NavRow>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STEP 4 — League Created! Share Invite
      ══════════════════════════════════════════════ */}
      {step === 4 && createdLeague && (
        <div className="wiz-step">

          {/* Success banner */}
          <div style={{
            textAlign: 'center', padding: '32px 24px',
            background: 'linear-gradient(135deg,rgba(46,204,113,.1),rgba(46,204,113,.03))',
            border: '1px solid rgba(46,204,113,.3)', borderRadius: 12,
            marginBottom: 24, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, transparent, ${C.green}, transparent)` }} />
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 28,
              letterSpacing: 1.5, color: C.green, textTransform: 'uppercase',
              marginBottom: 8 }}>League Is Live!</div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14,
              color: C.sub, letterSpacing: .5 }}>
              <strong style={{ color: C.text }}>{createdLeague.name}</strong> is ready.
              Share the link below to invite your league mates.
            </div>
          </div>

          {/* Invite link card */}
          <Card>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11,
              color: C.muted, letterSpacing: 2, textTransform: 'uppercase',
              marginBottom: 10 }}>Your Invite Link</div>

            {/* URL display */}
            <div style={{
              display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center',
            }}>
              <div style={{
                flex: 1, padding: '12px 14px',
                background: C.bg, border: `1px solid ${C.surf3}`,
                borderRadius: 8, fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 13, color: C.gold,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{inviteUrl}</div>
              <button onClick={copyLink} style={{
                padding: '12px 18px', flexShrink: 0,
                background: copied
                  ? 'rgba(46,204,113,.2)'
                  : 'linear-gradient(135deg, #d4a828, #f0c94a)',
                border: copied ? '1px solid rgba(46,204,113,.4)' : 'none',
                borderRadius: 8, cursor: 'pointer',
                fontFamily: "'Anton', sans-serif", fontSize: 12,
                letterSpacing: 2, textTransform: 'uppercase',
                color: copied ? C.green : C.bg,
                transition: 'all .2s',
              }}>
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>

            {/* Invite code */}
            <div style={{
              textAlign: 'center', padding: '16px',
              background: C.bg, border: `1px solid ${C.surf3}`,
              borderRadius: 8, marginBottom: 16,
            }}>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10,
                color: C.muted, letterSpacing: 2, textTransform: 'uppercase',
                marginBottom: 6 }}>Invite Code</div>
              <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 32,
                letterSpacing: 8, color: C.gold }}>
                {createdLeague.invite_code}
              </div>
            </div>

            {/* Share buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                {
                  label: '📱 iMessage',
                  href: `sms:?body=Join my College Units Fantasy league! ${inviteUrl}`,
                },
                {
                  label: '💬 WhatsApp',
                  href: `https://wa.me/?text=${encodeURIComponent(`Join my College Units Fantasy league! ${inviteUrl}`)}`,
                },
                {
                  label: '📧 Email',
                  href: `mailto:?subject=Join my CFB Fantasy League&body=${encodeURIComponent(`Hey!\n\nJoin my College Units Fantasy league: ${inviteUrl}\n\nUse invite code: ${createdLeague.invite_code}`)}`,
                },
              ].map(({ label, href }) => (
                <a key={label} href={href} target="_blank" rel="noreferrer" style={{
                  display: 'block', textAlign: 'center',
                  padding: '10px 8px',
                  background: C.surf2, border: `1px solid ${C.surf3}`,
                  borderRadius: 8, textDecoration: 'none',
                  fontFamily: "'Oswald', sans-serif", fontSize: 11,
                  letterSpacing: 1, color: C.sub,
                  transition: 'all .15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = C.gold;
                  e.currentTarget.style.color = C.text;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.surf3;
                  e.currentTarget.style.color = C.sub;
                }}
                >{label}</a>
              ))}
            </div>
          </Card>

          {/* Members counter */}
          <div style={{
            marginTop: 16, padding: '14px 18px',
            background: C.surf2, border: `1px solid ${C.surf3}`,
            borderRadius: 10, textAlign: 'center',
          }}>
            <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: C.sub }}>
              Spots filled:{' '}
              <strong style={{ color: C.text, fontSize: 20, fontFamily: "'Anton', sans-serif" }}>1</strong>
              <span style={{ color: C.muted }}> / {form.league_size}</span>
            </span>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10,
              color: C.muted, letterSpacing: 1, marginTop: 4 }}>
              Draft opens once all spots are filled
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <PrimaryBtn onClick={() => router.push(`/league/${createdLeague.id}`)}>
              Go to League Dashboard →
            </PrimaryBtn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#0c1220', border: '1px solid #1e2d47',
      borderRadius: 12, padding: '24px',
      marginBottom: 16, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, #d4a828, transparent)' }} />
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Oswald', sans-serif", fontSize: 11,
      letterSpacing: 2, textTransform: 'uppercase',
      color: '#4a5d7a', marginBottom: 8,
    }}>{children}</div>
  );
}

function Spacer() {
  return <div style={{ height: 24 }} />;
}

function ToggleBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 8px', border: `2px solid ${active ? '#d4a828' : '#1e2d47'}`,
      borderRadius: 8, cursor: 'pointer', textAlign: 'center',
      background: active
        ? 'linear-gradient(135deg, rgba(212,168,40,.15), rgba(212,168,40,.05))'
        : '#05080f',
      color: active ? '#f0c94a' : '#7a90b0',
      fontFamily: "'Oswald', sans-serif", fontSize: 12,
      letterSpacing: .5, transition: 'all .15s',
    }}>{children}</button>
  );
}

function PrimaryBtn({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', padding: '15px',
      background: disabled
        ? '#1e2d47'
        : 'linear-gradient(135deg, #d4a828, #f0c94a)',
      border: 'none', borderRadius: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: "'Anton', sans-serif",
      fontSize: 15, letterSpacing: 2, textTransform: 'uppercase',
      color: disabled ? '#4a5d7a' : '#05080f',
      transition: 'all .2s',
    }}>{children}</button>
  );
}

function GhostBtn({ onClick, children }: {
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '15px 24px', background: 'none',
      border: '1px solid #1e2d47', borderRadius: 8, cursor: 'pointer',
      fontFamily: "'Oswald', sans-serif", fontSize: 12,
      letterSpacing: 2, textTransform: 'uppercase',
      color: '#7a90b0', transition: 'all .15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4a828'; e.currentTarget.style.color = '#d4a828'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d47'; e.currentTarget.style.color = '#7a90b0'; }}
    >{children}</button>
  );
}

function NavRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px',
  background: '#05080f', border: '1px solid #1e2d47',
  borderRadius: 8, color: '#e8edf5',
  fontFamily: "'Inter', sans-serif", fontSize: 15,
  outline: 'none', transition: 'border-color .15s',
};
