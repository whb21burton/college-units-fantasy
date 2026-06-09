'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const C = {
  bg: '#05080f', surf: '#0c1220', surf2: '#131d30', surf3: '#1e2d47',
  gold: '#d4a828', goldLight: '#f0c94a',
  text: '#e8edf5', sub: '#7a90b0', muted: '#4a5d7a',
  green: '#2ecc71', red: '#e74c3c', orange: '#f39c12',
  hdrBg: '#1e2d47', hdrText: '#7a90b0',
};

const ADMIN_EMAIL = 'whb21burton@gmail.com';

type Tab = 'overview' | 'terms' | 'verifications' | 'logs' | 'states';

interface TermsRow {
  user_id: string;
  terms_version: string;
  accepted_at: string;
  ip_address: string;
  email?: string;
}

interface VerificationRow {
  user_id: string;
  type: string;
  status: string;
  verified_at: string;
  dob?: string;
  email?: string;
}

interface LogRow {
  id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  ip_address: string;
  created_at: string;
  email?: string;
}

interface Stats {
  total_users: number;
  terms_accepted: number;
  age_verified: number;
  restricted_states: number;
}

function labelStyle(color: string) {
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10,
    fontFamily: "'Oswald', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase' as const,
    background: `${color}22`, color, border: `1px solid ${color}55`,
  };
}

export default function AdminCompliancePage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [terms, setTerms] = useState<TermsRow[]>([]);
  const [verifs, setVerifs] = useState<VerificationRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [states, setStates] = useState<{ state_code: string; state_name: string; reason: string | null; active: boolean }[]>([]);
  const [statesLoaded, setStatesLoaded] = useState(false);
  const [stateSaving, setStateSaving] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newReason, setNewReason] = useState('');
  const [blockedLogs, setBlockedLogs] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email !== ADMIN_EMAIL) { router.replace('/'); return; }
      setAuthed(true);
      loadStats();
    });
  }, []);

  async function loadStats() {
    const [{ count: totalUsers }, { count: termsCount }, { count: verifsCount }, { count: statesCount }] = await Promise.all([
      supabase.from('wallets').select('*', { count: 'exact', head: true }),
      supabase.from('user_terms_acceptance').select('*', { count: 'exact', head: true }),
      supabase.from('user_verifications').select('*', { count: 'exact', head: true }).eq('status', 'approved').eq('type', 'age'),
      supabase.from('restricted_states').select('*', { count: 'exact', head: true }).eq('active', true),
    ]);
    setStats({
      total_users: totalUsers ?? 0,
      terms_accepted: termsCount ?? 0,
      age_verified: verifsCount ?? 0,
      restricted_states: statesCount ?? 0,
    });
  }

  async function loadTerms() {
    setLoading(true);
    const { data } = await supabase
      .from('user_terms_acceptance')
      .select('user_id, terms_version, accepted_at, ip_address')
      .order('accepted_at', { ascending: false })
      .limit(100);
    setTerms(data ?? []);
    setLoading(false);
  }

  async function loadVerifications() {
    setLoading(true);
    const { data } = await supabase
      .from('user_verifications')
      .select('user_id, type, status, verified_at, dob')
      .order('verified_at', { ascending: false })
      .limit(100);
    setVerifs(data ?? []);
    setLoading(false);
  }

  async function loadLogs() {
    setLoading(true);
    const { data } = await supabase
      .from('compliance_logs')
      .select('id, user_id, action, details, ip_address, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs((data ?? []) as LogRow[]);
    setLoading(false);
  }

  async function loadStates() {
    const res = await fetch('/api/admin/compliance');
    const d = await res.json();
    setStates(d.states ?? []);
    setBlockedLogs(d.logs ?? []);
    setStatesLoaded(true);
  }

  async function toggleState(state_code: string, active: boolean) {
    setStateSaving(state_code);
    await fetch('/api/admin/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle', state_code, active }) });
    setStates(prev => prev.map(s => s.state_code === state_code ? { ...s, active } : s));
    setStateSaving(null);
  }

  async function addState() {
    if (!newCode.trim() || !newName.trim()) return;
    setStateSaving('add');
    await fetch('/api/admin/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upsert', state_code: newCode.toUpperCase(), state_name: newName, reason: newReason || null, active: true }) });
    setNewCode(''); setNewName(''); setNewReason('');
    setStateSaving(null);
    loadStates();
  }

  async function removeState(state_code: string) {
    setStateSaving(state_code);
    await fetch('/api/admin/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', state_code }) });
    setStates(prev => prev.filter(s => s.state_code !== state_code));
    setStateSaving(null);
  }

  function switchTab(t: Tab) {
    setTab(t);
    if (t === 'terms' && terms.length === 0) loadTerms();
    if (t === 'verifications' && verifs.length === 0) loadVerifications();
    if (t === 'logs' && logs.length === 0) loadLogs();
    if (t === 'states' && !statesLoaded) loadStates();
  }

  if (!authed) return null;

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => switchTab(t)}
      style={{
        padding: '8px 20px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        fontFamily: "'Oswald', sans-serif", letterSpacing: 1, textTransform: 'uppercase',
        background: tab === t ? C.gold : C.surf2,
        color: tab === t ? C.bg : C.sub,
      }}
    >
      {label}
    </button>
  );

  const hdr = (label: string) => (
    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.hdrText, padding: '8px 12px', background: C.hdrBg, textTransform: 'uppercase' }}>
      {label}
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: "'Space Grotesk', Inter, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '6px 14px', color: C.sub, cursor: 'pointer', fontSize: 12, fontFamily: "'Oswald', sans-serif" }}>← Back</button>
          <div>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 24, letterSpacing: 2, textTransform: 'uppercase' }}>Compliance Dashboard</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>Terms • Age Verification • Restricted States • Audit Log</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {tabBtn('overview', 'Overview')}
          {tabBtn('terms', 'Terms Acceptance')}
          {tabBtn('verifications', 'Age Verifications')}
          {tabBtn('logs', 'Audit Log')}
          {tabBtn('states', 'State Restrictions')}
        </div>

        {/* Overview */}
        {tab === 'overview' && stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Total Users', value: stats.total_users, color: C.gold },
              { label: 'Terms Accepted', value: stats.terms_accepted, color: C.green },
              { label: 'Age Verified', value: stats.age_verified, color: C.gold },
              { label: 'Restricted States', value: stats.restricted_states, color: C.red },
            ].map(s => (
              <div key={s.label} style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '20px 24px' }}>
                <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 32, color: s.color }}>{s.value}</div>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 1, color: C.muted, textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'overview' && stats && (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '20px 24px' }}>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.muted, textTransform: 'uppercase', marginBottom: 16 }}>Compliance Rate</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Terms Acceptance Rate', value: stats.total_users > 0 ? Math.round(stats.terms_accepted / stats.total_users * 100) : 0, color: C.green },
                { label: 'Age Verification Rate', value: stats.total_users > 0 ? Math.round(stats.age_verified / stats.total_users * 100) : 0, color: C.gold },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: C.sub }}>{r.label}</span>
                    <span style={{ fontSize: 12, color: r.color, fontWeight: 600 }}>{r.value}%</span>
                  </div>
                  <div style={{ height: 6, background: C.surf3, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${r.value}%`, height: '100%', background: r.color, borderRadius: 3, transition: 'width .5s' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Terms Acceptance */}
        {tab === 'terms' && (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 0 }}>
              {['User ID', 'Version', 'Accepted At', 'IP Address'].map(h => (
                <div key={h} style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.hdrText, padding: '8px 12px', background: C.hdrBg, textTransform: 'uppercase' }}>{h}</div>
              ))}
              {loading ? (
                <div style={{ gridColumn: '1/-1', padding: 20, color: C.muted, fontSize: 13 }}>Loading...</div>
              ) : terms.map((t, i) => (
                <>
                  <div key={`uid-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.sub }}>{t.user_id.slice(0, 16)}...</div>
                  <div key={`ver-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}` }}><span style={labelStyle(C.green)}>{t.terms_version}</span></div>
                  <div key={`at-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontSize: 12, color: C.sub }}>{new Date(t.accepted_at).toLocaleDateString()}</div>
                  <div key={`ip-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.muted }}>{t.ip_address}</div>
                </>
              ))}
            </div>
          </div>
        )}

        {/* Age Verifications */}
        {tab === 'verifications' && (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 0 }}>
              {['User ID', 'Type', 'Status', 'Verified At'].map(h => (
                <div key={h} style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.hdrText, padding: '8px 12px', background: C.hdrBg, textTransform: 'uppercase' }}>{h}</div>
              ))}
              {loading ? (
                <div style={{ gridColumn: '1/-1', padding: 20, color: C.muted, fontSize: 13 }}>Loading...</div>
              ) : verifs.map((v, i) => (
                <>
                  <div key={`uid-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.sub }}>{v.user_id.slice(0, 16)}...</div>
                  <div key={`type-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}` }}><span style={labelStyle(C.gold)}>{v.type}</span></div>
                  <div key={`st-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}` }}>
                    <span style={labelStyle(v.status === 'approved' ? C.green : v.status === 'rejected' ? C.red : C.orange)}>{v.status}</span>
                  </div>
                  <div key={`at-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontSize: 12, color: C.sub }}>{v.verified_at ? new Date(v.verified_at).toLocaleDateString() : '—'}</div>
                </>
              ))}
            </div>
          </div>
        )}

        {/* State Restrictions */}
        {tab === 'states' && (
          <div>
            {/* Add state form */}
            <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, padding: '18px 20px', marginBottom: 20 }}>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 12 }}>Add Restricted State</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code (e.g. NY)" maxLength={2}
                  style={{ width: 72, background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: "'Oswald', sans-serif", fontSize: 12, outline: 'none', textTransform: 'uppercase' }} />
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full state name"
                  style={{ flex: 1, minWidth: 140, background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: "'Oswald', sans-serif", fontSize: 12, outline: 'none' }} />
                <input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="Reason (optional)"
                  style={{ flex: 2, minWidth: 180, background: C.surf2, border: `1px solid ${C.surf3}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: "'Oswald', sans-serif", fontSize: 12, outline: 'none' }} />
                <button onClick={addState} disabled={stateSaving === 'add' || !newCode || !newName}
                  style={{ padding: '8px 20px', background: C.gold, border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: "'Anton', sans-serif", fontSize: 12, letterSpacing: 1, color: C.bg, opacity: (!newCode || !newName) ? 0.5 : 1 }}>
                  {stateSaving === 'add' ? '…' : 'ADD'}
                </button>
              </div>
            </div>

            {/* State list */}
            <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
              {hdr('Restricted States')}
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 90px 90px', gap: 0 }}>
                {['Code', 'State', 'Reason', 'Status', ''].map(h => (
                  <div key={h} style={{ fontFamily: "'Oswald', sans-serif", fontSize: 9, letterSpacing: 2, color: C.hdrText, padding: '8px 12px', background: C.hdrBg, textTransform: 'uppercase' }}>{h}</div>
                ))}
                {states.length === 0 ? (
                  <div style={{ gridColumn: '1/-1', padding: '20px 12px', color: C.muted, fontFamily: "'Oswald', sans-serif", fontSize: 12 }}>No restricted states configured</div>
                ) : states.map((s, i) => (
                  <>
                    <div key={`c${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontFamily: "'Anton', sans-serif", fontSize: 14, color: C.gold }}>{s.state_code}</div>
                    <div key={`n${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontFamily: "'Oswald', sans-serif", fontSize: 12, color: C.text }}>{s.state_name}</div>
                    <div key={`r${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontFamily: "'Oswald', sans-serif", fontSize: 10, color: C.muted }}>{s.reason ?? '—'}</div>
                    <div key={`t${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}` }}>
                      <button onClick={() => toggleState(s.state_code, !s.active)} disabled={stateSaving === s.state_code}
                        style={{ padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1,
                          background: s.active ? 'rgba(240,58,90,.15)' : 'rgba(21,198,120,.15)',
                          color: s.active ? C.red : C.green }}>
                        {stateSaving === s.state_code ? '…' : s.active ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>
                    <div key={`d${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}` }}>
                      <button onClick={() => removeState(s.state_code)} disabled={stateSaving === s.state_code}
                        style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.surf3}`, cursor: 'pointer', background: 'none', fontFamily: "'Oswald', sans-serif", fontSize: 10, color: C.muted }}>
                        Remove
                      </button>
                    </div>
                  </>
                ))}
              </div>
            </div>

            {/* Blocked attempts */}
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 10 }}>Recent Blocked Attempts ({blockedLogs.length})</div>
            <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, overflow: 'hidden' }}>
              {blockedLogs.length === 0 ? (
                <div style={{ padding: '20px 12px', color: C.muted, fontFamily: "'Oswald', sans-serif", fontSize: 12 }}>No blocked attempts yet</div>
              ) : blockedLogs.map((log: any, i: number) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: `1px solid ${C.surf3}`, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, color: C.red, minWidth: 40 }}>{log.event_data?.stateCode ?? '??'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, color: C.sub }}>{log.event_data?.route ?? log.event_type} · {log.ip_address}</div>
                    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 9, color: C.muted, marginTop: 2 }}>user: {log.user_id?.slice(0, 8)}… · {new Date(log.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Log */}
        {tab === 'logs' && (
          <div style={{ background: C.surf, border: `1px solid ${C.surf3}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr 1fr', gap: 0 }}>
              {['User ID', 'Action', 'Details', 'IP', 'Time'].map(h => (
                <div key={h} style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 2, color: C.hdrText, padding: '8px 12px', background: C.hdrBg, textTransform: 'uppercase' }}>{h}</div>
              ))}
              {loading ? (
                <div style={{ gridColumn: '1/-1', padding: 20, color: C.muted, fontSize: 13 }}>Loading...</div>
              ) : logs.map((l, i) => (
                <>
                  <div key={`uid-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.sub }}>{l.user_id.slice(0, 16)}...</div>
                  <div key={`act-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}` }}>
                    <span style={labelStyle(l.action.includes('accept') || l.action.includes('verif') ? C.green : C.gold)}>{l.action}</span>
                  </div>
                  <div key={`det-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontSize: 11, color: C.muted, fontFamily: "'IBM Plex Mono', monospace", wordBreak: 'break-all' }}>
                    {JSON.stringify(l.details)}
                  </div>
                  <div key={`ip-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.muted }}>{l.ip_address}</div>
                  <div key={`at-${i}`} style={{ padding: '10px 12px', borderTop: `1px solid ${C.surf3}`, fontSize: 11, color: C.sub }}>{new Date(l.created_at).toLocaleString()}</div>
                </>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
