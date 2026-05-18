'use client';

import { useEffect, useState } from 'react';
import LegalPageLayout, { LegalSection } from '@/components/legal/LegalPageLayout';
import type { Section } from '@/components/legal/LegalPageLayout';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const sections: Section[] = [
  { id: 'overview', title: '1. Overview' },
  { id: 'restricted', title: '2. Restricted States' },
  { id: 'free-to-play', title: '3. Free-to-Play' },
  { id: 'updates', title: '4. Legal Updates' },
];

interface RestrictedState {
  state_code: string;
  state_name: string;
  reason: string;
  active: boolean;
}

export default function StateRestrictionsPage() {
  const [states, setStates] = useState<RestrictedState[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    supabase
      .from('restricted_states')
      .select('state_code, state_name, reason, active')
      .eq('active', true)
      .order('state_name')
      .then(({ data }) => {
        setStates(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <LegalPageLayout title="Eligible States" lastUpdated="May 18, 2026" sections={sections}>
      <LegalSection id="overview" title="1. Overview">
        <p>Paid fantasy sports contests are regulated at the state level in the United States. The legality of daily fantasy sports (DFS) varies by state, and CUF is required to restrict paid contest access in certain jurisdictions.</p>
        <p>Your eligibility to participate in paid contests is determined by your physical location at the time of contest entry, not your state of residence. If you travel to a restricted state, you will not be able to enter paid contests while located there.</p>
        <p>Free-to-play contests (no entry fee, no real money prizes) are available in all states unless otherwise prohibited by local law.</p>
      </LegalSection>

      <LegalSection id="restricted" title="2. Restricted States">
        <p>The following states currently restrict or prohibit paid daily fantasy sports contests. Residents of these states may not participate in paid contests on CUF:</p>
        {loading ? (
          <div style={{ color: '#7a90b0', fontSize: 13, padding: '12px 0' }}>Loading state restrictions...</div>
        ) : states.length === 0 ? (
          <div style={{ background: 'rgba(46,204,113,.08)', border: '1px solid rgba(46,204,113,.2)', borderRadius: 8, padding: '14px 16px', color: '#2ecc71', fontSize: 13 }}>
            No states are currently restricted. CUF accepts paid contest entries from all U.S. states.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {states.map(s => (
              <div key={s.state_code} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(231,76,60,.06)', border: '1px solid rgba(231,76,60,.2)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ minWidth: 40, fontFamily: "'Anton', sans-serif", fontSize: 16, letterSpacing: 1, color: '#e74c3c' }}>{s.state_code}</div>
                <div>
                  <div style={{ fontWeight: 600, color: '#e8edf5', fontSize: 14 }}>{s.state_name}</div>
                  <div style={{ color: '#7a90b0', fontSize: 12, marginTop: 2 }}>{s.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </LegalSection>

      <LegalSection id="free-to-play" title="3. Free-to-Play">
        <p>Users in restricted states may still access free-to-play contests and the full CUF platform experience, including:</p>
        <ul>
          <li>Draft simulations and practice leagues</li>
          <li>Free-to-play weekly contests (no entry fee required)</li>
          <li>All platform features except paid contest entry and real-money deposits</li>
        </ul>
        <p>We are committed to expanding our paid contest availability as state regulations evolve. We actively monitor legislative developments in restricted states and will update our eligibility list accordingly.</p>
      </LegalSection>

      <LegalSection id="updates" title="4. Legal Updates">
        <p>The landscape for daily fantasy sports regulation is constantly evolving. New legislation may open or close markets at any time. CUF monitors regulatory developments in all U.S. states and territories and updates this page accordingly.</p>
        <p>If your state recently passed legislation permitting DFS and you believe it should be removed from the restricted list, please contact us at legal@collegeunitsfantasy.com with reference to the relevant legislation.</p>
        <p>This list was last verified by our legal team on May 18, 2026. Users are responsible for ensuring they are in an eligible location when entering paid contests. CUF is not liable for entry fees submitted from restricted jurisdictions — any such entries will be refunded if detected.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
