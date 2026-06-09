import { NextRequest, NextResponse } from 'next/server';
import { getStateFromIP, checkStateRestriction, getStateName } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '';

  const stateCode = await getStateFromIP(ip);
  if (!stateCode) {
    return NextResponse.json({ stateCode: null, stateName: null, restricted: false, reason: null });
  }

  const { restricted, stateName, reason } = await checkStateRestriction(stateCode);
  return NextResponse.json({
    stateCode,
    stateName: stateName ?? getStateName(stateCode),
    restricted,
    reason,
  });
}
