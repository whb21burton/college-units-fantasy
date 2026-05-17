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

type PayoutStructure = 'winner_take_all' | 'top2' | 'top3' | 'custom';
type PayoutSplit = { place: number; label: string; pct: number; amount: number };

const PAYOUT_PRESETS: { key: PayoutStructure; label: string; desc: string; splits: (net: number) => PayoutSplit[] }[] = [
  {
    key: 'winner_take_all',
    label: 'Winner Take All',
    desc: '1st place wins everything',
    splits: (net) => [{ place: 1, label: '1st', pct: 100, amount: net }],
  },
  {
    key: 'top2',
    label: 'Top 2',
    desc: '70% / 30%',
    splits: (net) => [
      { place: 1, label: '1st', pct: 70, amount: net * 0.70 },
      { place: 2, label: '2nd', pct: 30, amount: net * 0.30 },
    ],
  },
  {
    key: 'top3',
    label: 'Top 3',
    desc: '60% / 25% / 15%',
    splits: (net) => [
      { place: 1, label: '1st', pct: 60, amount: net * 0.60 },
      { place: 2, label: '2nd', pct: 25, amount: net * 0.25 },
      { place: 3, label: '3rd', pct: 15, amount: net * 0.15 },
    ],
  },
];

type RosterPos = 'QB' | 'RB' | 'WR' | 'TE' | 'DEF' | 'K' | 'BENCH';
type RosterConfig = { [K in RosterPos]: { enabled: boolean; count: number } };

const ROSTER_POSITIONS: { key: RosterPos; emoji: string; max: number }[] = [
  { key: 'QB',    emoji: '🏈', max: 4 },
  { key: 'RB',    emoji: '🏃', max: 4 },
  { key: 'WR',    emoji: '📡', max: 4 },
  { key: 'TE',    emoji: '🎯', max: 4 },
  { key: 'DEF',   emoji: '🛡️', max: 4 },
  { key: 'K',     emoji: '👟', max: 4 },
  { key: 'BENCH', emoji: '🪑', max: 8 },
];

const DEFAULT_ROSTER: RosterConfig = {
  QB:    { enabled: true, count: 1 },
  RB:    { enabled: true, count: 2 },
  WR:    { enabled: true, count: 2 },
  TE:    { enabled: true, count: 1 },
  DEF:   { enabled: true, count: 1 },
  K:     { enabled: true, count: 1 },
  BENCH: { enabled: true, count: 2 },
};

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

function SchoolPicker({ selected, onChange, minSchools = 4 }: {
  selected: Set<string>; onChange: (s: Set<string>) => void; minSchools?: number;
}) {
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
        {selected.size > 0 && selected.size < minSchools && (
          <span style={{ color: C.red, marginLeft: 8 }}>(minimum {minSchools} required)</span>
        )}
      </div>
      {confs.map(([conf, schools]) => {
        const allIn  = schools.every(s => selected.has(s));
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
  const [userId,                 setUserId]                 = useState('');
  const [step,                   setStep]                   = useState(1);
  const [submitting,             setSubmitting]             = useState(false);
  const [error,                  setError]                  = useState<string | null>(null);
  const [showSchoolWarningModal,     setShowSchoolWarningModal]     = useState(false);
  const [showCommissionerAgreement,  setShowCommissionerAgreement]  = useState(false);
  const [agreementAccepted,          setAgreementAccepted]          = useState(false);

  // Step 1
  const [leagueName,      setLeagueName]      = useState('');
  const [leagueLogo,      setLeagueLogo]      = useState<string | null>(null);
  const [leagueType,      setLeagueType]      = useState<'season' | 'weekly' | 'bracket'>('season');
  const [entries,         setEntries]         = useState(8);
  const [buyIn,           setBuyIn]           = useState(0);
  const [customBuyIn,     setCustomBuyIn]     = useState('');
  const [inviteCode]                          = useState(genCode);
  const [payoutStructure, setPayoutStructure] = useState<PayoutStructure>('winner_take_all');
  const [customPayouts,   setCustomPayouts]   = useState<{ place: number; pct: number }[]>([{ place: 1, pct: 100 }]);
  const [userEmail,       setUserEmail]       = useState<string | null>(null);

  // Step 2
  const [draftType,    setDraftType]    = useState<'snake' | 'salary'>('snake');
  const [salaryCap,    setSalaryCap]    = useState(200);
  const [customCap,    setCustomCap]    = useState('');
  const [timePick,     setTimePick]     = useState('2min');
  const [schools,      setSchools]      = useState<Set<string>>(new Set());
  const [rosterConfig, setRosterConfig] = useState<RosterConfig>(DEFAULT_ROSTER);

  // Step 3
  const [teamName, setTeamName] = useState('');
  const [teamLogo, setTeamLogo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return; }
      setUserId(user.id);
      setUserEmail(user.email ?? null);
    });
  }, [router]);

  const isAdmin = userEmail === 'whb21burton@gmail.com';

  const effectiveBuyIn = customBuyIn ? parseFloat(customBuyIn) || 0 : buyIn;
  const effectiveCap   = customCap   ? parseInt(customCap)     || 200 : salaryCap;
  const allSchools     = Object.values(CONFERENCES).flat();

  const totalPool    = effectiveBuyIn * entries;
  const rakeCents    = totalPool * 0.05;
  const netPool      = totalPool - rakeCents;
  const activePreset = PAYOUT_PRESETS.find(p => p.key === payoutStructure) ?? PAYOUT_PRESETS[0];
  const splits       = activePreset.splits(netPool);

  const totalRoster = (Object.keys(rosterConfig) as RosterPos[])
    .filter(pos => rosterConfig[pos].enabled)
    .reduce((sum, pos) => sum + rosterConfig[pos].count, 0);

  const step1Valid = leagueName.trim().length >= 3 && (leagueType === 'bracket' || entries >= 4);
  const step3Valid = teamName.trim().length >= 2;

  const startingPositions = ['QB', 'RB', 'WR', 'TE', 'DEF', 'K'] as const;
  const maxUnitCount    = Math.max(...startingPositions
    .filter(pos => rosterConfig[pos].enabled)
    .map(pos => rosterConfig[pos].count));
  const minSchoolsNeeded = Math.ceil(entries * maxUnitCount * 1.5);
  const hasEnoughSchools = schools.size === 0 || schools.size >= minSchoolsNeeded;
  const step2Valid       = true;

  function canNext() {
    if (step === 1) return step1Valid;
    if (step === 2) return step2Valid;
    if (step === 3) return step3Valid;
    return true;
  }

  function toggleRoster(pos: RosterPos) {
    setRosterConfig(prev => ({ ...prev, [pos]: { ...prev[pos], enabled: !prev[pos].enabled } }));
  }
  function setRosterCount(pos: RosterPos, count: number) {
    setRosterConfig(prev => ({ ...prev, [pos]: { ...prev[pos], count } }));
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
          league_size: leagueType === 'bracket' ? 999999 : entries,
          draft_type:  draftType,
          salary_cap:  draftType === 'salary' ? effectiveCap : null,
          is_public:   false,
          is_capped:   leagueType !== 'bracket',
          league_type: leagueType,
          team_name:   teamName.trim(),
          invite_code: inviteCode,
          settings: {
            allowed_schools:  allowedSchools,
            league_logo_url:  leagueLogo,
            team_logo_url:    teamLogo,
            time_per_pick:    timePick,
            payout_structure: payoutStructure,
            payout_splits:    splits,
            roster_config:    rosterConfig,
            ...(agreementAccepted ? {
              commissioner_agreement_accepted:    true,
              commissioner_agreement_accepted_at: new Date().toISOString(),
            } : {}),
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
  const placeEmoji = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';

  // suppress unused-var warning for customPayouts setter — state kept for future custom editor
  void customPayouts; void setCustomPayouts;

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

            {/* League Type */}
            <div style={{ marginBottom: 20 }}>
              <Label>League Type</Label>
              <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
                <div
                  onClick={() => setLeagueType('season')}
                  style={{ padding: '14px 16px', border: `2px solid ${leagueType === 'season' ? C.gold : C.surf3}`, borderRadius: 10, cursor: 'pointer', background: leagueType === 'season' ? 'rgba(245,166,35,.08)' : C.surf2, transition: 'all .15s' }}
                >
                  <div style={{ fontSize: 20, marginBottom: 4 }}>🏈</div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 13, color: leagueType === 'season' ? C.gold : C.text, letterSpacing: 1 }}>Season Long</div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, color: C.muted, marginTop: 2 }}>Draft once, compete all season</div>
                </div>
                {isAdmin && (
                  <div
                    onClick={() => setLeagueType('weekly')}
                    style={{ padding: '14px 16px', border: `2px solid ${leagueType === 'weekly' ? C.gold : C.surf3}`, borderRadius: 10, cursor: 'pointer', background: leagueType === 'weekly' ? 'rgba(245,166,35,.08)' : C.surf2, transition: 'all .15s', position: 'relative' }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>⚡</div>
                    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 13, color: leagueType === 'weekly' ? C.gold : C.text, letterSpacing: 1 }}>Weekly Pick'em</div>
                    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, color: C.muted, marginTop: 2 }}>Pick your lineup each week</div>
                    <div style={{ position: 'absolute', top: 6, right: 8, fontFamily: 'Oswald, sans-serif', fontSize: 8, letterSpacing: 1, color: C.gold, background: 'rgba(245,166,35,.15)', padding: '1px 5px', borderRadius: 3 }}>ADMIN</div>
                  </div>
                )}
                <div
                  onClick={() => setLeagueType('bracket')}
                  style={{ padding: '14px 16px', border: `2px solid ${leagueType === 'bracket' ? C.green : C.surf3}`, borderRadius: 10, cursor: 'pointer', background: leagueType === 'bracket' ? 'rgba(21,198,120,.08)' : C.surf2, transition: 'all .15s' }}
                >
                  <div style={{ fontSize: 20, marginBottom: 4 }}>🏆</div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 13, color: leagueType === 'bracket' ? C.green : C.text, letterSpacing: 1 }}>Bracket</div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, color: C.muted, marginTop: 2 }}>Pick your bracket, win prizes</div>
                </div>
              </div>
              {leagueType === 'bracket' && (
                <div style={{ padding: '8px 12px', background: 'rgba(21,198,120,.06)', border: '1px solid rgba(21,198,120,.2)', borderRadius: 6, marginTop: 8, fontFamily: 'Oswald,sans-serif', fontSize: 11, color: C.sub }}>
                  🏆 Bracket contests are open to unlimited participants. No team limit required.
                </div>
              )}
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

            {/* Entries — hidden for bracket leagues */}
            {leagueType !== 'bracket' && (
              <div style={{ marginBottom: 20 }}>
                <Label>Number of Entries (min 4)</Label>
                <input
                  type="number" min={4} value={entries}
                  onChange={e => setEntries(Math.max(4, parseInt(e.target.value) || 4))}
                  style={{ width: '100%', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, color: C.text, fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, padding: '11px 14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* Entry Fee */}
            <div style={{ marginBottom: effectiveBuyIn > 0 ? 0 : 20 }}>
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

            {/* Prize Pool Breakdown */}
            {effectiveBuyIn > 0 && (
              <div style={{ background: 'rgba(245,166,35,.06)', border: '1px solid rgba(245,166,35,.2)', borderRadius: 8, padding: '14px 16px', marginTop: 12 }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>
                  💰 Prize Pool Breakdown
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub }}>{leagueType === 'bracket' ? 'Per entry' : `Total entries (${entries} × $${effectiveBuyIn})`}</span>
                  <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 13, color: C.text }}>${totalPool.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub }}>Platform fee (5%)</span>
                  <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 13, color: C.red }}>−${rakeCents.toFixed(2)}</span>
                </div>
                <div style={{ height: 1, background: C.surf3, margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.gold }}>Net prize pool</span>
                  <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 15, color: C.gold }}>${netPool.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Payout Structure */}
            {effectiveBuyIn > 0 && (
              <div style={{ marginTop: 20, marginBottom: 20 }}>
                <Label>Payout Structure</Label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {PAYOUT_PRESETS.map(preset => (
                    <button
                      key={preset.key}
                      onClick={() => setPayoutStructure(preset.key)}
                      style={{ padding: '14px 10px', background: payoutStructure === preset.key ? 'rgba(245,166,35,.1)' : C.surf2, border: `2px solid ${payoutStructure === preset.key ? C.gold : C.surf3}`, borderRadius: 10, cursor: 'pointer', textAlign: 'center', transition: 'all .15s' }}
                    >
                      <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 12, letterSpacing: 1, color: payoutStructure === preset.key ? C.gold : C.text, textTransform: 'uppercase', marginBottom: 4 }}>
                        {preset.label}
                      </div>
                      <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, color: C.sub, letterSpacing: 1 }}>
                        {preset.desc}
                      </div>
                    </button>
                  ))}
                </div>
                <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, padding: '12px 14px' }}>
                  {splits.map((s, i) => (
                    <div key={s.place} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: i < splits.length - 1 ? 6 : 0 }}>
                      <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub }}>
                        {placeEmoji(i)} {s.label} place
                      </span>
                      <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 13, color: C.gold }}>
                        ${s.amount.toFixed(2)} ({s.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invite Code */}
            <div style={{ marginBottom: 4, marginTop: effectiveBuyIn > 0 ? 0 : 0 }}>
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

            {/* Team Pool — School Picker (both draft types) */}
            <div style={{ marginBottom: 24 }}>
              <Label>Team Pool — Select Schools</Label>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>
                Leave all unchecked to use all D1 schools, or select a subset.
              </div>
              <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '16px', maxHeight: 360, overflowY: 'auto' }}>
                <SchoolPicker selected={schools} onChange={setSchools} minSchools={entries} />
              </div>
              {schools.size > 0 && !hasEnoughSchools && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(240,58,90,.08)', border: '1px solid rgba(240,58,90,.3)', borderRadius: 8 }}>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.red, letterSpacing: 1, marginBottom: 6 }}>
                    ⚠️ Not enough schools selected
                  </div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: '#f87a8a', marginBottom: 4 }}>
                    • You need at least {minSchoolsNeeded} schools ({entries} teams × {maxUnitCount} max units × 1.5 = {minSchoolsNeeded} minimum). You have {schools.size}.
                  </div>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: C.muted, marginTop: 6 }}>
                    ℹ️ Remember: each college school provides exactly 1 unit per position. With only {schools.size} schools there is a possibility that each team in the league won't be able to fill their roster.
                  </div>
                </div>
              )}
            </div>

            {/* Roster Settings */}
            <div>
              <Label>Roster Settings</Label>
              <div style={{ background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '16px' }}>
                {ROSTER_POSITIONS.map((pos, idx) => {
                  const cfg    = rosterConfig[pos.key];
                  const isLast = idx === ROSTER_POSITIONS.length - 1;
                  return (
                    <div
                      key={pos.key}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: isLast ? 0 : 10, marginBottom: isLast ? 0 : 10, borderBottom: isLast ? 'none' : `1px solid ${C.surf3}` }}
                    >
                      <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={() => toggleRoster(pos.key)}
                        style={{ accentColor: C.gold, width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 80, flexShrink: 0 }}>
                        <span style={{ fontSize: 16 }}>{pos.emoji}</span>
                        <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 13, letterSpacing: 1, color: cfg.enabled ? C.text : C.muted, textTransform: 'uppercase' }}>
                          {pos.key}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                        <button
                          onClick={() => cfg.enabled && setRosterCount(pos.key, Math.max(0, cfg.count - 1))}
                          disabled={!cfg.enabled || cfg.count <= 0}
                          style={{ width: 28, height: 28, borderRadius: 6, background: C.surf3, border: 'none', cursor: cfg.enabled && cfg.count > 0 ? 'pointer' : 'not-allowed', color: cfg.enabled ? C.text : C.muted, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          −
                        </button>
                        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 16, color: cfg.enabled ? C.text : C.muted, minWidth: 20, textAlign: 'center' }}>
                          {cfg.count}
                        </span>
                        <button
                          onClick={() => cfg.enabled && setRosterCount(pos.key, Math.min(pos.max, cfg.count + 1))}
                          disabled={!cfg.enabled || cfg.count >= pos.max}
                          style={{ width: 28, height: 28, borderRadius: 6, background: C.surf3, border: 'none', cursor: cfg.enabled && cfg.count < pos.max ? 'pointer' : 'not-allowed', color: cfg.enabled ? C.text : C.muted, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: C.sub, letterSpacing: 1, textAlign: 'right', marginTop: 12 }}>
                  Total roster: {totalRoster} players
                </div>
              </div>
            </div>
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
              {(leagueType === 'bracket' ? [
                ['League Name', leagueName],
                ['Type', '🏆 Bracket'],
                ['Entry Fee', effectiveBuyIn === 0 ? 'Free' : `$${effectiveBuyIn.toFixed(2)}`],
                ['Entries', 'Unlimited'],
                ['Your Name', teamName],
              ] : [
                ['League Name', leagueName],
                ['Entry Fee', effectiveBuyIn === 0 ? 'Free' : `$${effectiveBuyIn.toFixed(2)}`],
                ['Entries', String(entries)],
                ['Prize Pool (est.)', effectiveBuyIn === 0 ? '—' : `$${netPool.toFixed(2)}`],
                ['Draft Format', draftType === 'snake' ? '🐍 Snake Draft' : '💰 Salary Cap'],
                ['Time Per Pick', timePick],
                ['Your Team', teamName],
                ['Schools', schools.size > 0 ? `${schools.size} schools` : 'All D1'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} style={{ background: C.surf2, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: C.text }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Payout breakdown */}
            {effectiveBuyIn > 0 && (
              <div style={{ background: C.surf2, borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>
                  Payout Structure — {activePreset.label}
                </div>
                {splits.map((s, i) => (
                  <div key={s.place} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: i < splits.length - 1 ? 6 : 0 }}>
                    <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub }}>
                      {placeEmoji(i)} {s.label} place ({s.pct}%)
                    </span>
                    <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 13, color: C.gold }}>${s.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Roster config summary */}
            <div style={{ background: C.surf2, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 9, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 10 }}>
                Roster Config
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {ROSTER_POSITIONS.filter(p => rosterConfig[p.key].enabled).map(p => (
                  <span key={p.key} style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 1, color: C.text, background: C.surf3, borderRadius: 4, padding: '4px 10px' }}>
                    {p.emoji} {p.key}: {rosterConfig[p.key].count}
                  </span>
                ))}
              </div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 10, color: C.sub, letterSpacing: 1 }}>
                Total: {totalRoster} players per team
              </div>
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

        {/* ── Commissioner Agreement Modal ─────────────────────────────────── */}
        {showCommissionerAgreement && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, padding: '32px 28px', maxWidth: 500, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>

              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase' }}>Commissioner Agreement</div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: C.muted, marginTop: 4, letterSpacing: 1 }}>Required for paid leagues</div>
              </div>

              {/* Section 1 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>1. Commissioner Responsibility</div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
                  As commissioner, you are responsible for managing league integrity, setting clear rules for participants, and handling member expectations. You agree to run this league fairly and in good faith.
                </div>
              </div>

              {/* Section 2 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>2. Platform Role</div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
                  College Units Fantasy facilitates payments, tracks standings, and processes payouts based on final standings. The platform does not arbitrate subjective league disputes between commissioners and members.
                </div>
              </div>

              {/* Section 3 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>3. Refund &amp; Dissolution Policy</div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
                  If a league is dissolved before completion, remaining funds in the prize pool may be redistributed proportionally to participants according to platform rules. Entry fees already processed are subject to platform review before any refund is issued.
                </div>
              </div>

              {/* Section 4 — Rake */}
              <div style={{ marginBottom: 24, padding: '12px 14px', background: 'rgba(245,166,35,.06)', border: '1px solid rgba(245,166,35,.2)', borderRadius: 8 }}>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 8 }}>4. Platform Fee Disclosure</div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
                  A <strong style={{ color: C.gold }}>5% platform fee</strong> is deducted from the total prize pool before distribution to winners. This fee is <strong style={{ color: C.text }}>non-refundable</strong> once league entry payments have been processed. By proceeding, you acknowledge and agree to this fee structure.
                </div>
              </div>

              {/* Checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 20 }}>
                <input
                  type="checkbox"
                  checked={agreementAccepted}
                  onChange={e => setAgreementAccepted(e.target.checked)}
                  style={{ accentColor: C.gold, width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
                />
                <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                  I have read and agree to the Commissioner Agreement. I understand my responsibilities as league commissioner and accept the platform fee structure.
                </span>
              </label>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setShowCommissionerAgreement(false); setAgreementAccepted(false); }}
                  style={{ flex: 1, padding: '12px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 12, letterSpacing: 1, color: C.sub }}
                >Cancel</button>
                <button
                  onClick={() => { if (!agreementAccepted) return; setShowCommissionerAgreement(false); setStep(leagueType === 'bracket' ? 3 : 2); }}
                  disabled={!agreementAccepted}
                  style={{ flex: 2, padding: '12px', background: agreementAccepted ? C.gold : C.surf3, border: 'none', borderRadius: 8, cursor: agreementAccepted ? 'pointer' : 'not-allowed', fontFamily: 'Anton, sans-serif', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: agreementAccepted ? C.bg : C.muted, transition: 'all .15s' }}
                >I Agree — Continue</button>
              </div>
            </div>
          </div>
        )}

        {/* ── School Warning Modal ─────────────────────────────────────────── */}
        {showSchoolWarningModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 14, padding: '28px 28px', maxWidth: 420, width: '100%' }}>
              <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
              <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, color: C.text, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
                Are you sure you want to proceed?
              </div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 12, color: C.sub, marginBottom: 8, lineHeight: 1.6 }}>
                You have selected <strong style={{ color: C.gold }}>{schools.size} schools</strong> but the recommended minimum is <strong style={{ color: C.red }}>{minSchoolsNeeded}</strong> ({entries} teams × {maxUnitCount} max units × 1.5).
              </div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 11, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
                ℹ️ Each college school provides exactly 1 unit per position. With only {schools.size} schools there is a possibility that each team in the league won't be able to fill their roster.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowSchoolWarningModal(false)}
                  style={{ flex: 1, padding: '12px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 12, letterSpacing: 1, color: C.sub }}
                >
                  ← Go Back
                </button>
                <button
                  onClick={() => { setShowSchoolWarningModal(false); setStep(3); }}
                  style={{ flex: 1, padding: '12px', background: 'rgba(240,58,90,.15)', border: '1px solid rgba(240,58,90,.4)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 12, letterSpacing: 1, color: C.red }}
                >
                  Proceed Anyway
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Nav Buttons ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
          <button
            onClick={() => {
              if (step === 3 && leagueType === 'bracket') setStep(1);
              else if (step > 1) setStep(s => s - 1);
              else router.push('/my-leagues');
            }}
            style={{ padding: '13px 28px', background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: 12, letterSpacing: 2, color: C.sub, textTransform: 'uppercase' }}
          >
            {step > 1 ? '← Back' : 'Cancel'}
          </button>

          {step < 4 ? (
            <button
              onClick={() => {
                if (step === 1 && effectiveBuyIn > 0 && !agreementAccepted) {
                  setShowCommissionerAgreement(true);
                } else if (step === 1 && leagueType === 'bracket') {
                  setStep(3);
                } else if (step === 2 && schools.size > 0 && !hasEnoughSchools) {
                  setShowSchoolWarningModal(true);
                } else {
                  setStep(s => s + 1);
                }
              }}
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
