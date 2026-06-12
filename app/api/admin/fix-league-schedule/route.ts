/**
 * POST /api/admin/fix-league-schedule
 *
 * One-time route: generates and saves the 11-week round-robin schedule for
 * league 47f94e6b-35b2-401e-b936-cb886cf768c3.
 *
 * Safe to call again — it just overwrites schedule + draft_order in settings.
 * Admin-only.
 */
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase-server';
import { generateSchedule } from '@/lib/scheduleEngine';

export const dynamic = 'force-dynamic';

const LEAGUE_ID  = '47f94e6b-35b2-401e-b936-cb886cf768c3';
const ADMIN_EMAIL = 'whb21burton@gmail.com';
const HUMAN_ID   = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e';

// Teams in slot order. CPUs identified by name, human by user_id.
const DRAFT_ORDER = [
  { type: 'cpu',   teamName: 'CPU Bot 1',  slot: 1  },
  { type: 'cpu',   teamName: 'CPU Bot 2',  slot: 2  },
  { type: 'cpu',   teamName: 'CPU Bot 3',  slot: 3  },
  { type: 'cpu',   teamName: 'CPU Bot 4',  slot: 4  },
  { type: 'cpu',   teamName: 'CPU Bot 5',  slot: 5  },
  { type: 'cpu',   teamName: 'CPU Bot 6',  slot: 6  },
  { type: 'cpu',   teamName: 'CPU Bot 7',  slot: 7  },
  { type: 'cpu',   teamName: 'CPU Bot 8',  slot: 8  },
  { type: 'cpu',   teamName: 'CPU Bot 9',  slot: 9  },
  { type: 'cpu',   teamName: 'CPU Bot 10', slot: 10 },
  { type: 'human', teamName: 'bbb', userId: HUMAN_ID, slot: 11 },
];

// IDs passed to generateSchedule: userId for humans, teamName for CPUs
const TEAM_IDS = DRAFT_ORDER.map(t => (t as any).userId ?? t.teamName);

export async function POST() {
  // Auth: admin session only
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch existing settings to preserve other fields
  const { data: league, error: fetchErr } = await admin
    .from('leagues')
    .select('settings')
    .eq('id', LEAGUE_ID)
    .single();

  if (fetchErr || !league) {
    return NextResponse.json({ error: fetchErr?.message ?? 'League not found' }, { status: 404 });
  }

  const schedule = generateSchedule(TEAM_IDS, 11);

  const { error: updateErr } = await admin
    .from('leagues')
    .update({
      settings: {
        ...(league.settings ?? {}),
        draft_order: DRAFT_ORDER,
        schedule,
      },
    })
    .eq('id', LEAGUE_ID);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    leagueId: LEAGUE_ID,
    teams: TEAM_IDS,
    scheduleGames: schedule.length,
    weeks: 11,
    sample: schedule.slice(0, 6),
  });
}
