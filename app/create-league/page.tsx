'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { CONFERENCES } from '@/lib/playerPool';

const C = {
  bg:    '#070a12',
  surf:  '#0c1422',
  surf2: '#131d30',
  surf3: '#1e2d47',
  gold:  '#f5a623',
  text:  '#e4edf7',
  sub:   '#7a90aa',
  muted: '#3e5470',
  green: '#15c678',
  red:   '#f03a5a',
  border:'#1e2d47',
};

const BUYIN_PRESETS = [0, 1, 5, 10, 25, 50];
const TIME_OPTIONS  = ['30s', '1min', '2min', '5min', 'No limit'];
const CAP_PRESETS   = [100, 150, 200, 250];

function genCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, letterSpacing: 2, color: C.sub, textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, maxLength, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; type?: string;
}) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} maxLength={maxLength}
      style={{ width: '100%', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, padding: '11px 14px', outline: 'none', boxSizing: 'border-box' }}
    />
  );
}

function PresetRow({ values, selected, onSelect, format }: {
  values: number[]; selected: number; onSelect: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {values.map(v => (
        <button key={v} onClick={() => onSelect(v)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${selected === v ? C.gold : C.surf3}`, background: selected === v ? 'rgba(245,166,35,.12)' : C.surf2, color: selected === v ? C.gold : C.sub, fontFamily: 'Oswald, sans-serif', fontSize: 12, letterSpacing: 1, cursor: 'pointer', transition: 'all .12s' }}>
          {format(v)}
        </button>
      ))}
    </div>
  );
}

function CommBadge() {
  return (
    <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, letterSpacing: 1, background: 'rgba(245,166,35,.1)', border: `1px solid ${C.gold}44`, borderRadius: 4, padding: '3px 8px', color: C.gold }}>
      🔒 Commissioner Settings
    </span>
  );
}

function ProgressBar({ step }: { step: number }) {
  const labels = ['General', 'Draft', 'Your Team', 'Review'];
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
        {labels.map((label, i) => {
          const active   = i + 1 === step;
          const complete = i + 1 < step;
          return (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '100%', height: 3, background: complete || active ? C.gold : C.surf3, transition: 'background .2s', borderRadius: i === 0 ? '3px 0 0 3px' : i === 3 ? '0 3px 3px 0' : 0 }} />
              <div style={{ marginTop: 6, fontFamily: 'Oswald, sans-serif', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: active ? C.gold : complete ? C.sub : C.muted }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogoUpload({ bucket, userId, label, preview, onUpload }: {
  bucket: string; userId: string; label: string; preview: string | null; onUpload: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${userId}/${Date.now()}.jpg`;
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (!error && data) {
      const url = supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;
      onUpload(url);
    }
    setUploading(false);
  }

  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {preview && (
          <img src={preview} alt="preview" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.surf3}` }} />
        )}
        <button onClick={() => ref.current?.click()} style={{ padding: '9px 18px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 1, color: C.sub, textTransform: 'uppercase' }}>
          {uploading ? 'Uploading…' : preview ? 'Change Image' : '+ Upload Image'}
        </button>
        <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>Optional</span>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}

// ── School Picker ─────────────────────────────────────────────────────────────

function SchoolPicker({ selected, onChange }: { selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const confs = Object.entries(CONFERENCES) as [string, string[]][];

  function toggleConf(conf: string, schools: string[]) {
    const next = new Set(selected);
    const allIn = schools.every(s => next.has(s));
    if (allIn) schools.forEach(s => next.delete(s));
    else       schools.forEach(s => next.add(s));
    onChange(next);
  }

  function toggleSchool(school: string) {
    const next = new Set(selected);
    if (next.has(school)) next.delete(school); else next.add(school);
    onChange(next);
  }

  return (
    <div>
      <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1, marginBottom: 12 }}>
        {selected.size} school{selected.size !== 1 ? 's' : ''} selected
        {selected.size > 0 && selected.size < 4 && (
          <span style={{ color: C.red, marginLeft: 8 }}>(minimum 4 required)</span>
        )}
      </div>
      {confs.map(([conf, schools]) => {
        const allIn = schools.every(s => selected.has(s));
        const someIn = schools.some(s => selected.has(s));
        return (
          <div key={conf} style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={allIn}
                ref={el => { if (el) el.indeterminate = someIn && !allIn; }}
                onChange={() => toggleConf(conf, schools)}
                style={{ accentColor: C.gold, width: 14, height: 14 }}
              />
              <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, letterSpacing: 1, color: C.gold, textTransform: 'uppercase' }}>{conf}</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 22 }}>
              {schools.map(school => (
                <label key={school} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minWidth: 140 }}>
                  <input
                    type="checkbox"
                    checked={selected.has(school)}
                    onChange={() => toggleSchool(school)}
                    style={{ accentColor: C.gold, width: 12, height: 12 }}
                  />
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: selected.has(school) ? C.text : C.sub }}>{school}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreateLeaguePage() {
  const router = useRouter();
  const [userId,     setUserId]     = useState('');
  const [step,       setStep]       = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Step 1
  const [leagueName,   setLeagueName]   = useState('');
  const [leagueLogo,   setLeagueLogo]   = useState<string | null>(null);
  const [entries,      setEntries]      = useState(8);
  const [buyIn,        setBuyIn]        = useState(0);
  const [customBuyIn,  setCustomBuyIn]  = useState('');
  const [inviteCode]                    = useState(genCode);

  // Step 2
  const [draftType,    setDraftType]    = useState<'snake' | 'salary'>('snake');
  const [salaryCap,    setSalaryCap]    = useState(200);
  const [customCap,    setCustomCap]    = useState('');
  const [timePick,     setTimePick]     = useState('2min');
  const [schools,      setSchools]      = useState<Set<string>>(new Set());

  // Step 3
  const [teamName,     setTeamName]     = useState('');
  const [teamLogo,     setTeamLogo]     = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return; }
      setUserId(user.id);
    });
  }, [router]);

  const effectiveBuyIn  = customBuyIn ? parseFloat(customBuyIn) || 0 : buyIn;
  const effectiveCap    = customCap   ? parseInt(customCap)     || 200 : salaryCap;
  const allSchools      = Object.values(CONFERENCES).flat();

  // Step validation
  const step1Valid = leagueName.trim().length >= 3 && entries >= 4;
  const step2Valid = schools.size >= 4 || draftType === 'snake';
  const step3Valid = teamName.trim().length >= 2;

  function canNext() {
    if (step === 1) return step1Valid;
    if (step === 2) return step2Valid;
    if (step === 3) return step3Valid;
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const allowedSchools = schools.size > 0
        ? Array.from(schools)
        : draftType === 'salary' ? allSchools : null;

      const res = await fetch('/api/leagues/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:        leagueName.trim(),
          buy_in:      effectiveBuyIn,
          league_size: entries,
          draft_type:  draftType,
          salary_cap:  draftType === 'salary' ? effectiveCap : null,
          is_public:   false,
          league_type: 'season',
          team_name:   teamName.trim(),
          invite_code: inviteCode,
          settings: {
            allowed_schools:  allowedSchools,
            league_logo_url:  leagueLogo,
            team_logo_url:    teamLogo,
            time_per_pick:    timePick,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create league'); setSubmitting(false); return; }
      const leagueId = data.leagues?.[0]?.id;
      router.push(leagueId ? `/league/${leagueId}` : '/my-leagues');
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
      setSubmitting(false);
    }
  }

  const card: React.CSSProperties = { background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, padding: '28px 32px', marginBottom: 20 };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 16px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button onClick={() => router.push('/my-leagues')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>
            ← Back
          </button>
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: 2, color: C.text, textTransform: 'uppercase' }}>
            Create League
          </div>
          <div style={{ width: 60 }} />
        </div>

        <ProgressBar step={step} />

        {/* ── STEP 1: General Settings ─────────────────────────────────────── */}
        {step === 1 && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 1, color: C.text, textTransform: 'uppercase' }}>General Settings</div>
              <CommBadge />
            </div>

            {/* League Type — locked */}
            <div style={{ marginBottom: 20 }}>
              <Label>League Type</Label>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(245,166,35,.08)', border: `1px solid ${C.gold}44`, borderRadius: 8, padding: '10px 16px' }}>
                <span style={{ fontSize: 16 }}>🏈</span>
                <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 13, color: C.gold, letterSpacing: 1 }}>Season Long</span>
                <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1 }}>🔒 LOCKED</span>
              </div>
            </div>

            {/* League Name */}
            <div style={{ marginBottom: 20 }}>
              <Label>League Name</Label>
              <Input value={leagueName} onChange={setLeagueName} placeholder="Enter league name…" maxLength={40} />
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginTop: 4 }}>{leagueName.length}/40</div>
            </div>

            {/* League Logo */}
            <div style={{ marginBottom: 20 }}>
              {userId && (
                <LogoUpload bucket="league-logos" userId={userId} label="League Logo" preview={leagueLogo} onUpload={setLeagueLogo} />
              )}
            </div>

            {/* Entries */}
            <div style={{ marginBottom: 20 }}>
              <Label>Number of Entries (min 4)</Label>
              <input
                type="number" min={4} value={entries}
                onChange={e => setEntries(Math.max(4, parseInt(e.target.value) || 4))}
                style={{ width: '100%', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, padding: '11px 14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Entry Fee */}
            <div style={{ marginBottom: 20 }}>
              <Label>Entry Fee</Label>
              <PresetRow
                values={BUYIN_PRESETS}
                selected={customBuyIn ? -1 : buyIn}
                onSelect={v => { setBuyIn(v); setCustomBuyIn(''); }}
                format={v => v === 0 ? 'Free' : `$${v}`}
              />
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub }}>Custom:</span>
                <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, border: `1px solid ${customBuyIn ? C.gold : C.surf3}`, borderRadius: 8, overflow: 'hidden', width: 120 }}>
                  <span style={{ padding: '0 10px', fontFamily: 'Anton, sans-serif', color: C.muted }}>$</span>
                  <input
                    type="number" min={0} placeholder="0.00"
                    value={customBuyIn} onChange={e => setCustomBuyIn(e.target.value)}
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, padding: '10px 10px 10px 0' }}
                  />
                </div>
              </div>
            </div>

            {/* Invite Code */}
            <div style={{ marginBottom: 4 }}>
              <Label>Private Invite Code</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '11px 16px', fontFamily: 'Anton, sans-serif', fontSize: 22, letterSpacing: 4, color: C.gold }}>
                  {inviteCode}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(inviteCode)}
                  style={{ padding: '10px 16px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 10, letterSpacing: 1, color: C.sub, textTransform: 'uppercase' }}
                >
                  Copy
                </button>
              </div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginTop: 6 }}>Share this code with players to invite them to your league.</div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Draft Settings ───────────────────────────────────────── */}
        {step === 2 && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 1, color: C.text, textTransform: 'uppercase' }}>Draft Settings</div>
              <CommBadge />
            </div>

            {/* Draft Format */}
            <div style={{ marginBottom: 24 }}>
              <Label>Draft Format</Label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(['snake', 'salary'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setDraftType(type)}
                    style={{ padding: '18px 16px', background: draftType === type ? 'rgba(245,166,35,.1)' : C.surf2, border: `2px solid ${draftType === type ? C.gold : C.surf3}`, borderRadius: 10, cursor: 'pointer', textAlign: 'center', transition: 'all .15s' }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{type === 'snake' ? '🐍' : '💰'}</div>
                    <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 14, letterSpacing: 1, color: draftType === type ? C.gold : C.text, textTransform: 'uppercase' }}>
                      {type === 'snake' ? 'Snake Draft' : 'Salary Cap'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Salary Cap Budget (salary only) */}
            {draftType === 'salary' && (
              <div style={{ marginBottom: 20 }}>
                <Label>Salary Cap Budget</Label>
                <PresetRow
                  values={CAP_PRESETS}
                  selected={customCap ? -1 : salaryCap}
                  onSelect={v => { setSalaryCap(v); setCustomCap(''); }}
                  format={v => `$${v}`}
                />
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub }}>Custom:</span>
                  <div style={{ display: 'flex', alignItems: 'center', background: C.surf2, border: `1px solid ${customCap ? C.gold : C.surf3}`, borderRadius: 8, overflow: 'hidden', width: 120 }}>
                    <span style={{ padding: '0 10px', fontFamily: 'Anton, sans-serif', color: C.muted }}>$</span>
                    <input
                      type="number" min={50} placeholder="200"
                      value={customCap} onChange={e => setCustomCap(e.target.value)}
                      style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, padding: '10px 10px 10px 0' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Time per pick */}
            <div style={{ marginBottom: 24 }}>
              <Label>Time Per Pick</Label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TIME_OPTIONS.map(t => (
                  <button key={t} onClick={() => setTimePick(t)} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${timePick === t ? C.gold : C.surf3}`, background: timePick === t ? 'rgba(245,166,35,.12)' : C.surf2, color: timePick === t ? C.gold : C.sub, fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 1, cursor: 'pointer', transition: 'all .12s' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* School Picker (salary only) */}
            {draftType === 'salary' && (
              <div>
                <Label>Team Pool — Select Schools</Label>
                <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '16px', maxHeight: 360, overflowY: 'auto' }}>
                  <SchoolPicker selected={schools} onChange={setSchools} />
                </div>
                {schools.size > 0 && schools.size < 4 && (
                  <div style={{ marginTop: 8, fontFamily: 'Oswald, sans-serif', fontSize: 10, color: C.red, letterSpacing: 1 }}>
                    Select at least 4 schools to continue.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Your Team ────────────────────────────────────────────── */}
        {step === 3 && (
          <div style={card}>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 1, color: C.text, textTransform: 'uppercase', marginBottom: 24 }}>Your Team</div>

            <div style={{ marginBottom: 20 }}>
              <Label>Team Name</Label>
              <Input value={teamName} onChange={setTeamName} placeholder="Enter your team name…" maxLength={32} />
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, color: C.muted, letterSpacing: 1, marginTop: 4 }}>{teamName.length}/32</div>
            </div>

            {userId && (
              <div style={{ marginBottom: 20 }}>
                <LogoUpload bucket="team-logos" userId={userId} label="Team Logo" preview={teamLogo} onUpload={setTeamLogo} />
              </div>
            )}

            <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '12px 16px', fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: C.sub }}>
              💡 You can change your team name and logo at any time from your league settings.
            </div>
          </div>
        )}

        {/* ── STEP 4: Review ──────────────────────────────────────────────── */}
        {step === 4 && (
          <div style={card}>
            <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 1, color: C.text, textTransform: 'uppercase', marginBottom: 24 }}>Review & Create</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {[
                ['League Name', leagueName],
                ['Entry Fee', effectiveBuyIn === 0 ? 'Free' : `$${effectiveBuyIn.toFixed(2)}`],
                ['Entries', String(entries)],
                ['Prize Pool (est.)', effectiveBuyIn === 0 ? '—' : `$${(effectiveBuyIn * entries * 0.9).toFixed(2)}`],
                ['Draft Format', draftType === 'snake' ? '🐍 Snake Draft' : '💰 Salary Cap'],
                ['Time Per Pick', timePick],
                ['Your Team', teamName],
                ['Schools', draftType === 'salary' ? `${schools.size > 0 ? schools.size : 'All'} schools` : 'All D1'],
              ].map(([label, value]) => (
                <div key={label} style={{ background: C.surf2, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: C.text }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Invite Code */}
            <div style={{ background: 'rgba(245,166,35,.07)', border: `1px solid ${C.gold}33`, borderRadius: 10, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>Invite Code</div>
                <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 28, letterSpacing: 5, color: C.gold }}>{inviteCode}</div>
              </div>
              <button onClick={() => navigator.clipboard.writeText(inviteCode)} style={{ padding: '9px 16px', background: 'none', border: `1px solid ${C.gold}44`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 10, letterSpacing: 1, color: C.gold, textTransform: 'uppercase' }}>
                Copy
              </button>
            </div>

            {/* Logos */}
            {(leagueLogo || teamLogo) && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                {leagueLogo && <div><div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, color: C.muted, marginBottom: 6 }}>LEAGUE LOGO</div><img src={leagueLogo} alt="league" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.surf3}` }} /></div>}
                {teamLogo   && <div><div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, color: C.muted, marginBottom: 6 }}>TEAM LOGO</div><img src={teamLogo} alt="team" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.surf3}` }} /></div>}
              </div>
            )}

            {error && (
              <div style={{ padding: '12px 16px', background: C.red + '18', border: `1px solid ${C.red}44`, borderRadius: 8, fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: C.red, marginBottom: 16 }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── Nav Buttons ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : router.push('/my-leagues')}
            style={{ padding: '13px 28px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 12, letterSpacing: 2, color: C.sub, textTransform: 'uppercase' }}
          >
            {step > 1 ? '← Back' : 'Cancel'}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              style={{ padding: '13px 36px', background: canNext() ? C.gold : C.surf3, border: 'none', borderRadius: 10, cursor: canNext() ? 'pointer' : 'not-allowed', fontFamily: 'Anton, sans-serif', fontSize: 14, letterSpacing: 2, color: canNext() ? C.bg : C.muted, textTransform: 'uppercase', transition: 'all .15s' }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ padding: '13px 36px', background: submitting ? C.surf3 : C.gold, border: 'none', borderRadius: 10, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Anton, sans-serif', fontSize: 14, letterSpacing: 2, color: submitting ? C.muted : C.bg, textTransform: 'uppercase', transition: 'all .15s' }}
            >
              {submitting ? 'Creating…' : '🏈 Create League'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
