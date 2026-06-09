import { createAdminClient } from './supabase-server';

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'Washington D.C.',
};

export function getStateName(code: string): string {
  return STATE_NAMES[code.toUpperCase()] ?? code;
}

/**
 * Resolve a US state code from an IP address via ipapi.co.
 * Returns null for private IPs, non-US IPs, or on any error (fail open).
 */
export async function getStateFromIP(ip: string): Promise<string | null> {
  if (!ip) return null;
  // Private / loopback — skip in local dev
  if (
    ip === '127.0.0.1' || ip === '::1' ||
    ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.')
  ) return null;

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { 'User-Agent': 'college-units-fantasy/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    if (data.country_code !== 'US') return null;
    return (data.region_code as string) ?? null;
  } catch {
    return null;
  }
}

export async function checkStateRestriction(
  stateCode: string,
): Promise<{ restricted: boolean; stateName: string; reason: string | null }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('restricted_states')
    .select('state_name, reason')
    .eq('state_code', stateCode.toUpperCase())
    .eq('active', true)
    .single();

  return {
    restricted: !!data,
    stateName: (data?.state_name as string) ?? getStateName(stateCode),
    reason: (data?.reason as string) ?? null,
  };
}

export async function logComplianceEvent(
  userId: string,
  eventType: string,
  eventData: Record<string, unknown>,
  ip: string,
  userAgent: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('compliance_logs').insert({
      user_id:    userId,
      event_type: eventType,
      event_data: eventData,
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch {
    // Non-fatal — never block a request on a logging failure
  }
}
