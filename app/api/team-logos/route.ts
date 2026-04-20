import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamsParam = searchParams.get('teams') ?? ''
    const teams = teamsParam.split(',').map(t => t.trim()).filter(Boolean)

    const apiKey = process.env.CFBD_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'CFBD_API_KEY not set' }, { status: 500 })
    }

    // Fetch all teams from CFBD
    const res = await fetch('https://apinext.collegefootballdata.com/teams', {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 86400 }, // cache 24 hours
    })

    if (!res.ok) {
      return NextResponse.json({ error: `CFBD error ${res.status}` }, { status: 500 })
    }

    const allTeams: any[] = await res.json()

    // Build logo map: school name → logo URL
    const logoMap: Record<string, string> = {}
    for (const team of allTeams) {
      const name = team.school ?? team.name ?? ''
      const logo = team.logos?.[0] ?? team.logo ?? null
      if (name && logo) logoMap[name] = logo
    }

    // If specific teams requested, filter to those
    // Otherwise return all logos
    if (teams.length > 0) {
      const filtered: Record<string, string> = {}
      for (const t of teams) {
        if (logoMap[t]) filtered[t] = logoMap[t]
      }
      return NextResponse.json({ logos: filtered })
    }

    return NextResponse.json({ logos: logoMap })
  } catch (err: any) {
    console.error('[team-logos] error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
