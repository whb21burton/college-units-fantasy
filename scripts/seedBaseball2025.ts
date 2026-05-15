/*
 * ============================================================
 * SQL TO RUN IN SUPABASE BEFORE SEEDING
 * ============================================================
 *
 * -- tournament_matchups
 * CREATE TABLE IF NOT EXISTS public.tournament_matchups (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   contest_id uuid NOT NULL REFERENCES public.bracket_contests(id) ON DELETE CASCADE,
 *   region text NOT NULL,
 *   round text NOT NULL CHECK (round IN ('regional_winners','regional_losers','regional_final','super_regional','championship')),
 *   matchup_index int NOT NULL,
 *   team1 jsonb,
 *   team2 jsonb,
 *   winner jsonb,
 *   series_result text CHECK (series_result IN ('2-0','2-1')),
 *   status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','completed')),
 *   created_at timestamptz NOT NULL DEFAULT now()
 * );
 *
 * ALTER TABLE public.tournament_matchups ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "tournament_matchups: public read"
 *   ON public.tournament_matchups FOR SELECT USING (true);
 *
 * CREATE POLICY "tournament_matchups: service role write"
 *   ON public.tournament_matchups FOR ALL USING (auth.role() = 'service_role');
 *
 * -- user_bracket_entries
 * CREATE TABLE IF NOT EXISTS public.user_bracket_entries (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   contest_id uuid NOT NULL REFERENCES public.bracket_contests(id) ON DELETE CASCADE,
 *   user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   entry_name text NOT NULL DEFAULT 'My Bracket',
 *   total_score int NOT NULL DEFAULT 0,
 *   correct_picks int NOT NULL DEFAULT 0,
 *   is_submitted bool NOT NULL DEFAULT false,
 *   is_locked bool NOT NULL DEFAULT false,
 *   submitted_at timestamptz,
 *   created_at timestamptz NOT NULL DEFAULT now(),
 *   UNIQUE (contest_id, user_id)
 * );
 *
 * ALTER TABLE public.user_bracket_entries ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "user_bracket_entries: owner read"
 *   ON public.user_bracket_entries FOR SELECT USING (auth.uid() = user_id);
 *
 * CREATE POLICY "user_bracket_entries: owner insert"
 *   ON public.user_bracket_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
 *
 * CREATE POLICY "user_bracket_entries: service role all"
 *   ON public.user_bracket_entries FOR ALL USING (auth.role() = 'service_role');
 *
 * CREATE POLICY "user_bracket_entries: public read for leaderboard"
 *   ON public.user_bracket_entries FOR SELECT USING (is_submitted = true);
 *
 * -- user_bracket_picks
 * CREATE TABLE IF NOT EXISTS public.user_bracket_picks (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   entry_id uuid NOT NULL REFERENCES public.user_bracket_entries(id) ON DELETE CASCADE,
 *   matchup_id uuid NOT NULL REFERENCES public.tournament_matchups(id) ON DELETE CASCADE,
 *   picked_team jsonb NOT NULL,
 *   predicted_series text CHECK (predicted_series IN ('2-0','2-1')),
 *   is_correct bool,
 *   points_earned int NOT NULL DEFAULT 0,
 *   created_at timestamptz NOT NULL DEFAULT now(),
 *   UNIQUE (entry_id, matchup_id)
 * );
 *
 * ALTER TABLE public.user_bracket_picks ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "user_bracket_picks: owner read"
 *   ON public.user_bracket_picks FOR SELECT
 *   USING (EXISTS (
 *     SELECT 1 FROM public.user_bracket_entries e
 *     WHERE e.id = entry_id AND e.user_id = auth.uid()
 *   ));
 *
 * CREATE POLICY "user_bracket_picks: owner insert"
 *   ON public.user_bracket_picks FOR INSERT
 *   WITH CHECK (EXISTS (
 *     SELECT 1 FROM public.user_bracket_entries e
 *     WHERE e.id = entry_id AND e.user_id = auth.uid()
 *   ));
 *
 * CREATE POLICY "user_bracket_picks: service role all"
 *   ON public.user_bracket_picks FOR ALL USING (auth.role() = 'service_role');
 *
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface Team {
  id: string
  name: string
  seed: number
  record?: string
  conference?: string
}

interface MatchupSeed {
  region: string
  round: string
  matchup_index: number
  team1: Team | null
  team2: Team | null
}

function makeTeam(id: string, name: string, seed: number, record: string, conference: string): Team {
  return { id, name, seed, record, conference }
}

function makeRegionalMatchups(region: string, t1: Team, t2: Team, t3: Team, t4: Team): MatchupSeed[] {
  // t1=#1, t2=#2, t3=#3, t4=#4
  return [
    // WB Game 1: #1 vs #4
    { region, round: 'regional_winners', matchup_index: 0, team1: t1, team2: t4 },
    // WB Game 2: #2 vs #3
    { region, round: 'regional_winners', matchup_index: 1, team1: t2, team2: t3 },
    // LB Game 3: L1 vs L2 (TBD until G1/G2 complete)
    { region, round: 'regional_losers', matchup_index: 2, team1: null, team2: null },
    // WB Final Game 4: W1 vs W2 (TBD)
    { region, round: 'regional_winners', matchup_index: 3, team1: null, team2: null },
    // LB Final Game 5: LB winner vs WB loser (TBD)
    { region, round: 'regional_losers', matchup_index: 4, team1: null, team2: null },
    // Regional Final Game 6: If needed (TBD)
    { region, round: 'regional_final', matchup_index: 5, team1: null, team2: null },
  ]
}

export async function seed() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Create the bracket contest
  const { data: contest, error: contestErr } = await admin
    .from('bracket_contests')
    .insert({
      name: '2025 NCAA Baseball Tournament',
      sport: 'baseball',
      season: 2025,
      status: 'open',
      entry_fee_cents: 500,
      prize_pool_cents: 0,
      max_entries: 1000,
      entry_count: 0,
      settings: {
        scoring: {
          regional_win: 10,
          super_regional_win: 20,
          championship_win: 40,
          exact_series_bonus: 5,
        },
      },
    })
    .select()
    .single()

  if (contestErr || !contest) {
    throw new Error(`Failed to create contest: ${contestErr?.message}`)
  }

  console.log(`Created contest: ${contest.id}`)

  // 2. Define teams for each regional
  const stillwater = {
    t1: makeTeam('okst-2025', 'Oklahoma State', 1, '44-12', 'Big 12'),
    t2: makeTeam('ark-2025', 'Arkansas', 2, '42-15', 'SEC'),
    t3: makeTeam('msu-2025', 'Missouri State', 3, '39-18', 'MVC'),
    t4: makeTeam('gcu-2025', 'Grand Canyon', 4, '35-22', 'WAC'),
  }

  const batonRouge = {
    t1: makeTeam('lsu-2025', 'LSU', 1, '46-10', 'SEC'),
    t2: makeTeam('tenn-2025', 'Tennessee', 2, '43-14', 'SEC'),
    t3: makeTeam('smiss-2025', 'Southern Miss', 3, '38-20', 'Sun Belt'),
    t4: makeTeam('nich-2025', 'Nicholls', 4, '33-25', 'Southland'),
  }

  const clemson = {
    t1: makeTeam('clem-2025', 'Clemson', 1, '45-11', 'ACC'),
    t2: makeTeam('uga-2025', 'Georgia', 2, '41-16', 'SEC'),
    t3: makeTeam('char-2025', 'Charlotte', 3, '37-21', 'American'),
    t4: makeTeam('harv-2025', 'Harvard', 4, '30-22', 'Ivy League'),
  }

  const coralGables = {
    t1: makeTeam('mia-2025', 'Miami (FL)', 1, '47-9', 'ACC'),
    t2: makeTeam('uf-2025', 'Florida', 2, '43-13', 'SEC'),
    t3: makeTeam('fau-2025', 'FAU', 3, '36-22', 'American'),
    t4: makeTeam('can-2025', 'Canisius', 4, '28-26', 'MAAC'),
  }

  // 3. Build all regional matchups
  const allMatchups: MatchupSeed[] = [
    ...makeRegionalMatchups('stillwater', stillwater.t1, stillwater.t2, stillwater.t3, stillwater.t4),
    ...makeRegionalMatchups('baton_rouge', batonRouge.t1, batonRouge.t2, batonRouge.t3, batonRouge.t4),
    ...makeRegionalMatchups('clemson', clemson.t1, clemson.t2, clemson.t3, clemson.t4),
    ...makeRegionalMatchups('coral_gables', coralGables.t1, coralGables.t2, coralGables.t3, coralGables.t4),
    // Super Regional 1 (Stillwater vs Baton Rouge winner — TBD)
    {
      region: 'super_regional_1',
      round: 'super_regional',
      matchup_index: 0,
      team1: null,
      team2: null,
    },
    // Super Regional 2 (Clemson vs Coral Gables winner — TBD)
    {
      region: 'super_regional_2',
      round: 'super_regional',
      matchup_index: 0,
      team1: null,
      team2: null,
    },
    // Championship
    {
      region: 'championship',
      round: 'championship',
      matchup_index: 0,
      team1: null,
      team2: null,
    },
  ]

  const matchupsToInsert = allMatchups.map(m => ({
    contest_id: contest.id,
    region: m.region,
    round: m.round,
    matchup_index: m.matchup_index,
    team1: m.team1,
    team2: m.team2,
    winner: null,
    series_result: null,
    status: 'upcoming',
  }))

  const { error: matchupErr } = await admin
    .from('tournament_matchups')
    .insert(matchupsToInsert)

  if (matchupErr) {
    throw new Error(`Failed to insert matchups: ${matchupErr.message}`)
  }

  console.log(`Created ${matchupsToInsert.length} matchups`)
  console.log('Seeded successfully')
  console.log(`Contest ID: ${contest.id}`)
  console.log(`Visit: /brackets/${contest.id}`)
}

if (require.main === module) {
  seed().catch(console.error)
}
