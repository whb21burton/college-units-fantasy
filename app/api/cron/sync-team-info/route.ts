import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const BASE = 'https://apinext.collegefootballdata.com'

async function cfbdGet(path: string, params: Record<string, string | number> = {}) {
  const key = process.env.CFBD_API_KEY
  if (!key) throw new Error('CFBD_API_KEY not set')
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`CFBD ${path} HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // ONE call — gets all teams with colors, logos, stadium, IDs
    const teams = await cfbdGet('/teams')
    console.log('[sync-team-info] teams received:', teams.length)

    const rows = teams
      .filter((t: any) => t.school)
      .map((t: any) => ({
        school:           t.school,
        cfbd_id:          t.id ?? null,
        abbreviation:     t.abbreviation ?? null,
        mascot:           t.mascot ?? null,
        primary_color:    t.color ?? null,
        secondary_color:  t.alternateColor ?? null,
        logo_url:         t.logos?.[0] ?? null,
        conference:       t.conference ?? null,
        division:         t.classification === 'fcs' ? 'FCS' : 'FBS',
        stadium_name:     t.location?.name ?? null,
        stadium_capacity: t.location?.capacity ?? null,
        city:             t.location?.city ?? null,
        state:            t.location?.state ?? null,
        is_active:        true,
        updated_at:       new Date().toISOString(),
      }))

    // Upsert into cached_teams (existing table)
    const { error: teamsErr } = await admin
      .from('cached_teams')
      .upsert(rows, { onConflict: 'school' })
    if (teamsErr) throw teamsErr

    // Also upsert into team_info (new table)
    const { error: infoErr } = await admin
      .from('team_info')
      .upsert(rows, { onConflict: 'school' })
    if (infoErr) throw infoErr

    await admin.from('data_refresh_log').insert({
      job_name: 'syncTeamInfo',
      status: 'success',
      records_updated: rows.length,
    })

    return NextResponse.json({ success: true, updated: rows.length })
  } catch (err: any) {
    console.error('[sync-team-info]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
