'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import type { CreateLeagueFormData } from '@/types';

const ADMIN_EMAIL = 'whb21burton@gmail.com';

const SIZE_PRESETS  = [2, 4, 8, 10, 25, 50, 100];
const BUYIN_PRESETS = [0, 5, 10, 25, 50, 100];
const WEEKS         = [1,2,3,4,5,6,7,8,9,10,11,12,13,14];

const CONFERENCE_SCHOOLS: Record<string, string[]> = {
  'SEC': [
    'Alabama','Arkansas','Auburn','Florida','Georgia','Kentucky','LSU',
    'Mississippi State','Missouri','Ole Miss','Oklahoma','South Carolina',
    'Tennessee','Texas','Texas A&M','Vanderbilt',
  ],
  'Big Ten': [
    'Illinois','Indiana','Iowa','Maryland','Michigan','Michigan State','Minnesota',
    'Nebraska','Northwestern','Ohio State','Oregon','Penn State','Purdue',
    'Rutgers','UCLA','USC','Washington','Wisconsin',
  ],
  'ACC': [
    'Boston College','Cal','Clemson','Duke','Florida State','Georgia Tech',
    'Louisville','Miami','NC State','North Carolina','Notre Dame','Pittsburgh',
    'SMU','Stanford','Syracuse','Virginia','Virginia Tech','Wake Forest',
  ],
  'Big 12': [
    'Arizona','Arizona State','Baylor','BYU','Cincinnati','Colorado',
    'Houston','Iowa State','Kansas','Kansas State','Oklahoma State',
    'TCU','Texas Tech','UCF','Utah','West Virginia',
  ],
  'Pac-12': ['Oregon State','Washington State'],
  'Independent': ['Army','Liberty','New Mexico State','UConn'],
};

const ALL_SCHOOLS = Object.values(CONFERENCE_SCHOOLS).flat();

const C = {
  bg:'#05080f', surf:'#0c1220', surf2:'#131d30', surf3:'#1e2d47',
  gold:'#d4a828', goldLight:'#f0c94a', muted:'#4a5d7a',
  text:'#e8edf5', sub:'#7a90b0', red:'#e74c3c', green:'#2ecc71',
};

type WizStep = 'settings' | 'team-name' | 'player-pool' | 'entry-amount' | 'copies' | 'review' | 'done';

function clampInt(s: string, min: number, max: number, fallback: number): number {
  const n = parseInt(s, 10);
  return isNaN(n) ? fallback : Math.max(min, Math.min(max, n));
}
function clampFloat(s: string, min: number, max: number, fallback: number): number {
  const n = parseFloat(s);
  return isNaN(n) ? fallback : Math.max(min, Math.min(max, n));
}

export function CreateLeagueWizard() {
  const router = useRouter();
  const [wizStep,      setWizStep]      = useState<WizStep>('settings');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [createdLeagues, setCreatedLeagues] = useState<{ id: string; invite_code: string; name: string }[]>([]);
  const [copied,       setCopied]       = useState(false);
  const [isPublic,     setIsPublic]     = useState(false);
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [leagueType,   setLeagueType]   = useState<'season' | 'weekly'>('season');
  const [week,         setWeek]         = useState<number>(1);
  const [conferenceFilter, setConferenceFilter] = useState<string>('ALL');

  // custom size / buy-in
  const [customSizeInput,  setCustomSizeInput]  = useState('');
  const [customBuyInInput, setCustomBuyInInput] = useState('');

  // player pool
  const [checkedSchools, setCheckedSchools] = useState<Set<string>>(
    () => new Set(ALL_SCHOOLS)   // default: all selected
  );

  // copies
  const [copies, setCopies] = useState(1);

  // entry amount (weekly public admin)
  const [entryType,         setEntryType]         = useState<'capped' | 'nocap' | '1v1'>('capped');
  const [maxEntriesPerUser, setMaxEntriesPerUser] = useState(3);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(user?.email === ADMIN_EMAIL);
    });
  }, []);

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

  // ── Computed values ─────────────────────────────────────────────────────────
  const isWeeklyPublicAdmin = isPublic && isAdmin && leagueType === 'weekly';

  const effectiveSize = customSizeInput.trim()
    ? clampInt(customSizeInput, 2, 10000, 8)
    : form.league_size;

  const effectiveBuyIn = customBuyInInput.trim()
    ? clampFloat(customBuyInInput, 0, 10000, 0)
    : form.buy_in;

  const autoCapped = effectiveSize <= 100;

  const conferenceForAPI: string = (() => {
    if (checkedSchools.size === ALL_SCHOOLS.length) return 'ALL';
    for (const [conf, schools] of Object.entries(CONFERENCE_SCHOOLS)) {
      if (schools.length === checkedSchools.size && schools.every(s => checkedSchools.has(s))) return conf;
    }
    return 'CUSTOM';
  })();

  // ── School toggle helpers ────────────────────────────────────────────────────
  function toggleSchool(school: string, checked: boolean) {
    setCheckedSchools(prev => {
      const next = new Set(prev);
      if (checked) next.add(school); else next.delete(school);
      return next;
    });
  }
  function toggleConference(conf: string, checked: boolean) {
    const schools = CONFERENCE_SCHOOLS[conf];
    setCheckedSchools(prev => {
      const next = new Set(prev);
      if (checked) schools.forEach(s => next.add(s));
      else schools.forEach(s => next.delete(s));
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setCheckedSchools(checked ? new Set(ALL_SCHOOLS) : new Set());
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  function nextFromSettings() {
    if (isWeeklyPublicAdmin) setWizStep('player-pool');
    else if (!isPublic) setWizStep('team-name');
    else setWizStep('review');
  }
  function backFromReview() {
    if (isWeeklyPublicAdmin) setWizStep('copies');
    else if (!isPublic) setWizStep('team-name');
    else setWizStep('settings');
  }

  // ── Progress bar ─────────────────────────────────────────────────────────────
  const progressLabels = isWeeklyPublicAdmin
    ? ['Settings', 'Player Pool', 'Entry Type', 'Copies', 'Review']
    : !isPublic
      ? ['Settings', 'Your Team', 'Review']
      : ['Settings', 'Review'];

  const stepOrder: WizStep[] = isWeeklyPublicAdmin
    ? ['settings', 'player-pool', 'entry-amount', 'copies', 'review']
    : !isPublic
      ? ['settings', 'team-name', 'review']
      : ['settings', 'review'];

  const currentProgressIdx = Math.max(0, stepOrder.indexOf(wizStep));

  // ── Create ────────────────────────────────────────────────────────────────────
  async function handleCreate() {
    setLoading(true); setError(null);

    const allowedSchools = checkedSchools.size === ALL_SCHOOLS.length
      ? null
      : Array.from(checkedSchools);

    // 1v1 overrides league_size to 2
    const finalLeagueSize = isWeeklyPublicAdmin && entryType === '1v1' ? 2 : effectiveSize;
    const finalMaxEntries = isWeeklyPublicAdmin
      ? (entryType === 'nocap' ? null : entryType === '1v1' ? 1 : maxEntriesPerUser)
      : null;

    const res = await fetch('/api/leagues/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:                  form.name.trim(),
        buy_in:                effectiveBuyIn,
        league_size:           finalLeagueSize,
        draft_type:            leagueType === 'season'
          ? (isPublic ? (conferenceFilter === 'ALL' ? 'salary' : 'snake') : form.draft_type)
          : 'snake',
        salary_cap:            form.salary_cap,
        is_public:             isPublic,
        conference_filter:     isPublic ? (isWeeklyPublicAdmin ? conferenceForAPI : conferenceFilter) : 'ALL',
        league_type:           leagueType,
        week:                  leagueType === 'weekly' ? week : null,
        team_name:             form.team_name.trim() || 'My Team',
        copies:                isWeeklyPublicAdmin ? copies : 1,
        settings:              allowedSchools ? { allowed_schools: allowedSchools } : {},
        max_entries_per_user:  finalMaxEntries,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.error || 'Failed to create league.');
      setLoading(false); return;
    }

    const created: { id: string; invite_code: string; name: string }[] = json.leagues ?? [json];
    setCreatedLeagues(created);
    setLoading(false);
    setWizStep('done');
  }

  const firstLeague = createdLeagues[0];
  const inviteUrl = firstLeague
    ? `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/join/${firstLeague.invite_code}`
    : '';

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const canProceedSettings   = form.name.trim().length >= 3;
  const canProceedTeamName   = form.team_name.trim().length >= 2;
  const canProceedPlayerPool = checkedSchools.size >= 9;

  // ── Review row helper ─────────────────────────────────────────────────────────
  const schoolsLabel = (() => {
    if (checkedSchools.size === ALL_SCHOOLS.length) return 'All D1 Schools';
    if (conferenceForAPI !== 'CUSTOM') return `${conferenceForAPI} only`;
    return `${checkedSchools.size} schools selected`;
  })();

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 20px' }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .wiz-step { animation: slideIn .25s ease; }
        input:focus, textarea:focus { outline: none !important; border-color: ${C.gold} !important; }
        input[type=number]::-webkit-inner-spin-button { opacity: 1; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 11, letterSpacing: 4, color: C.gold, textTransform: 'uppercase', marginBottom: 10 }}>
          🏈 League Setup
        </div>
        <h1 style={{ fontFamily: "'Anton', sans-serif", fontSize: 36, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase', lineHeight: 1 }}>
          Create Your League
        </h1>
      </div>

      {/* ── Progress bar ── */}
      {wizStep !== 'done' && (
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            {progressLabels.map((label, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', margin: '0 auto 6px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Anton', sans-serif", fontSize: 13,
                  background: currentProgressIdx > i ? C.green : currentProgressIdx === i ? C.gold : C.surf3,
                  color: currentProgressIdx > i ? '#fff' : currentProgressIdx === i ? C.bg : C.muted,
                  transition: 'all .3s',
                }}>
                  {currentProgressIdx > i ? '✓' : i + 1}
                </div>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: currentProgressIdx === i ? C.gold : C.muted }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 2, background: C.surf3, borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight})`,
              width: progressLabels.length > 1 ? `${(currentProgressIdx / (progressLabels.length - 1)) * 100}%` : '0%',
              transition: 'width .4s ease',
            }} />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          SETTINGS STEP
      ══════════════════════════════════════════════ */}
      {wizStep === 'settings' && (
        <div className="wiz-step">
          <Card>
            {/* League Type */}
            <FieldLabel>League Type</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <ToggleBtn active={leagueType === 'season'} onClick={() => setLeagueType('season')}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>🏈</div>
                <strong>Season Long</strong>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Draft once, compete all season</div>
              </ToggleBtn>
              <ToggleBtn active={leagueType === 'weekly'} onClick={() => setLeagueType('weekly')}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>⚡</div>
                <strong>Weekly Pick'em</strong>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Pick your lineup each week</div>
              </ToggleBtn>
            </div>
            {leagueType === 'weekly' && (
              <div style={{ padding: '10px 14px', background: 'rgba(245,166,35,.06)', border: '1px solid rgba(245,166,35,.2)', borderRadius: 8, fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.sub, marginBottom: 4 }}>
                ⚡ High-margin weekly contest — 1st gets 80%, 2nd gets 20%. Repeatable every week!
              </div>
            )}

            <Spacer />

            {/* League Name */}
            <FieldLabel>League Name</FieldLabel>
            <input
              type="text"
              placeholder="e.g. Saturday Legends 2026"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              maxLength={40}
              style={inputStyle}
            />
            <div style={{ textAlign: 'right', fontSize: 11, color: C.muted, marginTop: 4, fontFamily: "'Oswald', sans-serif" }}>
              {form.name.length}/40
            </div>

            <Spacer />

            {/* Max Entries (replaces League Size) */}
            <FieldLabel>
              <span>Max Entries</span>
              {'  '}
              {autoCapped
                ? <span style={{ background: 'rgba(74,93,122,.2)', border: '1px solid #4a5d7a', borderRadius: 4, padding: '1px 6px', fontSize: 9, letterSpacing: 1, color: C.sub }}>🧢 Capped</span>
                : <span style={{ background: 'rgba(46,204,113,.1)', border: '1px solid rgba(46,204,113,.3)', borderRadius: 4, padding: '1px 6px', fontSize: 9, letterSpacing: 1, color: C.green }}>∞ No Cap</span>
              }
            </FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
              {SIZE_PRESETS.map(n => (
                <ToggleBtn
                  key={n}
                  active={!customSizeInput && form.league_size === n}
                  onClick={() => { set('league_size', n); setCustomSizeInput(''); }}
                >
                  {n}
                </ToggleBtn>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, flexShrink: 0 }}>Custom:</span>
              <input
                type="number"
                placeholder="2–10,000"
                min={2}
                max={10000}
                value={customSizeInput}
                onChange={e => setCustomSizeInput(e.target.value)}
                style={{ ...rangeInput, flex: 1 }}
              />
              <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, flexShrink: 0 }}>entries</span>
            </div>
            <div style={{ marginTop: 6, fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, letterSpacing: .5 }}>
              {autoCapped
                ? `🧢 Capped — limited to ${effectiveSize} contestants`
                : `∞ No Cap — up to ${effectiveSize} total entrants`}
            </div>

            <Spacer />

            {/* Entry Fee (replaces Buy-In) */}
            <FieldLabel>Entry Fee</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 8 }}>
              {BUYIN_PRESETS.map(n => (
                <ToggleBtn
                  key={n}
                  active={!customBuyInInput && form.buy_in === n}
                  onClick={() => { set('buy_in', n); setCustomBuyInInput(''); }}
                >
                  {n === 0 ? 'Free' : `$${n}`}
                </ToggleBtn>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, flexShrink: 0 }}>Custom: $</span>
              <input
                type="number"
                placeholder="0–10,000"
                min={0}
                max={10000}
                step="0.01"
                value={customBuyInInput}
                onChange={e => setCustomBuyInInput(e.target.value)}
                style={{ ...rangeInput, flex: 1 }}
              />
            </div>
            {effectiveBuyIn > 0 && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(212,168,40,.08)', border: '1px solid rgba(212,168,40,.2)', borderRadius: 8, fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.sub, letterSpacing: .5, lineHeight: 1.8 }}>
                🏆 Prize Pool:{' '}
                <strong style={{ color: C.gold }}>${(effectiveBuyIn * effectiveSize).toFixed(2)}</strong>
                {'  '}({effectiveSize} × ${effectiveBuyIn.toFixed(2)})<br />
                Your cut (10% fee):{' '}
                <strong style={{ color: C.sub }}>${(effectiveBuyIn * 0.1).toFixed(2)}</strong> per entry
              </div>
            )}

            <Spacer />

            {/* Visibility */}
            <FieldLabel>League Visibility</FieldLabel>
            {isAdmin ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <ToggleBtn active={!isPublic} onClick={() => setIsPublic(false)}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>🔒</div>
                  <strong>Private</strong>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Invite link only</div>
                </ToggleBtn>
                <ToggleBtn active={isPublic} onClick={() => setIsPublic(true)}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>🌐</div>
                  <strong>Public</strong>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Listed in leagues browser</div>
                </ToggleBtn>
              </div>
            ) : (
              <div style={{ padding: '12px 16px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🔒</span>
                <div>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: C.text }}>Private</div>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, marginTop: 2 }}>Invite link only</div>
                </div>
              </div>
            )}

            {/* Conference Pool — season public */}
            {isPublic && isAdmin && leagueType === 'season' && (
              <>
                <Spacer />
                <FieldLabel>Conference</FieldLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <ToggleBtn active={conferenceFilter === 'ALL'} onClick={() => setConferenceFilter('ALL')}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>🌎</div>
                    <strong>All D1 Schools</strong>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Salary cap · $200 budget</div>
                  </ToggleBtn>
                  <ToggleBtn active={conferenceFilter !== 'ALL'} onClick={() => { if (conferenceFilter === 'ALL') setConferenceFilter('SEC'); }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>🏟️</div>
                    <strong>One Conference</strong>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Snake draft · pick below</div>
                  </ToggleBtn>
                </div>
                {conferenceFilter !== 'ALL' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
                    {(['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac-12', 'Independent'] as const).map(conf => (
                      <ToggleBtn key={conf} active={conferenceFilter === conf} onClick={() => setConferenceFilter(conf)}>
                        {conf}
                      </ToggleBtn>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(212,168,40,.06)', border: '1px solid rgba(212,168,40,.15)', borderRadius: 6, fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.sub }}>
                  {conferenceFilter === 'ALL'
                    ? '💰 Salary cap draft — $200 budget, players priced by position rank'
                    : `🐍 Snake draft — ${conferenceFilter} schools only`}
                </div>
              </>
            )}

            {/* Week picker for weekly */}
            {leagueType === 'weekly' && (
              <>
                <Spacer />
                <FieldLabel>Contest Week</FieldLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                  {WEEKS.map(w => (
                    <ToggleBtn key={w} active={week === w} onClick={() => setWeek(w)}>{w}</ToggleBtn>
                  ))}
                </div>
              </>
            )}

            {/* Draft type — private season only */}
            {leagueType === 'season' && !isPublic && (
              <>
                <Spacer />
                <FieldLabel>Draft Type</FieldLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <ToggleBtn active={form.draft_type === 'snake'} onClick={() => set('draft_type', 'snake')}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>🐍</div>
                    <strong>Snake Draft</strong>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Pick order reverses each round</div>
                  </ToggleBtn>
                  <ToggleBtn active={form.draft_type === 'salary'} onClick={() => set('draft_type', 'salary')}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>💰</div>
                    <strong>Salary Cap</strong>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>${form.salary_cap} cap · bid on players</div>
                  </ToggleBtn>
                </div>
              </>
            )}
          </Card>

          <NavRow>
            <div />
            <PrimaryBtn disabled={!canProceedSettings} onClick={nextFromSettings}>
              {isWeeklyPublicAdmin ? 'Next: Player Pool →' : !isPublic ? 'Next: Your Team →' : 'Next: Review →'}
            </PrimaryBtn>
          </NavRow>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TEAM NAME STEP (private only)
      ══════════════════════════════════════════════ */}
      {wizStep === 'team-name' && (
        <div className="wiz-step">
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: C.sub, letterSpacing: .5 }}>
                You're the commissioner of <strong style={{ color: C.gold }}>{form.name}</strong>. What's your team called?
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
            <div style={{ textAlign: 'right', fontSize: 11, color: C.muted, marginTop: 4, fontFamily: "'Oswald', sans-serif" }}>
              {form.team_name.length}/32
            </div>
            <div style={{ marginTop: 20, padding: '12px 16px', background: C.surf2, borderRadius: 8, fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.sub, letterSpacing: .5, lineHeight: 1.7 }}>
              <strong style={{ color: C.text }}>As commissioner you can:</strong><br />
              Set the draft order · Kick members · Start the draft when ready
            </div>
          </Card>
          <NavRow>
            <GhostBtn onClick={() => setWizStep('settings')}>← Back</GhostBtn>
            <PrimaryBtn disabled={!canProceedTeamName} onClick={() => setWizStep('review')}>
              Next: Review →
            </PrimaryBtn>
          </NavRow>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          PLAYER POOL STEP (weekly public admin only)
      ══════════════════════════════════════════════ */}
      {wizStep === 'player-pool' && (
        <div className="wiz-step">
          <Card>
            <FieldLabel>Player Pool — Select Eligible Schools</FieldLabel>

            {/* Count + validation badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{
                padding: '4px 10px', borderRadius: 4,
                background: canProceedPlayerPool ? 'rgba(46,204,113,.12)' : 'rgba(231,76,60,.1)',
                border: `1px solid ${canProceedPlayerPool ? 'rgba(46,204,113,.3)' : 'rgba(231,76,60,.3)'}`,
                fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 1,
                color: canProceedPlayerPool ? C.green : C.red,
              }}>
                {checkedSchools.size} schools selected
                {!canProceedPlayerPool && '  (min 9 required)'}
              </div>
            </div>

            {/* All D1 toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: C.surf2, borderRadius: 8, marginBottom: 12, cursor: 'pointer', border: `1px solid ${C.surf3}` }}>
              <input
                type="checkbox"
                checked={checkedSchools.size === ALL_SCHOOLS.length}
                onChange={e => toggleAll(e.target.checked)}
                style={{ accentColor: C.gold, width: 16, height: 16 }}
              />
              <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.text, letterSpacing: .5 }}>All D1 Schools</span>
              <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: C.muted }}>({ALL_SCHOOLS.length} total)</span>
            </label>

            <div style={{ height: 1, background: C.surf3, marginBottom: 12 }} />

            {/* Per-conference sections */}
            {Object.entries(CONFERENCE_SCHOOLS).map(([conf, schools]) => {
              const numChecked = schools.filter(s => checkedSchools.has(s)).length;
              const allConfChecked = numChecked === schools.length;
              return (
                <div key={conf} style={{ marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={allConfChecked}
                      onChange={e => toggleConference(conf, e.target.checked)}
                      style={{ accentColor: C.gold, width: 15, height: 15 }}
                    />
                    <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.text, letterSpacing: 0.5 }}>{conf}</span>
                    <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: C.muted }}>
                      ({numChecked}/{schools.length})
                    </span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, paddingLeft: 24 }}>
                    {schools.map(school => (
                      <label key={school} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '2px 0' }}>
                        <input
                          type="checkbox"
                          checked={checkedSchools.has(school)}
                          onChange={e => toggleSchool(school, e.target.checked)}
                          style={{ accentColor: C.gold, width: 13, height: 13, flexShrink: 0 }}
                        />
                        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {school}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
          <NavRow>
            <GhostBtn onClick={() => setWizStep('settings')}>← Back</GhostBtn>
            <PrimaryBtn disabled={!canProceedPlayerPool} onClick={() => setWizStep('entry-amount')}>
              Next: Entry Type →
            </PrimaryBtn>
          </NavRow>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          ENTRY AMOUNT STEP (weekly public admin only)
      ══════════════════════════════════════════════ */}
      {wizStep === 'entry-amount' && (
        <div className="wiz-step">
          <Card>
            <FieldLabel>Entry Amount</FieldLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {([
                {
                  key: 'capped' as const,
                  icon: '🧢',
                  title: 'Capped',
                  desc: 'Limit how many entries each account can submit',
                },
                {
                  key: 'nocap' as const,
                  icon: '∞',
                  title: 'No Cap',
                  desc: 'Accounts can enter as many lineups as they want',
                },
                {
                  key: '1v1' as const,
                  icon: '⚔️',
                  title: '1v1',
                  desc: 'One entry vs one other entry — winner takes all',
                },
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setEntryType(opt.key)}
                  style={{
                    padding: '14px 16px', border: `2px solid ${entryType === opt.key ? C.gold : C.surf3}`,
                    borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    background: entryType === opt.key ? 'rgba(212,168,40,.08)' : C.surf2,
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>{opt.icon}</span>
                    <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, color: entryType === opt.key ? C.goldLight : C.text, letterSpacing: .5 }}>
                      {opt.title}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: C.sub, paddingLeft: 28 }}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>

            {entryType === 'capped' && (
              <div style={{ padding: '12px 14px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8 }}>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                  Max entries per account
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {[1, 2, 3, 5, 10].map(n => (
                    <ToggleBtn key={n} active={maxEntriesPerUser === n} onClick={() => setMaxEntriesPerUser(n)}>{n}</ToggleBtn>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, flexShrink: 0 }}>Custom:</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxEntriesPerUser}
                    onChange={e => setMaxEntriesPerUser(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    style={{ ...rangeInput, width: 80 }}
                  />
                </div>
              </div>
            )}

            {entryType === '1v1' && (
              <div style={{ padding: '10px 14px', background: 'rgba(58,134,255,.06)', border: '1px solid rgba(58,134,255,.2)', borderRadius: 8, fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.sub, lineHeight: 1.7 }}>
                ⚔️ League size locked to 2. Each account may enter once.
              </div>
            )}

            {effectiveBuyIn > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(212,168,40,.06)', border: '1px solid rgba(212,168,40,.15)', borderRadius: 8, fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.sub, lineHeight: 1.7 }}>
                Each entry costs <strong style={{ color: C.gold }}>${effectiveBuyIn.toFixed(2)}</strong>.
                {entryType === 'capped' && maxEntriesPerUser > 1 && (
                  <> An account submitting {maxEntriesPerUser} entries pays <strong style={{ color: C.gold }}>${(effectiveBuyIn * maxEntriesPerUser).toFixed(2)}</strong>.</>
                )}
              </div>
            )}
          </Card>
          <NavRow>
            <GhostBtn onClick={() => setWizStep('player-pool')}>← Back</GhostBtn>
            <PrimaryBtn onClick={() => setWizStep('copies')}>
              Next: Copies →
            </PrimaryBtn>
          </NavRow>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          COPIES STEP (weekly public admin only)
      ══════════════════════════════════════════════ */}
      {wizStep === 'copies' && (
        <div className="wiz-step">
          <Card>
            <FieldLabel>Number of Copies</FieldLabel>
            <div style={{ padding: '10px 14px', background: 'rgba(245,166,35,.06)', border: '1px solid rgba(245,166,35,.15)', borderRadius: 8, fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.sub, marginBottom: 16, lineHeight: 1.7 }}>
              Each copy is a separate contest. Players can only join one copy per contest.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 10 }}>
              {[1, 2, 3, 5, 10].map(n => (
                <ToggleBtn key={n} active={copies === n} onClick={() => setCopies(n)}>
                  {n === 1 ? '1 copy' : `${n}×`}
                </ToggleBtn>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted }}>Custom:</span>
              <input
                type="number"
                min={1}
                max={20}
                value={copies}
                onChange={e => setCopies(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                style={{ ...rangeInput, width: 80 }}
              />
              <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted }}>copies (max 20)</span>
            </div>

            {copies > 1 && (
              <div style={{ padding: '12px 14px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8 }}>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  Preview — {copies} contests will be created:
                </div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.8 }}>
                  {Array.from({ length: Math.min(copies, 5) }, (_, i) =>
                    `${form.name} ${String(i + 1).padStart(2, '0')}`
                  ).join(', ')}
                  {copies > 5 && ` … ${form.name} ${String(copies).padStart(2, '0')}`}
                </div>
              </div>
            )}
          </Card>
          <NavRow>
            <GhostBtn onClick={() => setWizStep('entry-amount')}>← Back</GhostBtn>
            <PrimaryBtn onClick={() => setWizStep('review')}>
              Next: Review →
            </PrimaryBtn>
          </NavRow>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          REVIEW STEP
      ══════════════════════════════════════════════ */}
      {wizStep === 'review' && (
        <div className="wiz-step">
          <Card>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: 1, color: C.text, textTransform: 'uppercase', marginBottom: 20 }}>
              Review League Settings
            </div>

            {[
              ['League Type', leagueType === 'weekly' ? `⚡ Weekly Pick'em — Week ${week}` : '🏈 Season Long'],
              ['League Name', form.name],
              ['Max Entries', `${effectiveSize} ${autoCapped ? '🧢 Capped' : '∞ No Cap'}`],
              ['Entry Fee', effectiveBuyIn === 0 ? 'Free' : `$${effectiveBuyIn.toFixed(2)} per entry · $${(effectiveBuyIn * effectiveSize).toFixed(2)} total pool`],
              ['Visibility', isPublic ? '🌐 Public — listed in leagues browser' : '🔒 Private — invite link only'],
              ...(isWeeklyPublicAdmin
                ? [
                    ['Player Pool', schoolsLabel],
                    ['Entry Type', entryType === 'capped' ? `🧢 Capped — max ${maxEntriesPerUser}/account` : entryType === '1v1' ? '⚔️ 1v1 — 1 entry per account, 2 teams' : '∞ No Cap — unlimited entries per account'],
                    ['Copies', copies === 1 ? '1 contest' : `${copies} contests (${form.name} 01 … ${String(copies).padStart(2,'0')})`],
                  ]
                : isPublic && leagueType === 'season'
                  ? [['Conference Pool', conferenceFilter === 'ALL' ? '🌎 All D1 · Salary Cap ($200)' : `🏟️ ${conferenceFilter} · Snake Draft`]]
                  : leagueType === 'season'
                    ? [['Draft Type', form.draft_type === 'snake' ? '🐍 Snake Draft' : `💰 Salary Cap ($${form.salary_cap})`]]
                    : [['Scoring', '1st: 80% · 2nd: 20% of prize pool']]),
              ...(!isPublic ? [['Your Team', form.team_name]] : []),
              ...(leagueType === 'season' ? [['Season', 'Weeks 1–10 regular season · 6-team playoff (Wks 11–13)']] : []),
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.surf3}`, gap: 16 }}>
                <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>{k}</span>
                <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, color: C.text, textAlign: 'right' }}>{v}</span>
              </div>
            ))}

            {error && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', borderRadius: 6, fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.red }}>
                ⚠️ {error}
              </div>
            )}
          </Card>

          <NavRow>
            <GhostBtn onClick={backFromReview}>← Back</GhostBtn>
            <PrimaryBtn onClick={handleCreate} disabled={loading}>
              {loading ? '⏳ Creating...' : copies > 1 ? `🚀 Create ${copies} Leagues` : '🚀 Create League'}
            </PrimaryBtn>
          </NavRow>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          DONE STEP
      ══════════════════════════════════════════════ */}
      {wizStep === 'done' && createdLeagues.length > 0 && (
        <div className="wiz-step">
          {/* Success banner */}
          <div style={{ textAlign: 'center', padding: '32px 24px', background: 'linear-gradient(135deg,rgba(46,204,113,.1),rgba(46,204,113,.03))', border: '1px solid rgba(46,204,113,.3)', borderRadius: 12, marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, transparent, ${C.green}, transparent)` }} />
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 28, letterSpacing: 1.5, color: C.green, textTransform: 'uppercase', marginBottom: 8 }}>
              {createdLeagues.length > 1 ? `${createdLeagues.length} Leagues Live!` : 'League Is Live!'}
            </div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, color: C.sub, letterSpacing: .5 }}>
              {createdLeagues.length > 1
                ? <><strong style={{ color: C.text }}>{createdLeagues.length} contests</strong> are ready in the Contest Lobby.</>
                : <><strong style={{ color: C.text }}>{firstLeague?.name}</strong> is ready. Share the link to invite league mates.</>
              }
            </div>
          </div>

          {/* Single league: show invite link */}
          {createdLeagues.length === 1 && firstLeague && (
            <Card>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Your Invite Link</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <div style={{ flex: 1, padding: '12px 14px', background: C.bg, border: `1px solid ${C.surf3}`, borderRadius: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.gold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inviteUrl}
                </div>
                <button onClick={copyLink} style={{ padding: '12px 18px', flexShrink: 0, background: copied ? 'rgba(46,204,113,.2)' : 'linear-gradient(135deg, #d4a828, #f0c94a)', border: copied ? '1px solid rgba(46,204,113,.4)' : 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: copied ? C.green : C.bg, transition: 'all .2s' }}>
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <div style={{ textAlign: 'center', padding: '16px', background: C.bg, border: `1px solid ${C.surf3}`, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Invite Code</div>
                <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 32, letterSpacing: 8, color: C.gold }}>
                  {firstLeague.invite_code}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: '📱 iMessage', href: `sms:?body=Join my College Units Fantasy league! ${inviteUrl}` },
                  { label: '💬 WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`Join my College Units Fantasy league! ${inviteUrl}`)}` },
                  { label: '📧 Email', href: `mailto:?subject=Join my CFB Fantasy League&body=${encodeURIComponent(`Join my College Units Fantasy league: ${inviteUrl}\n\nCode: ${firstLeague.invite_code}`)}` },
                ].map(({ label, href }) => (
                  <a key={label} href={href} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '10px 8px', background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 8, textDecoration: 'none', fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 1, color: C.sub, transition: 'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.text; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.surf3; e.currentTarget.style.color = C.sub; }}
                  >{label}</a>
                ))}
              </div>
            </Card>
          )}

          {/* Multiple leagues: show list */}
          {createdLeagues.length > 1 && (
            <Card>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Created Contests</div>
              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {createdLeagues.map((lg, i) => (
                  <div key={lg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: C.bg, border: `1px solid ${C.surf3}`, borderRadius: 6 }}>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: C.text }}>{lg.name}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.gold }}>{lg.invite_code}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {createdLeagues.length === 1 && firstLeague && (
              <PrimaryBtn onClick={() => router.push(`/league/${firstLeague.id}`)}>
                Go to League Dashboard →
              </PrimaryBtn>
            )}
            {isPublic && (
              <button
                onClick={() => router.push(`/leagues?t=${Date.now()}`)}
                style={{ padding: '10px 0', background: 'transparent', border: `1px solid ${C.surf3}`, borderRadius: 8, cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 1.5, color: C.sub, textTransform: 'uppercase' }}
              >
                View in Contest Lobby →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0c1220', border: '1px solid #1e2d47', borderRadius: 12, padding: '24px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #d4a828, transparent)' }} />
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#4a5d7a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
      {children}
    </div>
  );
}

function Spacer() { return <div style={{ height: 24 }} />; }

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: '10px 8px', border: `2px solid ${active ? '#d4a828' : '#1e2d47'}`, borderRadius: 8, cursor: 'pointer', textAlign: 'center', background: active ? 'linear-gradient(135deg, rgba(212,168,40,.15), rgba(212,168,40,.05))' : '#05080f', color: active ? '#f0c94a' : '#7a90b0', fontFamily: "'Oswald', sans-serif", fontSize: 12, letterSpacing: .5, transition: 'all .15s' }}>
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: '100%', padding: '15px', background: disabled ? '#1e2d47' : 'linear-gradient(135deg, #d4a828, #f0c94a)', border: 'none', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 15, letterSpacing: 2, textTransform: 'uppercase', color: disabled ? '#4a5d7a' : '#05080f', transition: 'all .2s' }}>
      {children}
    </button>
  );
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: '15px 24px', background: 'none', border: '1px solid #1e2d47', borderRadius: 8, cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#7a90b0' }}>
      {children}
    </button>
  );
}

function NavRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 8 }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#131d30', border: '1px solid #1e2d47',
  borderRadius: 8, padding: '12px 14px',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 15, color: '#e8edf5',
  transition: 'border-color .15s',
};

const rangeInput: React.CSSProperties = {
  background: '#131d30', border: '1px solid #1e2d47',
  borderRadius: 6, padding: '7px 10px',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 12, color: '#e8edf5', outline: 'none',
};
