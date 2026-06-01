import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = createAdminClient()

    // Try cache first — use logo_url (actual column name)
    const { data: cached } = await db
      .from('cached_teams')
      .select('school, logo_url')
      .not('logo_url', 'is', null)

    if (cached && cached.length > 0) {
      // Aliases: CONFERENCES canonical name → CFBD school name
      const LOGO_ALIASES: Record<string, string> = {
        'Cal':               'California',
        'UConn':             'Connecticut',
        'NC State':          'NC State',
        'Ole Miss':          'Mississippi',
        'SMU':               'Southern Methodist',
        'App State':         'Appalachian State',
        'Miami':             'Miami (FL)',
        'Miami (Ohio)':      'Miami (OH)',
        'Pitt':              'Pittsburgh',
        'Hawaii':            "Hawai'i",
        'UTSA':              'UT San Antonio',
        'UMass':             'Massachusetts',
        'Southern Miss':     'Southern Mississippi',
        'Louisiana':         'Louisiana Lafayette',
        'UL Monroe':         'Louisiana Monroe',
        'FIU':               'Florida International',
        'FAU':               'Florida Atlantic',
        'UTEP':              'Texas-El Paso',
        'USF':               'South Florida',
        'UAB':               'Alabama-Birmingham',
        'UNT':               'North Texas',
      }

      const logos: Record<string, string> = {}
      for (const t of cached) {
        if (t.school && t.logo_url) logos[t.school] = t.logo_url
      }

      // Add aliases so CONFERENCES names resolve to logos
      for (const [confName, cfbdName] of Object.entries(LOGO_ALIASES)) {
        if (!logos[confName] && logos[cfbdName]) {
          logos[confName] = logos[cfbdName]
        }
      }
      return NextResponse.json({ logos })
    }

    // Cache miss — fetch from CFBD and store
    const apiKey = process.env.CFBD_API_KEY
    if (!apiKey) return NextResponse.json({ logos: {} })

    const res = await fetch('https://apinext.collegefootballdata.com/teams', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      console.error('[team-logos] CFBD error:', res.status)
      return NextResponse.json({ logos: {} })
    }

    const teams: any[] = await res.json()
    const rows = teams
      .filter((t: any) => t.school && (t.logos?.[0] || t.logo))
      .map((t: any) => ({
        school:      t.school,
        logo_url:    t.logos?.[0] ?? t.logo,
        abbreviation: t.abbreviation ?? null,
        conference:  t.conference ?? null,
        updated_at:  new Date().toISOString(),
      }))

    if (rows.length > 0) {
      await db.from('cached_teams').upsert(rows, { onConflict: 'school' })
    }

    const logos: Record<string, string> = {}
    for (const r of rows) logos[r.school] = r.logo_url

    const LOGO_ALIASES2: Record<string, string> = {
      'Cal':               'California',
      'UConn':             'Connecticut',
      'Ole Miss':          'Mississippi',
      'SMU':               'Southern Methodist',
      'App State':         'Appalachian State',
      'Miami':             'Miami (FL)',
      'Miami (Ohio)':      'Miami (OH)',
      'Pitt':              'Pittsburgh',
      'Hawaii':            "Hawai'i",
      'UTSA':              'UT San Antonio',
      'UMass':             'Massachusetts',
      'Southern Miss':     'Southern Mississippi',
      'Louisiana':         'Louisiana Lafayette',
      'UL Monroe':         'Louisiana Monroe',
      'FIU':               'Florida International',
      'FAU':               'Florida Atlantic',
      'UTEP':              'Texas-El Paso',
      'USF':               'South Florida',
      'UAB':               'Alabama-Birmingham',
      'UNT':               'North Texas',
    }
    for (const [confName, cfbdName] of Object.entries(LOGO_ALIASES2)) {
      if (!logos[confName] && logos[cfbdName]) logos[confName] = logos[cfbdName]
    }
    return NextResponse.json({ logos })
  } catch (err: any) {
    console.error('[team-logos]', err.message)
    return NextResponse.json({ logos: {} })
  }
}
