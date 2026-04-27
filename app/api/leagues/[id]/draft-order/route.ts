import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { orderedUserIds } = body as { orderedUserIds?: string[] }
  if (!Array.isArray(orderedUserIds) || orderedUserIds.length === 0) {
    return NextResponse.json({ error: 'Invalid order' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify user is commissioner
  const { data: league } = await admin
    .from('leagues')
    .select('commissioner_id, settings')
    .eq('id', params.id)
    .single()

  if (!league || league.commissioner_id !== user.id) {
    return NextResponse.json({ error: 'Only commissioner can set draft order' }, { status: 403 })
  }

  // Load members to get team names
  const { data: members } = await admin
    .from('league_members')
    .select('user_id, team_name')
    .eq('league_id', params.id)

  const memberMap: Record<string, string> = {}
  for (const m of members ?? []) {
    memberMap[m.user_id] = m.team_name
  }

  // Build draft_order in the full object format expected by draft/standings code
  const draftOrder = orderedUserIds.map((userId, i) => ({
    type: 'human' as const,
    userId,
    teamName: memberMap[userId] ?? userId,
    slot: i + 1,
  }))

  // Preserve any CPU teams from existing settings (for public/weekly leagues)
  const existingOrder: any[] = league.settings?.draft_order ?? []
  const cpuEntries = existingOrder
    .filter((t: any) => t.type === 'cpu')
    .map((t: any, i: number) => ({ ...t, slot: draftOrder.length + i + 1 }))

  const { error } = await admin
    .from('leagues')
    .update({
      settings: {
        ...(league.settings ?? {}),
        draft_order: [...draftOrder, ...cpuEntries],
      },
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
