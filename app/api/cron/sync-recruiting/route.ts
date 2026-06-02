import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const BASE   = 'https://apinext.collegefootballdata.com'
const SEASON = 2025

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

    // TWO calls — recruits + transfer portal
    const [recruits, transfers] = await Promise.all([
      cfbdGet('/recruiting/players', { year: SEASON, classification: 'HighSchool' }),
      cfbdGet('/player/portal', { year: SEASON }),
    ])

    console.log('[sync-recruiting] recruits:', recruits.length, 'transfers:', transfers.length)

    const rows: any[] = []

    // Recruiting commits
    for (const r of recruits) {
      if (!r.name) continue
      rows.push({
        season:      SEASON,
        type:        'recruit',
        player_name: r.name,
        position:    r.position ?? null,
        stars:       r.stars ?? null,
        rating:      r.rating ?? null,
        from_school: null,
        to_school:   r.committedTo ?? null,
        from_conf:   null,
        to_conf:     null,
        status:      r.committedTo ? 'committed' : 'transfer_portal',
        commit_date: r.commitDate ? new Date(r.commitDate).toISOString().split('T')[0] : null,
        hometown:    r.city ?? null,
        home_state:  r.stateProvince ?? null,
        updated_at:  new Date().toISOString(),
      })
    }

    // Transfer portal
    for (const t of transfers) {
      if (!t.firstName && !t.lastName) continue
      const name = [t.firstName, t.lastName].filter(Boolean).join(' ').trim()
      rows.push({
        season:      SEASON,
        type:        'transfer',
        player_name: name,
        position:    t.position ?? null,
        stars:       t.stars ?? null,
        rating:      t.rating ?? null,
        from_school: t.origin ?? null,
        to_school:   t.destination ?? null,
        from_conf:   null,
        to_conf:     null,
        status:      t.destination ? 'committed' : 'transfer_portal',
        commit_date: t.transferDate ? new Date(t.transferDate).toISOString().split('T')[0] : null,
        hometown:    null,
        home_state:  null,
        updated_at:  new Date().toISOString(),
      })
    }

    if (rows.length) {
      // Upsert in batches of 500
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin
          .from('recruiting_news')
          .upsert(rows.slice(i, i + 500), { onConflict: 'id' })
        if (error) console.error('[sync-recruiting] batch error:', error.message)
      }
    }

    await admin.from('data_refresh_log').insert({
      job_name: `syncRecruiting:${SEASON}`,
      status: 'success',
      records_updated: rows.length,
    })

    return NextResponse.json({ success: true, season: SEASON, recruits: recruits.length, transfers: transfers.length, total: rows.length })
  } catch (err: any) {
    console.error('[sync-recruiting]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
