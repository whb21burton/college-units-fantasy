import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = createAdminClient()

    // Try cache first — cached_teams has logo_url column
    const { data: cached } = await db
      .from('cached_teams')
      .select('school, logo_url')
      .not('logo_url', 'is', null)

    if (cached && cached.length > 0) {
      const logos: Record<string, string> = {}
      for (const t of cached) {
        if (t.school && t.logo_url) logos[t.school] = t.logo_url
      }
      return NextResponse.json({ logos })
    }

    // Cache miss — fetch from CFBD once and store
    const apiKey = process.env.CFBD_API_KEY
    if (!apiKey) return NextResponse.json({ logos: {} })

    const res = await fetch('https://apinext.collegefootballdata.com/teams', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return NextResponse.json({ logos: {} })

    const teams: any[] = await res.json()
    const rows = teams
      .filter((t: any) => t.school && (t.logos?.[0] || t.logo))
      .map((t: any) => ({
        school: t.school,
        logo_url: t.logos?.[0] ?? t.logo,
        conference: t.conference ?? null,
        updated_at: new Date().toISOString(),
      }))

    // Store in cached_teams
    await db.from('cached_teams').upsert(rows, { onConflict: 'school' })

    const logos: Record<string, string> = {}
    for (const r of rows) logos[r.school] = r.logo_url

    return NextResponse.json({ logos })
  } catch (err: any) {
    console.error('[team-logos]', err.message)
    return NextResponse.json({ logos: {} })
  }
}
